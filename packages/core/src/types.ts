export type PrimaryKey = string;

export interface BaseDocument {
  id?: PrimaryKey;
  _deleted?: boolean;
  _updatedAt?: number;
  [key: string]: unknown;
}

export type DocumentWithMeta<T> = T & {
  id: PrimaryKey;
  _deleted: boolean;
  _updatedAt: number;
};

export type FilterQuery<T> = {
  [P in keyof T]?: T[P] | {
    $eq?: unknown;
    $ne?: unknown;
    $gt?: number | string;
    $gte?: number | string;
    $lt?: number | string;
    $lte?: number | string;
    $in?: unknown[];
    $nin?: unknown[];
  };
};

export interface QueryOptions<T> {
  sort?: { [P in keyof T]?: 'asc' | 'desc' | 1 | -1 };
  limit?: number;
  skip?: number;
}

export type ChangeType = 'insert' | 'update' | 'delete';

export interface ChangeEvent<T> {
  collection: string;
  type: ChangeType;
  id: PrimaryKey;
  doc?: DocumentWithMeta<T>;
  previous?: DocumentWithMeta<T>;
}

export interface StorageAdapter {
  init(dbName: string, collections: string[]): Promise<void>;
  get<T>(collection: string, id: PrimaryKey): Promise<DocumentWithMeta<T> | null>;
  getAll<T>(collection: string): Promise<DocumentWithMeta<T>[]>;
  put<T>(collection: string, doc: DocumentWithMeta<T>): Promise<void>;
  putBatch<T>(collection: string, docs: DocumentWithMeta<T>[]): Promise<void>;
  delete(collection: string, id: PrimaryKey): Promise<void>;
  clear(collection: string): Promise<void>;
  close(): Promise<void>;
}

export interface SyncPushResult<T> {
  conflicts?: Array<{
    id: PrimaryKey;
    serverState: DocumentWithMeta<T>;
    clientState: DocumentWithMeta<T>;
  }>;
}

export interface SyncOptions<T> {
  endpoint?: string;
  pullIntervalMs?: number;
  pull?: (checkpoint: number) => Promise<{ documents: DocumentWithMeta<T>[]; checkpoint: number }>;
  push?: (changes: DocumentWithMeta<T>[]) => Promise<SyncPushResult<T> | void>;
  conflictResolver?: (conflict: {
    clientState: DocumentWithMeta<T>;
    serverState: DocumentWithMeta<T>;
  }) => DocumentWithMeta<T> | Promise<DocumentWithMeta<T>>;
}

export interface DatabaseOptions {
  name: string;
  storage?: StorageAdapter;
  multiTab?: boolean;
}
