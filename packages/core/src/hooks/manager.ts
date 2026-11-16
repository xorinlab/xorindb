import type { BaseDocument, DocumentWithMeta, PrimaryKey } from '../types';

export type PreInsertHook<T> = (data: Partial<T> & { id?: PrimaryKey }) => void | Promise<void> | Partial<T> | Promise<Partial<T>>;
export type PostInsertHook<T> = (doc: DocumentWithMeta<T>) => void | Promise<void>;

export type PreSaveHook<T> = (doc: DocumentWithMeta<T>) => void | Promise<void> | DocumentWithMeta<T> | Promise<DocumentWithMeta<T>>;
export type PostSaveHook<T> = (doc: DocumentWithMeta<T>, previous?: DocumentWithMeta<T>) => void | Promise<void>;

export type PreRemoveHook<T> = (id: PrimaryKey, doc?: DocumentWithMeta<T>) => void | Promise<void>;
export type PostRemoveHook<T> = (id: PrimaryKey, doc?: DocumentWithMeta<T>) => void | Promise<void>;

export class HookManager<T extends BaseDocument> {
  private preInsertHooks: PreInsertHook<T>[] = [];
  private postInsertHooks: PostInsertHook<T>[] = [];
  private preSaveHooks: PreSaveHook<T>[] = [];
  private postSaveHooks: PostSaveHook<T>[] = [];
  private preRemoveHooks: PreRemoveHook<T>[] = [];
  private postRemoveHooks: PostRemoveHook<T>[] = [];

  preInsert(fn: PreInsertHook<T>): this {
    this.preInsertHooks.push(fn);
    return this;
  }

  postInsert(fn: PostInsertHook<T>): this {
    this.postInsertHooks.push(fn);
    return this;
  }

  preSave(fn: PreSaveHook<T>): this {
    this.preSaveHooks.push(fn);
    return this;
  }

  postSave(fn: PostSaveHook<T>): this {
    this.postSaveHooks.push(fn);
    return this;
  }

  preRemove(fn: PreRemoveHook<T>): this {
    this.preRemoveHooks.push(fn);
    return this;
  }

  postRemove(fn: PostRemoveHook<T>): this {
    this.postRemoveHooks.push(fn);
    return this;
  }

  async runPreInsert(data: Partial<T> & { id?: PrimaryKey }): Promise<Partial<T> & { id?: PrimaryKey }> {
    let current = data;
    for (const hook of this.preInsertHooks) {
      const res = await hook(current);
      if (res && typeof res === 'object') {
        current = { ...current, ...res };
      }
    }
    return current;
  }

  async runPostInsert(doc: DocumentWithMeta<T>): Promise<void> {
    for (const hook of this.postInsertHooks) {
      await hook(doc);
    }
  }

  async runPreSave(doc: DocumentWithMeta<T>): Promise<DocumentWithMeta<T>> {
    let current = doc;
    for (const hook of this.preSaveHooks) {
      const res = await hook(current);
      if (res && typeof res === 'object') {
        current = { ...current, ...res };
      }
    }
    return current;
  }

  async runPostSave(doc: DocumentWithMeta<T>, previous?: DocumentWithMeta<T>): Promise<void> {
    for (const hook of this.postSaveHooks) {
      await hook(doc, previous);
    }
  }

  async runPreRemove(id: PrimaryKey, doc?: DocumentWithMeta<T>): Promise<void> {
    for (const hook of this.preRemoveHooks) {
      await hook(id, doc);
    }
  }

  async runPostRemove(id: PrimaryKey, doc?: DocumentWithMeta<T>): Promise<void> {
    for (const hook of this.postRemoveHooks) {
      await hook(id, doc);
    }
  }
}
