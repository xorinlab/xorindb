import { EventEmitter } from './events/emitter';
import { Query } from './query/query';
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
  private syncEngine: SyncEngine<T> | null = null;

  constructor(name: string, storage: StorageAdapter, emitter: EventEmitter, options?: CollectionOptions<T>) {
    this.name = name;
    this.storage = storage;
    this.emitter = emitter;
    this.schema = options?.schema;
  }

  getSchema(): CollectionSchema<T> | undefined {
    return this.schema;
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

  async insert(data: Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }): Promise<DocumentWithMeta<T>> {
    // Validate schema
    if (this.schema) {
      validateDocumentAgainstSchema(data as Record<string, unknown>, this.schema);
    }

    const id = data.id || generateUUID();
    const doc: DocumentWithMeta<T> = {
      ...(data as unknown as T),
      id,
      _deleted: false,
      _updatedAt: Date.now()
    };

    await this.storage.put(this.name, doc);

    this.emitter.emit(this.name, {
      collection: this.name,
      type: 'insert',
      id,
      doc
    });

    return doc;
  }

  async insertMany(docs: Array<Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }>): Promise<DocumentWithMeta<T>[]> {
    if (this.schema) {
      for (const item of docs) {
        validateDocumentAgainstSchema(item as Record<string, unknown>, this.schema);
      }
    }

    const prepared: DocumentWithMeta<T>[] = docs.map((item) => {
      const id = item.id || generateUUID();
      return {
        ...(item as unknown as T),
        id,
        _deleted: false,
        _updatedAt: Date.now()
      };
    });

    await this.storage.putBatch(this.name, prepared);

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
    const doc = await this.storage.get<T>(this.name, id);
    if (!doc || doc._deleted) return null;
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

    await this.storage.put(this.name, updated);

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
