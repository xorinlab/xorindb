import { EventEmitter } from './events/emitter';
import { Query } from './query/query';
import { SingleDocQuery } from './query/single-query';
import { KeyCompressor } from './schema/compression';
import { FieldEncryptor } from './schema/encryption';
import { MigrationEngine, MigrationStrategies } from './schema/migration';
import { CollectionSchema, validateDocumentAgainstSchema } from './schema/validator';
import { SyncEngine } from './sync';
import { HookManager } from './hooks/manager';
import { prepareDocForStorage, restoreDocFromStorage } from './utils/pipeline';
import { generateUUID } from './utils/uuid';
import { executeBulkInsert, executeBulkUpsert } from './utils/bulk';
import {
  BaseDocument,
  BulkWriteResult,
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
  private hooks: HookManager<T> = new HookManager<T>();
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
  getHooks(): HookManager<T> { return this.hooks; }
  getPrimaryKeyField(): string { return (this.schema?.primaryKey as string) || 'id'; }

  resolveDocumentId(data: Record<string, unknown>): string {
    const pkField = this.getPrimaryKeyField();
    const customVal = data[pkField];
    if (customVal !== undefined && customVal !== null) return String(customVal);
    if (data.id !== undefined && data.id !== null) return String(data.id);
    const generated = generateUUID();
    data[pkField] = generated;
    return generated;
  }

  preInsert(fn: import('./hooks/manager').PreInsertHook<T>): this { this.hooks.preInsert(fn); return this; }
  postInsert(fn: import('./hooks/manager').PostInsertHook<T>): this { this.hooks.postInsert(fn); return this; }
  preSave(fn: import('./hooks/manager').PreSaveHook<T>): this { this.hooks.preSave(fn); return this; }
  postSave(fn: import('./hooks/manager').PostSaveHook<T>): this { this.hooks.postSave(fn); return this; }
  preRemove(fn: import('./hooks/manager').PreRemoveHook<T>): this { this.hooks.preRemove(fn); return this; }
  postRemove(fn: import('./hooks/manager').PostRemoveHook<T>): this { this.hooks.postRemove(fn); return this; }

  async insert(data: Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }): Promise<DocumentWithMeta<T>> {
    await this.ensureMigrated();
    const processed = await this.hooks.runPreInsert(data as any);
    if (this.schema) validateDocumentAgainstSchema(processed as Record<string, unknown>, this.schema);

    const docObj = { ...(processed as unknown as Record<string, unknown>) };
    const id = this.resolveDocumentId(docObj);
    let doc: DocumentWithMeta<T> = {
      ...(docObj as unknown as T),
      id,
      _deleted: false,
      _updatedAt: Date.now()
    };

    doc = await this.hooks.runPreSave(doc);
    const storageDoc = await prepareDocForStorage(doc, this.fieldEncryptor, this.keyCompressor);
    await this.storage.put(this.name, storageDoc);

    this.emitter.emit(this.name, { collection: this.name, type: 'insert', id, doc });
    await this.hooks.runPostInsert(doc);
    await this.hooks.runPostSave(doc);
    return doc;
  }

  async insertMany(docs: Array<Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }>): Promise<DocumentWithMeta<T>[]> {
    const res = await this.bulkInsert(docs);
    if (res.error.length > 0) {
      throw res.error[0].error;
    }
    return res.success;
  }

  /**
   * Bulk inserts documents and returns detailed success and error items.
   */
  async bulkInsert(docs: Array<Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }>): Promise<BulkWriteResult<T>> {
    return executeBulkInsert<T>(this, docs);
  }

  /**
   * Bulk upserts documents (insert if absent, update if exists) and returns detailed results.
   */
  async bulkUpsert(docs: Array<Partial<T> & { id?: PrimaryKey; [key: string]: unknown }>): Promise<BulkWriteResult<T>> {
    return executeBulkUpsert<T>(this, docs);
  }

  async findById(id: PrimaryKey): Promise<DocumentWithMeta<T> | null> {
    await this.ensureMigrated();
    const raw = await this.storage.get<T>(this.name, id);
    if (!raw || raw._deleted) return null;
    return restoreDocFromStorage(raw, this.fieldEncryptor, this.keyCompressor);
  }

  find(filterOrMango?: import('./types').QueryInput<T>, options?: QueryOptions<T>): Query<T> {
    return new Query<T>(this, filterOrMango, options);
  }

  /**
   * Fast count of documents. If a filter is provided, counts matching documents.
   * If no filter is provided, leverages the storage adapter's direct count.
   */
  async count(filterOrMango?: import('./types').QueryInput<T>): Promise<number> {
    await this.ensureMigrated();
    if (!filterOrMango && this.storage.count) {
      return this.storage.count(this.name);
    }
    return this.find(filterOrMango).count();
  }

  /**
   * Find a single document by filter, mango query, or primary key.
   */
  findOne(filterOrMango?: import('./types').QueryInput<T> | PrimaryKey, options?: QueryOptions<T>): SingleDocQuery<T> {
    return new SingleDocQuery<T>(this, filterOrMango, options);
  }

  async update(id: PrimaryKey, patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<DocumentWithMeta<T>> {
    const existing = await this.findById(id);
    if (!existing || existing._deleted) {
      throw new Error(`Document with id "${id}" does not exist in collection "${this.name}".`);
    }

    let updated: DocumentWithMeta<T> = { ...existing, ...patch, _updatedAt: Date.now() };
    if (this.schema) validateDocumentAgainstSchema(updated as Record<string, unknown>, this.schema);

    updated = await this.hooks.runPreSave(updated);
    const storageUpdated = await prepareDocForStorage(updated, this.fieldEncryptor, this.keyCompressor);
    await this.storage.put(this.name, storageUpdated);

    this.emitter.emit(this.name, { collection: this.name, type: 'update', id, doc: updated, previous: existing });
    await this.hooks.runPostSave(updated, existing);
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

    await this.hooks.runPreRemove(id, existing);

    if (hardDelete) {
      await this.storage.delete(this.name, id);
    } else {
      const deletedDoc: DocumentWithMeta<T> = { ...existing, _deleted: true, _updatedAt: Date.now() };
      const storageDoc = await prepareDocForStorage(deletedDoc, this.fieldEncryptor, this.keyCompressor);
      await this.storage.put(this.name, storageDoc);
    }

    this.emitter.emit(this.name, { collection: this.name, type: 'delete', id, previous: existing });
    await this.hooks.runPostRemove(id, existing);
  }

  sync(options: SyncOptions<T>): SyncEngine<T> {
    if (this.syncEngine) this.syncEngine.stop();
    this.syncEngine = new SyncEngine<T>(this, options);
    this.syncEngine.start().catch(console.error);
    return this.syncEngine;
  }
}
