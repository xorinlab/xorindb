import type { BaseDocument, QueryInput, QueryOptions } from '../types';
import type { Query } from './query';

export class QueryCache<T extends BaseDocument> {
  private cache: Map<string, Query<T>> = new Map();

  private generateKey(filterOrMango?: QueryInput<T>, options?: QueryOptions<T>): string {
    return JSON.stringify({ filterOrMango: filterOrMango || null, options: options || null });
  }

  get(filterOrMango?: QueryInput<T>, options?: QueryOptions<T>): Query<T> | undefined {
    const key = this.generateKey(filterOrMango, options);
    return this.cache.get(key);
  }

  set(query: Query<T>, filterOrMango?: QueryInput<T>, options?: QueryOptions<T>): void {
    const key = this.generateKey(filterOrMango, options);
    this.cache.set(key, query);
  }

  has(filterOrMango?: QueryInput<T>, options?: QueryOptions<T>): boolean {
    const key = this.generateKey(filterOrMango, options);
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
