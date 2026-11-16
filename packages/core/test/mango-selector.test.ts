import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Mango Query Selector Compatibility', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-mango-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should support Mango-style query object with selector, sort, limit, skip on find()', async () => {
    const scores = db.collection<{ id?: string; player: string; score: number; level: number }>('scores');

    await scores.bulkInsert([
      { id: 'p1', player: 'Alice', score: 100, level: 1 },
      { id: 'p2', player: 'Bob', score: 250, level: 2 },
      { id: 'p3', player: 'Charlie', score: 300, level: 2 },
      { id: 'p4', player: 'David', score: 180, level: 2 },
      { id: 'p5', player: 'Eve', score: 90, level: 1 },
    ]);

    // RxDB Mango-style query object
    const results = await scores.find({
      selector: {
        level: { $eq: 2 },
        score: { $gte: 150 }
      },
      sort: { score: 'desc' },
      skip: 1,
      limit: 2
    }).exec();

    // Matching level 2 and score >= 150: Charlie (300), Bob (250), David (180)
    // Sorted desc: Charlie, Bob, David
    // Skip 1, limit 2: Bob (250), David (180)
    expect(results).toHaveLength(2);
    expect(results[0].player).toBe('Bob');
    expect(results[1].player).toBe('David');
  });

  it('should support Mango selector on findOne() and count()', async () => {
    const items = db.collection<{ id?: string; name: string; tag: string; price: number }>('items');

    await items.bulkInsert([
      { id: 'i1', name: 'Keyboard', tag: 'tech', price: 75 },
      { id: 'i2', name: 'Mouse', tag: 'tech', price: 30 },
      { id: 'i3', name: 'Table', tag: 'furniture', price: 150 },
    ]);

    // findOne with selector
    const item = await items.findOne({
      selector: { tag: 'tech' },
      sort: { price: 'desc' }
    }).exec();

    expect(item).toBeDefined();
    expect(item?.name).toBe('Keyboard');

    // count with selector
    const count = await items.count({
      selector: { tag: 'tech' }
    });
    expect(count).toBe(2);
  });
});
