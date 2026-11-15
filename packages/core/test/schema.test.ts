import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface Product {
  id?: string;
  name: string;
  price: number;
  category: 'electronics' | 'clothing' | 'books';
}

describe('XorinDB Schema Validation & Types', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase(`schema_test_${Math.random().toString(36).substring(7)}`);
  });

  it('should accept valid documents that match the schema', async () => {
    const products = db.collection<Product>('products', {
      schema: {
        required: ['name', 'price', 'category'],
        properties: {
          name: { type: 'string', minLength: 2 },
          price: { type: 'number', minimum: 0 },
          category: { type: 'string', enum: ['electronics', 'clothing', 'books'] }
        }
      }
    });

    const item = await products.insert({
      name: 'Mechanical Keyboard',
      price: 120,
      category: 'electronics'
    });

    expect(item.id).toBeDefined();
    expect(item.name).toBe('Mechanical Keyboard');
  });

  it('should reject documents missing required fields', async () => {
    const products = db.collection<Product>('products_req', {
      schema: {
        required: ['name', 'price'],
        properties: {
          name: { type: 'string' },
          price: { type: 'number' }
        }
      }
    });

    // @ts-expect-error missing price
    await expect(products.insert({ name: 'Incomplete' })).rejects.toThrow(
      /Field "price" is required/
    );
  });

  it('should reject documents with invalid types or enum constraints', async () => {
    const products = db.collection<Product>('products_invalid', {
      schema: {
        required: ['name', 'price', 'category'],
        properties: {
          name: { type: 'string' },
          price: { type: 'number', minimum: 10 },
          category: { type: 'string', enum: ['electronics', 'clothing', 'books'] }
        }
      }
    });

    // @ts-expect-error price string instead of number
    await expect(products.insert({ name: 'Phone', price: 'invalid', category: 'electronics' }))
      .rejects.toThrow(/must be a number/);

    // price below minimum
    await expect(products.insert({ name: 'Phone', price: 5, category: 'electronics' }))
      .rejects.toThrow(/must be >= 10/);

    // invalid enum
    // @ts-expect-error invalid enum value
    await expect(products.insert({ name: 'Phone', price: 50, category: 'food' }))
      .rejects.toThrow(/must be one of/);
  });
});
