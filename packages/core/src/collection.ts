import { EventEmitter } from './events/emitter';
import { Query } from './query/query';
import { KeyCompressor } from './schema/compression';
import { FieldEncryptor } from './schema/encryption';
import { MigrationEngine, MigrationStrategies } from './schema/migration';
import { CollectionSchema, validateDocumentAgainstSchema } from './schema/validator';
import { SyncEngine } from './sync';
import { prepareDocForStorage, restoreDocFromStorage } from './utils/pipeline';
import { generateUUID } from './utils/uuid';
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

export class Collection<T extends BaseDocument> {
  private name: string;
  private storage: StorageAdapter;
  private emitter: EventEmitter;
  private schema?: CollectionSchema<T>;
  private migrationStrategies?: MigrationStrategies;
  private keyCompressor: KeyCompressor<T>;
  private fieldEncryptor: FieldEncryptor<T>;
  private syncEngine: SyncEngine<T> | null = null;
  private migrationPromise: Promise<void> | null = null;

  constructor(
    name: string,
    storage: StorageAdapter,
    emitter: EventEmitter,
    options?: CollectionOptions<T>,
    password?: string
  ) {
    this.name = name;
    this.storage = storage;
    this.emitter = emitter;
    this.schema = options?.schema;
    this.migrationStrategies = options?.migrationStrategies;
    this.keyCompressor = new KeyCompressor<T>(this.schema);
    this.fieldEncryptor = new FieldEncryptor<T>(password, this.schema);

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

  async ensureMigrated(): Promise<void> {
    if (this.migrationPromise) await this.migrationPromise;
  }

  getSchema(): CollectionSchema<T> | undefined { return this.schema; }
  getName(): string { return this.name; }
  getStorage(): StorageAdapter { return this.storage; }
  getEmitter(): EventEmitter { return this.emitter; }
  getKeyCompressor(): KeyCompressor<T> { return this.keyCompressor; }
  getFieldEncryptor(): FieldEncryptor<T> { return this.fieldEncryptor; }
  getPrimaryKeyField(): string { return (this.schema?.primaryKey as string) || 'id'; }

  private resolveDocumentId(data: Record<string, unknown>): string {
    const pkField = this.getPrimaryKeyField();
    const customVal = data[pkField];
    if (customVal !== undefined && customVal !== null) return String(customVal);
    if (data.id !== undefined && data.id !== null) return String(data.id);
    const generated = generateUUID();
    data[pkField] = generated;
    return generated;
  }

  async insert(data: Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }): Promise<DocumentWithMeta<T>> {
    await this.ensureMigrated();
    if (this.schema) validateDocumentAgainstSchema(data as Record<string, unknown>, this.schema);

    const docObj = { ...(data as unknown as Record<string, unknown>) };
    const id = this.resolveDocumentId(docObj);
    const doc: DocumentWithMeta<T> = {
      ...(docObj as unknown as T),
      id,
      _deleted: false,
      _updatedAt: Date.now()
    };

    const storageDoc = await prepareDocForStorage(doc, this.fieldEncryptor, this.keyCompressor);
    await this.storage.put(this.name, storageDoc);

    this.emitter.emit(this.name, { collection: this.name, type: 'insert', id, doc });
    return doc;
  }

