import { Collection } from './collection';
import { EventEmitter } from './events/emitter';
import { createDefaultStorage } from './storage';
import { BaseDocument, DatabaseOptions, StorageAdapter } from './types';

export class Database {
  private name: string;
  private storage: StorageAdapter;
  private emitter: EventEmitter;
  private collections: Map<string, Collection<any>> = new Map();

  constructor(options: DatabaseOptions) {
    this.name = options.name;
    this.storage = options.storage || createDefaultStorage();
    this.emitter = new EventEmitter(this.name, options.multiTab ?? true);
  }

  async init(): Promise<void> {
    await this.storage.init(this.name, Array.from(this.collections.keys()));
  }

  collection<T extends BaseDocument = BaseDocument>(name: string): Collection<T> {
    if (!this.collections.has(name)) {
      const col = new Collection<T>(name, this.storage, this.emitter);
      this.collections.set(name, col);
    }
    return this.collections.get(name) as Collection<T>;
  }

  getName(): string {
    return this.name;
  }

  getStorage(): StorageAdapter {
    return this.storage;
  }

  async close(): Promise<void> {
    this.emitter.close();
    await this.storage.close();
    this.collections.clear();
  }
}

export async function createDatabase(options: DatabaseOptions | string): Promise<Database> {
  const opts: DatabaseOptions = typeof options === 'string' ? { name: options } : options;
  const db = new Database(opts);
  await db.init();
  return db;
}
