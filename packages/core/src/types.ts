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
    $not?: unknown;
  };
} & {
  $and?: FilterQuery<T>[];
  $or?: FilterQuery<T>[];
  $nor?: FilterQuery<T>[];
  $not?: FilterQuery<T>;
  [key: string]: unknown;
};

export interface QueryOptions<T> {
  sort?: { [P in keyof T]?: 'asc' | 'desc' | 1 | -1 } & { [key: string]: 'asc' | 'desc' | 1 | -1 };
  limit?: number;
  skip?: number;
}

export interface MangoQuery<T> {
  selector?: FilterQuery<T>;
  sort?: QueryOptions<T>['sort'];
  limit?: number;
  skip?: number;
  index?: string | string[];
}

export type QueryInput<T> = FilterQuery<T> | MangoQuery<T>;

export type ChangeType = 'insert' | 'update' | 'delete';

export interface BulkWriteError<T> {
  id?: PrimaryKey;
  document: Partial<T>;
  error: Error;
}

export interface BulkWriteResult<T> {
  success: DocumentWithMeta<T>[];
  error: BulkWriteError<T>[];
}

export interface CollectionOptions<T> {
  schema?: import('./schema/validator').CollectionSchema<T>;
  migrationStrategies?: import('./schema/migration').MigrationStrategies;
}

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
  count?(collection: string): Promise<number>;
  put<T>(collection: string, doc: DocumentWithMeta<T>): Promise<void>;
  putBatch<T>(collection: string, docs: DocumentWithMeta<T>[]): Promise<void>;
  delete(collection: string, id: PrimaryKey): Promise<void>;
  clear(collection: string): Promise<void>;
  drop(): Promise<void>;
  close(): Promise<void>;
}

export interface Checkpoint {
  id: PrimaryKey;
  updatedAt: number;
}

export interface ChangeRow<T> {
  id: PrimaryKey;
  newDocumentState: DocumentWithMeta<T>;
  assumedMasterState?: DocumentWithMeta<T> | null;
}

export interface PullResult<T> {
  documents: DocumentWithMeta<T>[];
  checkpoint: Checkpoint | null;
}

export interface SyncPushResult<T> {
  conflicts?: Array<{
    id: PrimaryKey;
    serverState: DocumentWithMeta<T>;
    clientState: DocumentWithMeta<T>;
  }>;
}

export interface HttpReplicationOptions<T> {
  url: string; // e.g. "https://api.myapp.com"
  headers?: Record<string, string> | (() => Promise<Record<string, string>> | Record<string, string>);
  batchSize?: number;
  pullStream?: boolean; // Default true (uses Server-Sent Events / EventSource)
  pullIntervalMs?: number; // Fallback or periodic polling (default 10s)
  conflictResolver?: (conflict: {
    clientState: DocumentWithMeta<T>;
    serverState: DocumentWithMeta<T>;
  }) => DocumentWithMeta<T> | Promise<DocumentWithMeta<T>>;
}

export interface SyncOptions<T> {
  endpoint?: string;
  pullIntervalMs?: number;
  pull?: (checkpoint: Checkpoint | null, batchSize: number) => Promise<PullResult<T>>;
  push?: (changeRows: ChangeRow<T>[]) => Promise<Array<DocumentWithMeta<T>> | void>;
  streamUrl?: string;
  conflictResolver?: (conflict: {
    clientState: DocumentWithMeta<T>;
    serverState: DocumentWithMeta<T>;
  }) => DocumentWithMeta<T> | Promise<DocumentWithMeta<T>>;
}

export interface DatabaseOptions {
  name: string;
  password?: string; // Optional encryption password for encrypting sensitive fields
  storage?: StorageAdapter;
  multiTab?: boolean;
  ignoreDuplicate?: boolean; // Default true: returns existing instance if same name already instantiated
}
