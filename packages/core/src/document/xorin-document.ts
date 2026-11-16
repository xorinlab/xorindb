import type { Collection } from '../collection';
import type { BaseDocument, ChangeEvent, DocumentWithMeta, PrimaryKey } from '../types';

export class XorinDocument<T extends BaseDocument> {
  private _collection: Collection<T>;
  private _data: DocumentWithMeta<T>;
  private _deleted: boolean = false;
  private _unbind?: () => void;
  private _subscribers: Set<(doc: XorinDocument<T>) => void> = new Set();
  private _fieldSubscribers: Map<string, Set<(val: any) => void>> = new Map();

  constructor(collection: Collection<T>, data: DocumentWithMeta<T>) {
    this._collection = collection;
    this._data = { ...data };
    this._deleted = !!data._deleted;
    this.initProxy();
    this.listenToChanges();
  }

  get id(): PrimaryKey {
    return this._data.id;
  }

  get deleted(): boolean {
    return this._deleted;
  }

  get collection(): Collection<T> {
    return this._collection;
  }

  private listenToChanges(): void {
    this._unbind = this._collection.getEmitter().on<T>(this._collection.getName(), (event: ChangeEvent<T>) => {
      if (event.id !== this.id) return;

      if (event.type === 'delete') {
        this._deleted = true;
        this.notifyAll();
        return;
      }

      if (event.doc) {
        const prev = this._data;
        this._data = { ...event.doc };
        this._deleted = false;

        // Check field-level changes
        for (const [key, subs] of this._fieldSubscribers.entries()) {
          const oldVal = (prev as any)[key];
          const newVal = (this._data as any)[key];
          if (oldVal !== newVal) {
            for (const sub of subs) sub(newVal);
          }
        }

        this.notifyAll();
      }
    });
  }

  private notifyAll(): void {
    for (const sub of this._subscribers) {
      sub(this);
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return (this._data as any)[key];
  }

  get$(key: keyof T): { subscribe: (callback: (val: any) => void) => () => void } {
    return {
      subscribe: (callback: (val: any) => void) => {
        const fieldKey = String(key);
        if (!this._fieldSubscribers.has(fieldKey)) {
          this._fieldSubscribers.set(fieldKey, new Set());
        }
        const set = this._fieldSubscribers.get(fieldKey)!;
        set.add(callback);

        // Immediate emit of current value
        callback((this._data as any)[fieldKey]);

        return () => {
          set.delete(callback);
          if (set.size === 0) {
            this._fieldSubscribers.delete(fieldKey);
          }
        };
      }
    };
  }

  get $(): { subscribe: (callback: (doc: XorinDocument<T>) => void) => () => void } {
    return {
      subscribe: (callback: (doc: XorinDocument<T>) => void) => {
        this._subscribers.add(callback);
        // Immediate emit of current document
        callback(this);

        return () => {
          this._subscribers.delete(callback);
        };
      }
    };
  }

  /**
   * Returns a deep-cloned plain JavaScript object.
   * If withMetaFields is true (default), includes id, _deleted, and _updatedAt.
   * If false, strips internal meta fields.
   * Freezes the returned object in accordance with immutable toJSON specification.
   */
  toJSON(): DocumentWithMeta<T>;
  toJSON(withMetaFields: true): DocumentWithMeta<T>;
  toJSON(withMetaFields: false): T;
  toJSON(withMetaFields: boolean): DocumentWithMeta<T> | T;
  toJSON(withMetaFields: boolean = true): DocumentWithMeta<T> | T {
    const copy = JSON.parse(JSON.stringify(this._data));
    if (!withMetaFields) {
      delete copy._deleted;
      delete copy._updatedAt;
    }
    return Object.freeze(copy);
  }

  /**
   * Returns a deep-cloned, freely mutable plain JavaScript object.
   * If withMetaFields is false (default), strips internal meta fields (_deleted, _updatedAt).
   * If true, includes all meta fields.
   */
  toMutableJSON(): T;
  toMutableJSON(withMetaFields: false): T;
  toMutableJSON(withMetaFields: true): DocumentWithMeta<T>;
  toMutableJSON(withMetaFields: boolean): T | DocumentWithMeta<T>;
  toMutableJSON(withMetaFields: boolean = false): T | DocumentWithMeta<T> {
    const copy = JSON.parse(JSON.stringify(this._data));
    if (!withMetaFields) {
      delete copy._deleted;
      delete copy._updatedAt;
    }
    return copy;
  }

  /**
   * Patches the document with partial changes in a queue-safe incremental manner.
   */
  async incrementalPatch(patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<XorinDocument<T>> {
    if (this._deleted) {
      throw new Error(`Cannot patch deleted document with id "${this.id}".`);
    }

    const updated = await this._collection.update(this.id, patch);
    this._data = { ...updated };
    return this;
  }

  /**
   * Modifies the document using a mutator function.
   * Fetches fresh state and applies mutation to prevent conflicts.
   */
  async modify(mutator: (docData: T) => Partial<T> | Promise<Partial<T>>): Promise<XorinDocument<T>> {
    if (this._deleted) {
      throw new Error(`Cannot modify deleted document with id "${this.id}".`);
    }

    const fresh = await this._collection.findById(this.id);
    if (!fresh || fresh._deleted) {
      throw new Error(`Document with id "${this.id}" not found in storage.`);
    }

    const mutableCopy = JSON.parse(JSON.stringify(fresh)) as T;
    const patch = await mutator(mutableCopy);

    const updated = await this._collection.update(this.id, patch as any);
    this._data = { ...updated };
    return this;
  }

  /**
   * Incrementally modifies the document sequentially. Alias to modify.
   */
  async incrementalModify(mutator: (docData: T) => Partial<T> | Promise<Partial<T>>): Promise<XorinDocument<T>> {
    return this.modify(mutator);
  }

  /**
   * Deletes the document from the collection (soft-delete / tombstone by default).
   */
  async remove(hardDelete: boolean = false): Promise<XorinDocument<T>> {
    if (this._deleted) {
      return this;
    }

    await this._collection.delete(this.id, hardDelete);
    this._deleted = true;
    this._data._deleted = true;
    return this;
  }

  /**
   * Incrementally removes the document sequentially. Alias to remove.
   */
  async incrementalRemove(hardDelete: boolean = false): Promise<XorinDocument<T>> {
    return this.remove(hardDelete);
  }

  destroy(): void {
    if (this._unbind) {
      this._unbind();
      this._unbind = undefined;
    }
    this._subscribers.clear();
    this._fieldSubscribers.clear();
  }

  private initProxy(): void {
    return new Proxy(this, {
      get(target: any, prop: string | symbol) {
        if (prop in target || typeof prop === 'symbol') {
          return target[prop];
        }
        return target._data[prop];
      }
    }) as any;
  }
}

export function createXorinDocument<T extends BaseDocument>(
  collection: Collection<T>,
  data: DocumentWithMeta<T>
): XorinDocument<T> & T {
  const docInstance = new XorinDocument<T>(collection, data);
  return new Proxy(docInstance, {
    get(target: any, prop: string | symbol) {
      if (prop in target || typeof prop === 'symbol') {
        return target[prop];
      }
      return target._data[prop];
    }
  }) as XorinDocument<T> & T;
}
