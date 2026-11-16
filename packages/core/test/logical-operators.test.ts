import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Query Logical Operators ($or, $and, $nor, $not)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-logical-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should match documents with $or operator', async () => {
    const tasks = db.collection<{ id?: string; title: string; status: string; priority: number }>('tasks');

    await tasks.bulkInsert([
      { id: 't1', title: 'Task 1', status: 'todo', priority: 1 },
      { id: 't2', title: 'Task 2', status: 'in_progress', priority: 10 },
      { id: 't3', title: 'Task 3', status: 'done', priority: 2 },
      { id: 't4', title: 'Task 4', status: 'done', priority: 9 },
    ]);

    // Matches if status is 'todo' OR priority >= 9
    const results = await tasks.find({
      selector: {
        $or: [
          { status: 'todo' },
          { priority: { $gte: 9 } }
        ]
      }
    }).exec();

    // t1 (todo), t2 (priority 10), t4 (priority 9)
    expect(results).toHaveLength(3);
    const ids = results.map(r => r.id).sort();
    expect(ids).toEqual(['t1', 't2', 't4']);
  });

  it('should match documents with $and operator', async () => {
    const users = db.collection<{ id?: string; name: string; age: number; role: string }>('users');

    await users.bulkInsert([
      { id: 'u1', name: 'Alice', age: 25, role: 'admin' },
      { id: 'u2', name: 'Bob', age: 35, role: 'editor' },
      { id: 'u3', name: 'Charlie', age: 40, role: 'admin' },
    ]);

    // Matches if role is 'admin' AND age > 30
    const results = await users.find({
      selector: {
        $and: [
          { role: 'admin' },
          { age: { $gt: 30 } }
        ]
      }
    }).exec();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Charlie');
  });

  it('should match documents with $nor operator', async () => {
    const items = db.collection<{ id?: string; category: string; price: number }>('items');

    await items.bulkInsert([
      { id: 'i1', category: 'electronics', price: 100 },
      { id: 'i2', category: 'furniture', price: 50 },
      { id: 'i3', category: 'books', price: 20 },
      { id: 'i4', category: 'books', price: 80 },
    ]);

    // Neither electronics NOR price > 60
    const results = await items.find({
      selector: {
        $nor: [
          { category: 'electronics' },
          { price: { $gt: 60 } }
        ]
      }
    }).exec();

    // i2 (furniture, 50), i3 (books, 20)
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.id).sort();
    expect(ids).toEqual(['i2', 'i3']);
  });

  it('should match documents with top-level and field-level $not operator', async () => {
    const products = db.collection<{ id?: string; title: string; rating: number }>('products');

    await products.bulkInsert([
      { id: 'p1', title: 'Product 1', rating: 5 },
      { id: 'p2', title: 'Product 2', rating: 3 },
      { id: 'p3', title: 'Product 3', rating: 1 },
    ]);

    // Top-level $not
    const highRated = await products.find({
      selector: {
        $not: { rating: { $lt: 4 } }
      }
    }).exec();

    expect(highRated).toHaveLength(1);
    expect(highRated[0].id).toBe('p1');

    // Field-level $not
    const notThree = await products.find({
      selector: {
        rating: { $not: { $eq: 3 } }
      }
    }).exec();

    expect(notThree).toHaveLength(2);
    expect(notThree.map(p => p.id).sort()).toEqual(['p1', 'p3']);
  });
});
