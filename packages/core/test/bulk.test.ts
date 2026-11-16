import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Collection bulkInsert & bulkUpsert', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-bulk-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should bulkInsert valid documents and report conflicting duplicates in error array', async () => {
    const users = db.collection<{ id?: string; name: string; age: number }>('users');

    // Pre-insert a user with id 'u1'
    await users.insert({ id: 'u1', name: 'Original Alice', age: 20 });

    const result = await users.bulkInsert([
      { id: 'u1', name: 'Duplicate Alice', age: 22 }, // conflict
      { id: 'u2', name: 'Bob', age: 25 },
      { id: 'u3', name: 'Charlie', age: 30 }
    ]);

    expect(result.success).toHaveLength(2);
    expect(result.error).toHaveLength(1);
    expect(result.error[0].id).toBe('u1');
    expect(result.error[0].error.message).toContain('already exists');

    const u1 = await users.findById('u1');
    expect(u1?.name).toBe('Original Alice');

    const u2 = await users.findById('u2');
    expect(u2?.name).toBe('Bob');
  });

  it('should validate schemas during bulkInsert and collect schema errors', async () => {
    const products = db.collection<{ id?: string; name: string; price: number }>('products', {
      schema: {
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' }
        },
        required: ['name', 'price']
      }
    });

    const result = await products.bulkInsert([
      { id: 'p1', name: 'Laptop', price: 999 },
      { id: 'p2', name: 'Mouse' } as any // missing required 'price'
    ]);

    expect(result.success).toHaveLength(1);
    expect(result.error).toHaveLength(1);
    expect(result.error[0].id).toBe('p2');
    expect(result.error[0].error.message).toContain('is required');
  });

  it('should bulkUpsert inserting new docs and updating existing docs', async () => {
    const items = db.collection<{ id?: string; title: string; count: number }>('items');

    await items.insert({ id: 'i1', title: 'Item 1', count: 10 });

    const result = await items.bulkUpsert([
      { id: 'i1', title: 'Item 1 Updated', count: 15 }, // update
      { id: 'i2', title: 'Item 2 New', count: 5 }       // insert
    ]);

    expect(result.success).toHaveLength(2);
    expect(result.error).toHaveLength(0);

    const i1 = await items.findById('i1');
    expect(i1?.title).toBe('Item 1 Updated');
    expect(i1?.count).toBe(15);

    const i2 = await items.findById('i2');
    expect(i2?.title).toBe('Item 2 New');
    expect(i2?.count).toBe(5);
  });
});
