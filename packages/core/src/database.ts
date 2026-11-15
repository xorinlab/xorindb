import { Collection } from './collection';
import { EventEmitter } from './events/emitter';
import { LeaderElector } from './leader/elector';
import { createDefaultStorage } from './storage';
import { BaseDocument, DatabaseOptions, StorageAdapter } from './types';

// Global cache for Singleton / ignoreDuplicate pattern
const DATABASE_CACHE = new Map<string, Database>();

export class Database {
  private name: string;
  private storage: StorageAdapter;
  private emitter: EventEmitter;
  private leaderElector: LeaderElector;
  private collections: Map<string, Collection<any>> = new Map();

  constructor(options: DatabaseOptions) {
    this.name = options.name;
    this.storage = options.storage || createDefaultStorage();
    this.emitter = new EventEmitter(this.name, options.multiTab ?? true);
    this.leaderElector = new LeaderElector(this.name);
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

  /**
   * Returns true if this database instance / tab is currently the designated leader.
   */
  isLeader(): boolean {
    return this.leaderElector.isLeader();
  }

  /**
   * Resolves when this tab / process successfully acquires leadership across open browser tabs.
   * Useful to only run background sync / network replication on the single leader tab.
   */
  async waitForLeadership(): Promise<boolean> {
    return this.leaderElector.waitForLeadership();
  }

  async close(): Promise<void> {
    this.leaderElector.close();
    this.emitter.close();
    await this.storage.close();
    this.collections.clear();
    DATABASE_CACHE.delete(this.name);
  }

  /**
   * Drops the database and clears all stored data from IndexedDB or memory.
   * Also cleans up all leader elections, subscriptions, and cached instances.
   */
  async remove(): Promise<void> {
    this.leaderElector.close();
    this.emitter.close();
    this.collections.clear();
    DATABASE_CACHE.delete(this.name);
    await this.storage.drop();
  }
}

export async function createDatabase(options: DatabaseOptions | string): Promise<Database> {
  const opts: DatabaseOptions = typeof options === 'string' ? { name: options } : options;
  const ignoreDuplicate = opts.ignoreDuplicate ?? true;

  // Singleton cache: Avoid duplicate DB instances / memory leaks on Hot Module Reload (HMR)
  if (DATABASE_CACHE.has(opts.name)) {
    if (ignoreDuplicate) {
      return DATABASE_CACHE.get(opts.name)!;
    }
    throw new Error(
      `Database with name "${opts.name}" is already created. Set ignoreDuplicate: true or use db.close() before creating a new one.`
    );
  }

  const db = new Database(opts);
  await db.init();
  DATABASE_CACHE.set(opts.name, db);
  return db;
}
