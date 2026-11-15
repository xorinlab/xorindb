import { EventEmitter } from './events/emitter';
import { Query } from './query/query';
import { KeyCompressor } from './schema/compression';
import { MigrationEngine, MigrationStrategies } from './schema/migration';
import { CollectionSchema, validateDocumentAgainstSchema } from './schema/validator';
import { SyncEngine } from './sync';
import {
  BaseDocument,
  CollectionOptions,
  DocumentWithMeta,
  FilterQuery,
  PrimaryKey,
  QueryOptions,
  StorageAdapter,
  SyncOptions
} from './types';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class Collection<T extends BaseDocument> {
  private name: string;
  private storage: StorageAdapter;
  private emitter: EventEmitter;
  private schema?: CollectionSchema<T>;
  private migrationStrategies?: MigrationStrategies;
  private keyCompressor: KeyCompressor<T>;
  private syncEngine: SyncEngine<T> | null = null;
  private migrationPromise: Promise<void> | null = null;

  constructor(name: string, storage: StorageAdapter, emitter: EventEmitter, options?: CollectionOptions<T>) {
    this.name = name;
    this.storage = storage;
    this.emitter = emitter;
    this.schema = options?.schema;
    this.migrationStrategies = options?.migrationStrategies;
    this.keyCompressor = new KeyCompressor<T>(this.schema);

    // Register single and compound indexes to storage adapter if supported
    if (this.schema?.indexes && 'setIndexes' in this.storage) {
      (this.storage as any).setIndexes(this.name, this.schema.indexes);
    }

    if (this.schema?.version && this.migrationStrategies) {
      const migrator = new MigrationEngine<T>(this);
      this.migrationPromise = migrator.runMigration(
        this.schema.version,
        this.migrationStrategies
      );
    }
  }

  /**
   * Ensures that any pending schema migrations have completed before proceeding.
   */
  async ensureMigrated(): Promise<void> {
    if (this.migrationPromise) {
      await this.migrationPromise;
    }
  }

  getSchema(): CollectionSchema<T> | undefined {
    return this.schema;
  }

  getKeyCompressor(): KeyCompressor<T> {
    return this.keyCompressor;
  }

  getName(): string {
    return this.name;
  }

  getStorage(): StorageAdapter {
    return this.storage;
  }

  getEmitter(): EventEmitter {
    return this.emitter;
  }

  getPrimaryKeyField(): string {
    return (this.schema?.primaryKey as string) || 'id';
  }

  private resolveDocumentId(data: Record<string, unknown>): string {
    const pkField = this.getPrimaryKeyField();
    const customVal = data[pkField];
    if (customVal !== undefined && customVal !== null) {
      return String(customVal);
    }
    if (data.id !== undefined && data.id !== null) {
      return String(data.id);
    }
    const generated = generateUUID();
    data[pkField] = generated;
    return generated;
  }

  async insert(data: Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }): Promise<DocumentWithMeta<T>> {
    await this.ensureMigrated();

    // Validate schema
    if (this.schema) {
      validateDocumentAgainstSchema(data as Record<string, unknown>, this.schema);
    }

    const docObj = { ...(data as unknown as Record<string, unknown>) };
    const id = this.resolveDocumentId(docObj);

    const doc: DocumentWithMeta<T> = {
      ...(docObj as unknown as T),
      id,
      _deleted: false,
      _updatedAt: Date.now()
    };

    // Compress keys before persisting to storage if keyCompression is enabled
    const storageDoc = this.keyCompressor.isCompressionEnabled()
      ? (this.keyCompressor.compress(doc as unknown as Record<string, unknown>) as unknown as DocumentWithMeta<T>)
      : doc;

    await this.storage.put(this.name, storageDoc);

    this.emitter.emit(this.name, {
      collection: this.name,
      type: 'insert',
      id,
      doc
    });

    return doc;
  }

  async insertMany(docs: Array<Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }>): Promise<DocumentWithMeta<T>[]> {
    await this.ensureMigrated();

    if (this.schema) {
      for (const item of docs) {
        validateDocumentAgainstSchema(item as Record<string, unknown>, this.schema);
      }
    }

    const prepared: DocumentWithMeta<T>[] = docs.map((item) => {
      const docObj = { ...(item as unknown as Record<string, unknown>) };
      const id = this.resolveDocumentId(docObj);
      return {
        ...(docObj as unknown as T),
        id,
        _deleted: false,
        _updatedAt: Date.now()
      };
    });

    const storageDocs = this.keyCompressor.isCompressionEnabled()
      ? prepared.map((d) => this.keyCompressor.compress(d as unknown as Record<string, unknown>) as unknown as DocumentWithMeta<T>)
      : prepared;

    await this.storage.putBatch(this.name, storageDocs);

    for (const doc of prepared) {
      this.emitter.emit(this.name, {
        collection: this.name,
        type: 'insert',
        id: doc.id,
        doc
      });
    }

    return prepared;
  }

  async findById(id: PrimaryKey): Promise<DocumentWithMeta<T> | null> {
    await this.ensureMigrated();
    const raw = await this.storage.get<T>(this.name, id);
    if (!raw || raw._deleted) return null;

    const doc = this.keyCompressor.isCompressionEnabled()
      ? (this.keyCompressor.decompress(raw as unknown as Record<string, unknown>) as unknown as DocumentWithMeta<T>)
      : raw;

    return doc;
  }

  find(filter?: FilterQuery<T>, options?: QueryOptions<T>): Query<T> {
    return new Query<T>(this, filter, options);
  }

  async update(id: PrimaryKey, patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<DocumentWithMeta<T>> {
    const existing = await this.storage.get<T>(this.name, id);
    if (!existing || existing._deleted) {
      throw new Error(`Document with id "${id}" does not exist in collection "${this.name}".`);
    }

    const updated: DocumentWithMeta<T> = {
      ...existing,
      ...patch,
      _updatedAt: Date.now()
    };

    if (this.schema) {
      validateDocumentAgainstSchema(updated as Record<string, unknown>, this.schema);
    }

    const storageUpdated = this.keyCompressor.isCompressionEnabled()
      ? (this.keyCompressor.compress(updated as unknown as Record<string, unknown>) as unknown as DocumentWithMeta<T>)
      : updated;

    await this.storage.put(this.name, storageUpdated);

    this.emitter.emit(this.name, {
      collection: this.name,
      type: 'update',
      id,
      doc: updated,
      previous: existing
    });

    return updated;
  }

  async delete(id: PrimaryKey, hardDelete: boolean = false): Promise<void> {
    const existing = await this.storage.get<T>(this.name, id);
    if (!existing) return;

    if (hardDelete) {
      await this.storage.delete(this.name, id);
    } else {
      // Soft-delete / tombstone for reliable sync
      const deletedDoc: DocumentWithMeta<T> = {
        ...existing,
        _deleted: true,
        _updatedAt: Date.now()
      };
      await this.storage.put(this.name, deletedDoc);
    }

    this.emitter.emit(this.name, {
      collection: this.name,
      type: 'delete',
      id,
      previous: existing
    });
  }

  sync(options: SyncOptions<T>): SyncEngine<T> {
    if (this.syncEngine) {
      this.syncEngine.stop();
    }
    this.syncEngine = new SyncEngine<T>(this, options);
    this.syncEngine.start().catch(console.error);
    return this.syncEngine;
  }
}
