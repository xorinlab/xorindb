import { BaseDocument, BsonTypeName, DocumentWithMeta, FilterQuery, QueryInput, QueryOptions } from '../types';
import { Collection } from '../collection';
import { Query } from './query';
import { IQueryBuilder } from './builder-state';

export type SingleDocSubscriber<T> = (data: DocumentWithMeta<T> | null) => void;

export class SingleDocQuery<T extends BaseDocument> implements IQueryBuilder<T, SingleDocQuery<T>> {
  private query: Query<T>;
  private collection: Collection<T>;

  constructor(collection: Collection<T>, filterOrMango?: QueryInput<T> | string, options?: QueryOptions<T>) {
    this.collection = collection;

    if (typeof filterOrMango === 'string') {
      const pk = collection.getPrimaryKeyField();
      this.query = new Query<T>(collection, { [pk]: filterOrMango } as FilterQuery<T>, { ...options, limit: 1 });
    } else {
      this.query = new Query<T>(collection, filterOrMango, { ...options, limit: 1 });
    }
  }

  where(fieldOrFilter: string | FilterQuery<T>): this {
    this.query.where(fieldOrFilter);
    return this;
  }

  eq(value: unknown): this {
    this.query.eq(value);
    return this;
  }

  equals(value: unknown): this {
    this.query.equals(value);
    return this;
  }

  ne(value: unknown): this {
    this.query.ne(value);
    return this;
  }

  gt(value: number | string): this {
    this.query.gt(value);
    return this;
  }

  gte(value: number | string): this {
    this.query.gte(value);
    return this;
  }

  lt(value: number | string): this {
    this.query.lt(value);
    return this;
  }

  lte(value: number | string): this {
    this.query.lte(value);
    return this;
  }

  in(values: unknown[]): this {
    this.query.in(values);
    return this;
  }

  nin(values: unknown[]): this {
    this.query.nin(values);
    return this;
  }

  regex(pattern: string | RegExp, options?: string): this {
    this.query.regex(pattern, options);
    return this;
  }

  exists(exists: boolean = true): this {
    this.query.exists(exists);
    return this;
  }

  type(typeName: BsonTypeName | string): this {
    this.query.type(typeName);
    return this;
  }

  size(len: number): this {
    this.query.size(len);
    return this;
  }

  all(values: unknown[]): this {
    this.query.all(values);
    return this;
  }

  elemMatch(condition: Record<string, unknown> | FilterQuery<unknown>): this {
    this.query.elemMatch(condition);
    return this;
  }

  sort(sortOptions: QueryOptions<T>['sort']): this {
    this.query.sort(sortOptions);
    return this;
  }

  async exec(): Promise<DocumentWithMeta<T> | null>;
  async exec(throwIfMissing: true): Promise<DocumentWithMeta<T>>;
  async exec(throwIfMissing: boolean): Promise<DocumentWithMeta<T> | null>;
  async exec(throwIfMissing: boolean = false): Promise<DocumentWithMeta<T> | null> {
    const list = await this.query.exec();
    const doc = list.length > 0 ? list[0] : null;
    if (!doc && throwIfMissing) {
      throw new Error(`Result empty and throwIfMissing: true on collection "${this.collection.getName()}".`);
    }
    return doc;
  }

  /**
   * Updates the single matched document with the given patch.
   */
  async update(patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<DocumentWithMeta<T> | null> {
    const doc = await this.exec();
    if (!doc) return null;
    return this.collection.update(doc.id, patch);
  }

  /**
   * Removes the single matched document.
   */
  async remove(hardDelete: boolean = false, throwIfMissing: boolean = false): Promise<DocumentWithMeta<T> | null> {
    const doc = await this.exec(throwIfMissing);
    if (!doc) return null;
    await this.collection.delete(doc.id, hardDelete);
    return doc;
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
