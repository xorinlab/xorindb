import { BaseDocument, DocumentWithMeta, FilterQuery, QueryOptions } from '../types';
import { Collection } from '../collection';
import { matchQuery, applySortAndPagination } from './matcher';

export type QuerySubscriber<T> = (data: DocumentWithMeta<T>[]) => void;

export class Query<T extends BaseDocument> {
  private collection: Collection<T>;
  private filter?: FilterQuery<T>;
  private options?: QueryOptions<T>;
  private subscribers: Set<QuerySubscriber<T>> = new Set();
  private unbindEvent?: () => void;
  private cachedResult: DocumentWithMeta<T>[] | null = null;

  constructor(collection: Collection<T>, filter?: FilterQuery<T>, options?: QueryOptions<T>) {
    this.collection = collection;
    this.filter = filter;
    this.options = options;
  }

  async exec(): Promise<DocumentWithMeta<T>[]> {
    const allDocs = await this.collection.getStorage().getAll<T>(this.collection.getName());
    const matched = allDocs.filter(doc => matchQuery(doc, this.filter));
    const sorted = applySortAndPagination(matched, this.options);
    this.cachedResult = sorted;
    return sorted;
  }

  async first(): Promise<DocumentWithMeta<T> | null> {
    const list = await this.exec();
    return list.length > 0 ? list[0] : null;
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
        async () => {
          const freshData = await this.exec();
          for (const sub of this.subscribers) {
            try {
              sub(freshData);
            } catch (e) {
              console.error('Error in query subscriber:', e);
            }
          }
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
