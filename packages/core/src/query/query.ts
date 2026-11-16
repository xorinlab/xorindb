import { BaseDocument, BsonTypeName, ChangeEvent, DocumentWithMeta, FilterQuery, MangoQuery, QueryInput, QueryOptions } from '../types';
import { Collection } from '../collection';
import { calculateEventReduce } from './event-reduce';
import { matchQuery, applySortAndPagination } from './matcher';
import { IQueryBuilder, QueryFilterState } from './builder-state';

export type QuerySubscriber<T> = (data: DocumentWithMeta<T>[]) => void;

export class Query<T extends BaseDocument> implements IQueryBuilder<T, Query<T>> {
  private collection: Collection<T>;
  private filterState: QueryFilterState<T> = new QueryFilterState<T>();
  private options?: QueryOptions<T>;
  private subscribers: Set<QuerySubscriber<T>> = new Set();
  private unbindEvent?: () => void;
  private cachedResult: DocumentWithMeta<T>[] | null = null;

  constructor(collection: Collection<T>, filterOrMango?: QueryInput<T>, options?: QueryOptions<T>) {
    this.collection = collection;

    // Detect Mango query object ({ selector, sort, limit, skip })
    if (filterOrMango && typeof filterOrMango === 'object' && 'selector' in filterOrMango) {
      const mango = filterOrMango as MangoQuery<T>;
      this.filterState.setFilter(mango.selector);
      this.options = {
        sort: mango.sort ?? options?.sort,
        limit: mango.limit ?? options?.limit,
        skip: mango.skip ?? options?.skip
      };
    } else {
      this.filterState.setFilter(filterOrMango as FilterQuery<T>);
      this.options = options;
    }
  }

  where(fieldOrFilter: string | FilterQuery<T>): this {
    this.filterState.where(fieldOrFilter);
    return this;
  }

  eq(value: unknown): this {
    this.filterState.addCondition('$eq', value);
    return this;
  }

  equals(value: unknown): this {
    return this.eq(value);
  }

  ne(value: unknown): this {
    this.filterState.addCondition('$ne', value);
    return this;
  }

  gt(value: number | string): this {
    this.filterState.addCondition('$gt', value);
    return this;
  }

  gte(value: number | string): this {
    this.filterState.addCondition('$gte', value);
    return this;
  }

  lt(value: number | string): this {
    this.filterState.addCondition('$lt', value);
    return this;
  }

  lte(value: number | string): this {
    this.filterState.addCondition('$lte', value);
    return this;
  }

  in(values: unknown[]): this {
    this.filterState.addCondition('$in', values);
    return this;
  }

  nin(values: unknown[]): this {
    this.filterState.addCondition('$nin', values);
    return this;
  }

  regex(pattern: string | RegExp, options?: string): this {
    this.filterState.addCondition('$regex', pattern, options ? { $options: options } : undefined);
    return this;
  }

  exists(exists: boolean = true): this {
    this.filterState.addCondition('$exists', exists);
    return this;
  }

  type(typeName: BsonTypeName | string): this {
    this.filterState.addCondition('$type', typeName);
    return this;
  }

  size(len: number): this {
    this.filterState.addCondition('$size', len);
    return this;
  }

  all(values: unknown[]): this {
    this.filterState.addCondition('$all', values);
    return this;
  }

  elemMatch(condition: Record<string, unknown> | FilterQuery<unknown>): this {
    this.filterState.addCondition('$elemMatch', condition);
    return this;
  }

  sort(sortOptions: QueryOptions<T>['sort']): this {
    this.options = { ...this.options, sort: sortOptions };
    return this;
  }

  skip(skipCount: number): this {
    this.options = { ...this.options, skip: skipCount };
    return this;
  }

  limit(limitCount: number): this {
    this.options = { ...this.options, limit: limitCount };
    return this;
  }

  get $(): { subscribe: (callback: QuerySubscriber<T>) => () => void } {
    return {
      subscribe: (callback: QuerySubscriber<T>) => this.subscribe(callback)
    };
  }

  async exec(): Promise<DocumentWithMeta<T>[]> {
    await this.collection.ensureMigrated();
    const rawDocs = await this.collection.getStorage().getAll<T>(this.collection.getName());
    const compressor = this.collection.getKeyCompressor();
    const encryptor = this.collection.getFieldEncryptor();

    const decompressedDocs = compressor.isCompressionEnabled()
      ? rawDocs.map(d => compressor.decompress(d as unknown as Record<string, unknown>) as unknown as DocumentWithMeta<T>)
      : rawDocs;

    const allDocs = encryptor.hasEncryptedFields()
      ? await Promise.all(
          decompressedDocs.map(
            async d => (await encryptor.decryptDoc(d as unknown as Record<string, unknown>)) as unknown as DocumentWithMeta<T>
          )
        )
      : decompressedDocs;

    const filter = this.filterState.getFilter();
    const matched = allDocs.filter(doc => matchQuery(doc, filter));
    const sorted = applySortAndPagination(matched, this.options);
    this.cachedResult = sorted;
    return sorted;
  }

  async first(): Promise<DocumentWithMeta<T> | null> {
    const list = await this.exec();
    return list.length > 0 ? list[0] : null;
  }

  async count(): Promise<number> {
    const list = await this.exec();
    return list.length;
  }

  /**
   * Updates all documents matched by the query with the given patch.
   * Returns the list of updated documents.
   */
  async update(patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<DocumentWithMeta<T>[]> {
    const matched = await this.exec();
    const updatedDocs: DocumentWithMeta<T>[] = [];

    for (const doc of matched) {
      const updated = await this.collection.update(doc.id, patch);
      updatedDocs.push(updated);
    }

    return updatedDocs;
  }

  /**
   * Deletes all documents matched by the query.
   * Returns the list of deleted document IDs.
   */
  async remove(hardDelete: boolean = false): Promise<DocumentWithMeta<T>[]> {
    const matched = await this.exec();
    for (const doc of matched) {
      await this.collection.delete(doc.id, hardDelete);
    }
    return matched;
  }

  private notifySubscribers(data: DocumentWithMeta<T>[]): void {
    this.cachedResult = data;
    for (const sub of this.subscribers) {
      try {
        sub(data);
      } catch (e) {
        console.error('Error in query subscriber:', e);
      }
    }
  }

  subscribe(callback: QuerySubscriber<T>): () => void {
    this.subscribers.add(callback);

    // Initial fetch
    this.exec().then((data) => {
      callback(data);
    });

    if (!this.unbindEvent) {
      this.unbindEvent = this.collection.getEmitter().on<T>(
        this.collection.getName(),
        async (event: ChangeEvent<T>) => {
          // EventReduce Optimization
          const decision = calculateEventReduce(
            this.cachedResult,
            event,
            this.filterState.getFilter(),
            this.options
          );

          if (decision.action === 'do-nothing') {
            // Unrelated event! Skip full disk re-query and prevent unnecessary UI re-renders!
            return;
          }

          if (decision.updatedResult) {
            // Calculated in-memory without expensive disk scan
            this.notifySubscribers(decision.updatedResult);
            return;
          }

          // Fallback: run full query from storage
          const freshData = await this.exec();
          this.notifySubscribers(freshData);
        }
      );
    }

    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0 && this.unbindEvent) {
        this.unbindEvent();
        this.unbindEvent = undefined;
      }
    };
  }

  getCurrentValue(): DocumentWithMeta<T>[] | null {
    return this.cachedResult;
  }
}
