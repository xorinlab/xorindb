import { BaseDocument, DocumentWithMeta, FilterQuery, QueryOptions } from '../types';
import { Collection } from '../collection';
import { Query } from './query';

export type SingleDocSubscriber<T> = (data: DocumentWithMeta<T> | null) => void;

export class SingleDocQuery<T extends BaseDocument> {
  private query: Query<T>;
  private collection: Collection<T>;

  constructor(collection: Collection<T>, filter?: FilterQuery<T> | string, options?: QueryOptions<T>) {
    this.collection = collection;
    let actualFilter: FilterQuery<T> | undefined;

    if (typeof filter === 'string') {
      const pk = collection.getPrimaryKeyField();
      actualFilter = { [pk]: filter } as FilterQuery<T>;
    } else {
      actualFilter = filter;
    }

    this.query = new Query<T>(collection, actualFilter, { ...options, limit: 1 });
  }

  where(filter: FilterQuery<T>): this {
    this.query.where(filter);
    return this;
  }

  sort(sortOptions: QueryOptions<T>['sort']): this {
    this.query.sort(sortOptions);
    return this;
  }

  async exec(): Promise<DocumentWithMeta<T> | null> {
    const list = await this.query.exec();
    return list.length > 0 ? list[0] : null;
  }

  subscribe(callback: SingleDocSubscriber<T>): () => void {
    return this.query.subscribe((docs) => {
      callback(docs.length > 0 ? docs[0] : null);
    });
  }

  get $(): { subscribe: (callback: SingleDocSubscriber<T>) => () => void } {
    return {
      subscribe: (callback: SingleDocSubscriber<T>) => this.subscribe(callback)
    };
  }

  getCurrentValue(): DocumentWithMeta<T> | null {
    const list = this.query.getCurrentValue();
    return list && list.length > 0 ? list[0] : null;
  }
}
