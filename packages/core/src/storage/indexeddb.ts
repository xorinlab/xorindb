import { DocumentWithMeta, PrimaryKey, StorageAdapter } from '../types';

export class IndexedDBStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private dbName: string = 'xorindb_default';
  private knownCollections: Set<string> = new Set();

  async init(dbName: string, collections: string[]): Promise<void> {
    this.dbName = dbName;
    for (const c of collections) {
      this.knownCollections.add(c);
    }

    await this.openDatabase();
  }

  private async openDatabase(targetVersion?: number): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment.');
    }

    return new Promise((resolve, reject) => {
      // First, get current version if not specified
      const openReq = targetVersion !== undefined 
        ? indexedDB.open(this.dbName, targetVersion)
        : indexedDB.open(this.dbName);

      openReq.onupgradeneeded = (event) => {
        const db = openReq.result;
        for (const col of this.knownCollections) {
          if (!db.objectStoreNames.contains(col)) {
            db.createObjectStore(col, { keyPath: 'id' });
          }
        }
      };

      openReq.onsuccess = async () => {
        const db = openReq.result;
        // Check if any registered collection is missing in object stores
        const missing = Array.from(this.knownCollections).filter(
          c => !db.objectStoreNames.contains(c)
        );

        if (missing.length > 0) {
          const nextVersion = db.version + 1;
          db.close();
          const upgraded = await this.openDatabase(nextVersion);
          this.db = upgraded;
          resolve(upgraded);
        } else {
          this.db = db;
          resolve(db);
        }
      };

      openReq.onerror = () => reject(openReq.error);
    });
  }

  private async ensureCollection(collection: string): Promise<IDBDatabase> {
    if (!this.knownCollections.has(collection)) {
      this.knownCollections.add(collection);
      if (this.db) {
        if (!this.db.objectStoreNames.contains(collection)) {
          const nextVersion = this.db.version + 1;
          this.db.close();
          this.db = await this.openDatabase(nextVersion);
        }
      } else {
        this.db = await this.openDatabase();
      }
    }
    return this.db!;
  }

  async get<T>(collection: string, id: PrimaryKey): Promise<DocumentWithMeta<T> | null> {
    const db = await this.ensureCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, 'readonly');
      const store = tx.objectStore(collection);
      const req = store.get(id);

      req.onsuccess = () => resolve((req.result as DocumentWithMeta<T>) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll<T>(collection: string): Promise<DocumentWithMeta<T>[]> {
    const db = await this.ensureCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, 'readonly');
      const store = tx.objectStore(collection);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as DocumentWithMeta<T>[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  async put<T>(collection: string, doc: DocumentWithMeta<T>): Promise<void> {
    const db = await this.ensureCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, 'readwrite');
      const store = tx.objectStore(collection);
      const req = store.put(doc);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async putBatch<T>(collection: string, docs: DocumentWithMeta<T>[]): Promise<void> {
    const db = await this.ensureCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, 'readwrite');
      const store = tx.objectStore(collection);

      for (const doc of docs) {
        store.put(doc);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(collection: string, id: PrimaryKey): Promise<void> {
    const db = await this.ensureCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, 'readwrite');
      const store = tx.objectStore(collection);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(collection: string): Promise<void> {
    const db = await this.ensureCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, 'readwrite');
      const store = tx.objectStore(collection);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async drop(): Promise<void> {
    await this.close();
    this.knownCollections.clear();

    if (typeof indexedDB !== 'undefined') {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(this.dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          // In some browsers onblocked fires if other connections are open
          console.warn(`[xorindb] deleteDatabase blocked for "${this.dbName}"`);
          resolve();
        };
      });
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