  async insertMany(docs: Array<Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }>): Promise<DocumentWithMeta<T>[]> {
    await this.ensureMigrated();
    if (this.schema) {
      for (const item of docs) validateDocumentAgainstSchema(item as Record<string, unknown>, this.schema);
    }

    const prepared: DocumentWithMeta<T>[] = docs.map((item) => {
      const docObj = { ...(item as unknown as Record<string, unknown>) };
      const id = this.resolveDocumentId(docObj);
      return { ...(docObj as unknown as T), id, _deleted: false, _updatedAt: Date.now() };
    });

    const storageDocs = await Promise.all(
      prepared.map(d => prepareDocForStorage(d, this.fieldEncryptor, this.keyCompressor))
    );
    await this.storage.putBatch(this.name, storageDocs);

    for (const doc of prepared) {
      this.emitter.emit(this.name, { collection: this.name, type: 'insert', id: doc.id, doc });
    }
    return prepared;
  }

  async findById(id: PrimaryKey): Promise<DocumentWithMeta<T> | null> {
    await this.ensureMigrated();
    const raw = await this.storage.get<T>(this.name, id);
    if (!raw || raw._deleted) return null;
    return restoreDocFromStorage(raw, this.fieldEncryptor, this.keyCompressor);
  }

  find(filter?: FilterQuery<T>, options?: QueryOptions<T>): Query<T> {
    return new Query<T>(this, filter, options);
  }

  async update(id: PrimaryKey, patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<DocumentWithMeta<T>> {
    const existing = await this.findById(id);
    if (!existing || existing._deleted) {
      throw new Error(`Document with id "${id}" does not exist in collection "${this.name}".`);
    }

    const updated: DocumentWithMeta<T> = { ...existing, ...patch, _updatedAt: Date.now() };
    if (this.schema) validateDocumentAgainstSchema(updated as Record<string, unknown>, this.schema);

    const storageUpdated = await prepareDocForStorage(updated, this.fieldEncryptor, this.keyCompressor);
    await this.storage.put(this.name, storageUpdated);

    this.emitter.emit(this.name, { collection: this.name, type: 'update', id, doc: updated, previous: existing });
    return updated;
  }

  /**
   * Inserts the document if it does not exist, or updates it if it already exists.
   */
  async upsert(data: Partial<T> & { id?: PrimaryKey; [key: string]: unknown }): Promise<DocumentWithMeta<T>> {
    await this.ensureMigrated();
    const docObj = { ...data };
    const id = this.resolveDocumentId(docObj);
    const existing = await this.findById(id);

    if (!existing) {
      return this.insert(docObj as any);
    }
    return this.update(id, docObj as any);
  }

  /**
   * Modifies an existing document with a mutator function, or inserts the default document if absent.
   * Eliminates race conditions for concurrent atomic updates.
   */
  async incrementalUpsert(
    dataOrId: (Partial<T> & { id?: PrimaryKey; [key: string]: unknown }) | PrimaryKey,
    mutator?: (existingDoc: DocumentWithMeta<T>) => Partial<T> | Promise<Partial<T>>
  ): Promise<DocumentWithMeta<T>> {
    await this.ensureMigrated();

    let id: string;
    let initialDoc: Partial<T> = {};

    if (typeof dataOrId === 'string') {
      id = dataOrId;
    } else {
      const docObj = { ...dataOrId };
      id = this.resolveDocumentId(docObj);
      initialDoc = docObj as Partial<T>;
    }

    const existing = await this.findById(id);
    if (!existing) {
      const baseDoc = { ...initialDoc, id } as DocumentWithMeta<T>;
      const toInsert = mutator ? await mutator(baseDoc) : baseDoc;
      return this.insert({ ...baseDoc, ...toInsert } as any);
    }

    if (mutator) {
      const patch = await mutator(existing);
      return this.update(id, patch as any);
    }
    return this.update(id, initialDoc as any);
  }

  async delete(id: PrimaryKey, hardDelete: boolean = false): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) return;

    if (hardDelete) {
      await this.storage.delete(this.name, id);
    } else {
      const deletedDoc: DocumentWithMeta<T> = { ...existing, _deleted: true, _updatedAt: Date.now() };
      const storageDoc = await prepareDocForStorage(deletedDoc, this.fieldEncryptor, this.keyCompressor);
      await this.storage.put(this.name, storageDoc);
    }

    this.emitter.emit(this.name, { collection: this.name, type: 'delete', id, previous: existing });
  }

  sync(options: SyncOptions<T>): SyncEngine<T> {
    if (this.syncEngine) this.syncEngine.stop();
    this.syncEngine = new SyncEngine<T>(this, options);
    this.syncEngine.start().catch(console.error);
    return this.syncEngine;
  }
}
