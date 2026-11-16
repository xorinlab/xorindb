import { DocumentWithMeta, PrimaryKey, StorageAdapter } from '../types';

export class MemoryStorageAdapter implements StorageAdapter {
  private stores: Map<string, Map<PrimaryKey, DocumentWithMeta<unknown>>> = new Map();

  async init(_dbName: string, _collections: string[]): Promise<void> {
    // Memory adapter needs no async setup
  }

  private getCollectionStore<T>(collection: string): Map<PrimaryKey, DocumentWithMeta<T>> {
    if (!this.stores.has(collection)) {
      this.stores.set(collection, new Map());
    }
    return this.stores.get(collection) as Map<PrimaryKey, DocumentWithMeta<T>>;
  }

  async get<T>(collection: string, id: PrimaryKey): Promise<DocumentWithMeta<T> | null> {
    const store = this.getCollectionStore<T>(collection);
    const item = store.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async getAll<T>(collection: string): Promise<DocumentWithMeta<T>[]> {
    const store = this.getCollectionStore<T>(collection);
    return Array.from(store.values()).map(doc => JSON.parse(JSON.stringify(doc)));
  }

  async count(collection: string): Promise<number> {
    const store = this.getCollectionStore(collection);
    let total = 0;
    for (const doc of store.values()) {
      if (!doc._deleted) total++;
    }
    return total;
  }

  async put<T>(collection: string, doc: DocumentWithMeta<T>): Promise<void> {
    const store = this.getCollectionStore<T>(collection);
    store.set(doc.id, JSON.parse(JSON.stringify(doc)));
  }

  async putBatch<T>(collection: string, docs: DocumentWithMeta<T>[]): Promise<void> {
    const store = this.getCollectionStore<T>(collection);
    for (const doc of docs) {
      store.set(doc.id, JSON.parse(JSON.stringify(doc)));
    }
  }

  async delete(collection: string, id: PrimaryKey): Promise<void> {
    const store = this.stores.get(collection);
    if (store) {
      store.delete(id);
    }
  }

  async clear(collection: string): Promise<void> {
    const store = this.stores.get(collection);
    if (store) {
      store.clear();
    }
  }

  async drop(): Promise<void> {
    this.stores.clear();
  }

  async close(): Promise<void> {
    this.stores.clear();
  }
}
