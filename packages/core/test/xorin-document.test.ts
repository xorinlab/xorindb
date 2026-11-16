import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';
import { createXorinDocument, XorinDocument } from '../src/document/xorin-document';

describe('XorinDocument Instance & Reactive Getters', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-xdoc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should wrap raw document into XorinDocument with proxy property access', async () => {
    const users = db.collection<{ id?: string; name: string; age: number }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Alice', age: 25 });

    const doc = createXorinDocument(users, raw);

    expect(doc.id).toBe('u1');
    expect(doc.name).toBe('Alice');
    expect(doc.age).toBe(25);
    expect(doc.get('name')).toBe('Alice');
    expect(doc.toJSON().name).toBe('Alice');
    expect((doc.toMutableJSON() as any)._deleted).toBeUndefined();
  });

  it('should reactively emit changes on whole document via doc.$', async () => {
    const users = db.collection<{ id?: string; name: string; age: number }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Alice', age: 25 });

    const doc = createXorinDocument(users, raw);
    const updates: string[] = [];

    const unsubscribe = doc.$.subscribe((d) => {
      updates.push(d.get('name'));
    });

    expect(updates).toEqual(['Alice']);

    await users.update('u1', { name: 'Alice Smith' });
    expect(updates).toEqual(['Alice', 'Alice Smith']);

    unsubscribe();
  });

  it('should reactively emit specific field updates via doc.get$(fieldName)', async () => {
    const users = db.collection<{ id?: string; name: string; score: number }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Bob', score: 100 });

    const doc = createXorinDocument(users, raw);
    const scoreHistory: number[] = [];
    const nameHistory: string[] = [];

    const unsubScore = doc.get$('score').subscribe((val) => {
      scoreHistory.push(val);
    });

    const unsubName = doc.get$('name').subscribe((val) => {
      nameHistory.push(val);
    });

    expect(scoreHistory).toEqual([100]);
    expect(nameHistory).toEqual(['Bob']);

    // Update only score
    await users.update('u1', { score: 150 });
    expect(scoreHistory).toEqual([100, 150]);
    expect(nameHistory).toEqual(['Bob']); // Name should not trigger!

    // Update only name
    await users.update('u1', { name: 'Bob Marley' });
    expect(scoreHistory).toEqual([100, 150]); // Score should not trigger!
    expect(nameHistory).toEqual(['Bob', 'Bob Marley']);

    unsubScore();
    unsubName();
  });

  it('should handle document deletion in reactive stream', async () => {
    const users = db.collection<{ id?: string; name: string }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Charlie' });

    const doc = createXorinDocument(users, raw);
    let deletedFlag = doc.deleted;

    const unsub = doc.$.subscribe((d) => {
      deletedFlag = d.deleted;
    });

    expect(deletedFlag).toBe(false);

    await users.delete('u1');
    expect(deletedFlag).toBe(true);
    expect(doc.deleted).toBe(true);

    unsub();
  });

  it('should support incrementalPatch() to mutate document and update database', async () => {
    const tasks = db.collection<{ id?: string; title: string; done: boolean; priority: number }>('tasks');
    const raw = await tasks.insert({ id: 't1', title: 'Task 1', done: false, priority: 1 });

    const doc = createXorinDocument(tasks, raw);

    await doc.incrementalPatch({ done: true, priority: 3 });

    // In-memory document should be updated
    expect(doc.done).toBe(true);
    expect(doc.priority).toBe(3);
    expect(doc.title).toBe('Task 1');

    // Storage should also be updated
    const fetched = await tasks.findById('t1');
    expect(fetched?.done).toBe(true);
    expect(fetched?.priority).toBe(3);
  });

  it('should support modify() and incrementalModify() with mutator function', async () => {
    const counter = db.collection<{ id?: string; count: number; tags: string[] }>('counter');
    const raw = await counter.insert({ id: 'c1', count: 10, tags: ['initial'] });

    const doc = createXorinDocument(counter, raw);

    // Synchronous mutator via modify()
    await doc.modify((data) => {
      data.count += 5;
      data.tags.push('step1');
      return data;
    });

    expect(doc.count).toBe(15);
    expect(doc.tags).toEqual(['initial', 'step1']);

    // Asynchronous mutator via incrementalModify()
    await doc.incrementalModify(async (data) => {
      await new Promise(r => setTimeout(r, 10));
      return {
        ...data,
        count: data.count * 2,
        tags: [...data.tags, 'step2']
      };
    });

    expect(doc.count).toBe(30);
    expect(doc.tags).toEqual(['initial', 'step1', 'step2']);

    const inStorage = await counter.findById('c1');
    expect(inStorage?.count).toBe(30);
    expect(inStorage?.tags).toEqual(['initial', 'step1', 'step2']);
  });

  it('should support remove() and incrementalRemove() to soft-delete document', async () => {
    const items = db.collection<{ id?: string; name: string }>('items');
    const raw = await items.insert({ id: 'item1', name: 'Notebook' });

    const doc = createXorinDocument(items, raw);

    expect(doc.deleted).toBe(false);

    await doc.remove();

    expect(doc.deleted).toBe(true);

    // Finding document now returns null because it is soft-deleted
    const found = await items.findById('item1');
    expect(found).toBeNull();

    // Storage still keeps tombstone for replication
    const rawInStorage = await db.getStorage().get<any>('items', 'item1');
    expect(rawInStorage?._deleted).toBe(true);
  });

  it('should support toJSON() and toMutableJSON() with withMetaFields option and immutability', async () => {
    const users = db.collection<{ id?: string; name: string }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Alice' });
    const doc = createXorinDocument(users, raw);

    // toJSON() returns frozen object with meta fields by default
    const jsonWithMeta = doc.toJSON() as any;
    expect(jsonWithMeta.name).toBe('Alice');
    expect(jsonWithMeta._deleted).toBe(false);
    expect(jsonWithMeta._updatedAt).toBeTypeOf('number');
    expect(Object.isFrozen(jsonWithMeta)).toBe(true);

    // toJSON(false) strips meta fields
    const jsonWithoutMeta = doc.toJSON(false) as any;
    expect(jsonWithoutMeta._deleted).toBeUndefined();
    expect(jsonWithoutMeta._updatedAt).toBeUndefined();
    expect(Object.isFrozen(jsonWithoutMeta)).toBe(true);

    // toMutableJSON() returns mutable object without meta fields by default
    const mutableObj = doc.toMutableJSON() as any;
    expect(Object.isFrozen(mutableObj)).toBe(false);
    expect(mutableObj._deleted).toBeUndefined();
    // Freely mutating should not affect XorinDocument
    mutableObj.name = 'Locally Mutated';
    expect(doc.name).toBe('Alice');

    // toMutableJSON(true) includes meta fields
    const mutableWithMeta = doc.toMutableJSON(true) as any;
    expect(mutableWithMeta._deleted).toBe(false);
    expect(Object.isFrozen(mutableWithMeta)).toBe(false);
  });

  it('should throw error when trying to patch or modify an already deleted document', async () => {
    const todos = db.collection<{ id?: string; title: string }>('todos');
    const raw = await todos.insert({ id: 'todo1', title: 'Buy milk' });
    const doc = createXorinDocument(todos, raw);

    await doc.remove();

    // Expect incrementalPatch to throw
    await expect(doc.incrementalPatch({ title: 'New title' })).rejects.toThrow(
      'Cannot patch deleted document'
    );

    // Expect modify to throw
    await expect(doc.modify((data) => ({ ...data, title: 'New title' }))).rejects.toThrow(
      'Cannot modify deleted document'
    );
  });
});
