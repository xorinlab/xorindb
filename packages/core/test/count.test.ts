import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Collection count() & Query count()', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-count-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should return total count of active documents in collection', async () => {
    const tasks = db.collection<{ id?: string; title: string; done: boolean }>('tasks');

    expect(await tasks.count()).toBe(0);

    await tasks.bulkInsert([
      { id: 't1', title: 'Task 1', done: false },
      { id: 't2', title: 'Task 2', done: true },
      { id: 't3', title: 'Task 3', done: false },
    ]);

    expect(await tasks.count()).toBe(3);

    // Delete one document (tombstone)
    await tasks.delete('t2');

    // Count should exclude tombstones
    expect(await tasks.count()).toBe(2);
  });

  it('should return filtered count using collection.count(filter) and query.count()', async () => {
    const products = db.collection<{ id?: string; name: string; category: string; inStock: boolean }>('products');

    await products.bulkInsert([
      { id: 'p1', name: 'Keyboard', category: 'electronics', inStock: true },
      { id: 'p2', name: 'Mouse', category: 'electronics', inStock: false },
      { id: 'p3', name: 'Desk', category: 'furniture', inStock: true },
      { id: 'p4', name: 'Monitor', category: 'electronics', inStock: true },
    ]);

    // Fast filtered count on collection
    const electronicsCount = await products.count({ category: 'electronics' });
    expect(electronicsCount).toBe(3);

    // Filtered count on Query chain
    const inStockElectronics = await products.find({ category: 'electronics', inStock: true }).count();
    expect(inStockElectronics).toBe(2);

    const furnitureCount = await products.find({ category: 'furniture' }).count();
    expect(furnitureCount).toBe(1);
  });
});
