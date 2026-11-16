import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';
import { createRxDocument, RxDocument } from '../src/document/rx-document';

describe('RxDocument Instance & Reactive Getters', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-rxdoc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should wrap raw document into RxDocument with proxy property access', async () => {
    const users = db.collection<{ id?: string; name: string; age: number }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Alice', age: 25 });

    const doc = createRxDocument(users, raw);

    expect(doc.id).toBe('u1');
    expect(doc.name).toBe('Alice');
    expect(doc.age).toBe(25);
    expect(doc.get('name')).toBe('Alice');
    expect(doc.toJSON().name).toBe('Alice');
    expect(doc.toMutableJSON()._deleted).toBeUndefined();
  });

  it('should reactively emit changes on whole document via doc.$', async () => {
    const users = db.collection<{ id?: string; name: string; age: number }>('users');
    const raw = await users.insert({ id: 'u1', name: 'Alice', age: 25 });

    const doc = createRxDocument(users, raw);
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

    const doc = createRxDocument(users, raw);
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

    const doc = createRxDocument(users, raw);
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
});
