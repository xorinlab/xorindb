import type { Collection } from '../collection';
import type { BaseDocument, ChangeEvent, DocumentWithMeta, PrimaryKey } from '../types';

export class RxDocument<T extends BaseDocument> {
  private _collection: Collection<T>;
  private _data: DocumentWithMeta<T>;
  private _deleted: boolean = false;
  private _unbind?: () => void;
  private _subscribers: Set<(doc: RxDocument<T>) => void> = new Set();
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

  get $(): { subscribe: (callback: (doc: RxDocument<T>) => void) => () => void } {
    return {
      subscribe: (callback: (doc: RxDocument<T>) => void) => {
        this._subscribers.add(callback);
        // Immediate emit of current document
        callback(this);

        return () => {
          this._subscribers.delete(callback);
        };
      }
    };
  }

  toJSON(): DocumentWithMeta<T> {
    return JSON.parse(JSON.stringify(this._data));
  }

  toMutableJSON(): T {
    const copy = JSON.parse(JSON.stringify(this._data));
    delete copy._deleted;
    delete copy._updatedAt;
    return copy;
  }

  /**
   * Patches the document with partial changes in a queue-safe incremental manner.
   */
  async incrementalPatch(patch: Partial<Omit<T, 'id' | '_deleted' | '_updatedAt'>>): Promise<RxDocument<T>> {
    if (this._deleted) {
      throw new Error(`Cannot patch deleted document with id "${this.id}".`);
    }

    const updated = await this._collection.update(this.id, patch);
    this._data = { ...updated };
    return this;
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

export function createRxDocument<T extends BaseDocument>(
  collection: Collection<T>,
  data: DocumentWithMeta<T>
): RxDocument<T> & T {
  const docInstance = new RxDocument<T>(collection, data);
  return new Proxy(docInstance, {
    get(target: any, prop: string | symbol) {
      if (prop in target || typeof prop === 'symbol') {
        return target[prop];
      }
      return target._data[prop];
    }
  }) as RxDocument<T> & T;
}
