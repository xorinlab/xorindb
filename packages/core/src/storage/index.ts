import { StorageAdapter } from '../types';
import { IndexedDBStorageAdapter } from './indexeddb';
import { MemoryStorageAdapter } from './memory';

export function createDefaultStorage(): StorageAdapter {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDBStorageAdapter();
  }
  return new MemoryStorageAdapter();
}
