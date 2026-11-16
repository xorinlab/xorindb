import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Collection Upsert & IncrementalUpsert', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-upsert-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should insert when document does not exist using upsert()', async () => {
    const users = db.collection<{ id?: string; name: string; score: number }>('users');

    const doc = await users.upsert({ id: 'u1', name: 'Alice', score: 10 });
    expect(doc.id).toBe('u1');
    expect(doc.name).toBe('Alice');
    expect(doc.score).toBe(10);

    const found = await users.findById('u1');
    expect(found?.name).toBe('Alice');
  });

  it('should update when document exists using upsert()', async () => {
    const users = db.collection<{ id?: string; name: string; score: number }>('users');

    await users.insert({ id: 'u1', name: 'Alice', score: 10 });
    const updated = await users.upsert({ id: 'u1', name: 'Alice Updated', score: 25 });

    expect(updated.id).toBe('u1');
    expect(updated.name).toBe('Alice Updated');
    expect(updated.score).toBe(25);

    const found = await users.findById('u1');
    expect(found?.name).toBe('Alice Updated');
    expect(found?.score).toBe(25);
  });

  it('should safely mutate and insert or update with incrementalUpsert()', async () => {
    const counter = db.collection<{ id?: string; count: number }>('counter');

    // Case 1: Doc does not exist yet, initial doc provided
    const res1 = await counter.incrementalUpsert(
      { id: 'c1', count: 0 },
      (doc) => ({ ...doc, count: doc.count + 5 })
    );
    expect(res1.count).toBe(5);

    // Case 2: Doc exists, update via mutator
    const res2 = await counter.incrementalUpsert(
      'c1',
      (doc) => ({ ...doc, count: doc.count + 10 })
    );
    expect(res2.count).toBe(15);

    // Case 3: Async mutator function
    const res3 = await counter.incrementalUpsert(
      'c1',
      async (doc) => {
        return { ...doc, count: doc.count * 2 };
      }
    );
    expect(res3.count).toBe(30);

    const finalDoc = await counter.findById('c1');
    expect(finalDoc?.count).toBe(30);
  });
});
