import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface InventoryItem {
  sku: string;
  category: string;
  name: string;
  price: number;
  stock: number;
  tags: string[];
  specs?: {
    weightKg?: number;
    dimensions?: {
      width: number;
      height: number;
    };
  };
  warehouse: {
    code: string;
    city: string;
  };
}

describe('Multi-Field & Multi-Operator Fluent Chaining Integration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-multifield-qb-db-${Date.now()}` });
  });

  it('should execute comprehensive multi-field and multi-operator query pipeline', async () => {
    const inventory = await db.collection<InventoryItem>({ name: 'inventory' });

    // 1. Matching candidate
    await inventory.insert({
      sku: 'MAC-M3-01',
      category: 'laptops',
      name: 'MacBook Pro 16',
      price: 2499,
      stock: 15,
      tags: ['pro', 'apple', 'silicon'],
      specs: {
        weightKg: 2.1,
        dimensions: { width: 35.5, height: 24.8 }
      },
      warehouse: { code: 'WH-US-W', city: 'San Jose' }
    });

    // 2. Fails price range (too low)
    await inventory.insert({
      sku: 'MAC-AIR-02',
      category: 'laptops',
      name: 'MacBook Air 13',
      price: 1099,
      stock: 30,
      tags: ['apple', 'silicon'],
      specs: {
        weightKg: 1.2,
        dimensions: { width: 30.4, height: 21.5 }
      },
      warehouse: { code: 'WH-US-W', city: 'San Jose' }
    });

    // 3. Fails warehouse city (.in)
    await inventory.insert({
      sku: 'DELL-XPS-03',
      category: 'laptops',
      name: 'Dell XPS 15',
      price: 1999,
      stock: 8,
      tags: ['pro', 'dell', 'windows'],
      specs: {
        weightKg: 1.9,
        dimensions: { width: 34.4, height: 23.0 }
      },
      warehouse: { code: 'WH-EU-E', city: 'Berlin' }
    });

    // 4. Fails stock check (out of stock)
    await inventory.insert({
      sku: 'THINKPAD-04',
      category: 'laptops',
      name: 'ThinkPad X1 Extreme',
      price: 2200,
      stock: 0,
      tags: ['pro', 'lenovo', 'business'],
      warehouse: { code: 'WH-US-W', city: 'Seattle' }
    });

    // Execute multi-field, multi-operator chained query:
    // Category = 'laptops', Price between 1500 and 3000, Stock > 0,
    // Warehouse in San Jose or Seattle, Name matches /macbook/i,
    // Tags include 'pro', and Nested weight exists
    const results = await inventory.find()
      .where('category').eq('laptops')
      .where('price').gte(1500).lte(3000)
      .where('stock').gt(0)
      .where('warehouse.city').in(['San Jose', 'Seattle'])
      .where('name').regex('macbook', 'i')
      .where('tags').in(['pro'])
      .where('specs.weightKg').exists(true)
      .sort({ price: 'desc' })
      .limit(5)
      .exec();

    expect(results.length).toBe(1);
    expect(results[0].sku).toBe('MAC-M3-01');
    expect(results[0].name).toBe('MacBook Pro 16');
  });

  it('should support multi-field and multi-operator chain on findOne() with mutation', async () => {
    const inventory = await db.collection<InventoryItem>({ name: 'inventory' });

    await inventory.insert({
      sku: 'IPAD-PRO-10',
      category: 'tablets',
      name: 'iPad Pro 13',
      price: 1299,
      stock: 5,
      tags: ['apple', 'tablet', 'oled'],
      warehouse: { code: 'WH-ASIA-1', city: 'Tokyo' }
    });

    // findOne with complex fluent conditions
    const matched = await inventory.findOne()
      .where('category').eq('tablets')
      .where('price').gte(1000)
      .where('warehouse.city').eq('Tokyo')
      .where('tags').all(['apple', 'oled'])
      .exec();

    expect(matched).not.toBeNull();
    expect(matched?.sku).toBe('IPAD-PRO-10');

    // Mutate using findOne update
    const updated = await inventory.findOne()
      .where('sku').eq('IPAD-PRO-10')
      .update({ stock: 4 });

    expect(updated?.stock).toBe(4);
  });

  it('should reactively update when data changes matching complex multi-field conditions', async () => {
    const inventory = await db.collection<InventoryItem>({ name: 'inventory' });

    const liveQuery = inventory.find()
      .where('price').lte(1000)
      .where('stock').gt(0);

    const emittedSnapshots: number[] = [];
    const unsub = liveQuery.$.subscribe((items) => {
      emittedSnapshots.push(items.length);
    });

    // Initial state: 0 items
    await new Promise(r => setTimeout(r, 40));
    expect(emittedSnapshots[0]).toBe(0);

    // Insert matching item
    await inventory.insert({
      sku: 'MINI-01',
      category: 'accessories',
      name: 'USB-C Dock',
      price: 89,
      stock: 50,
      tags: ['gadget'],
      warehouse: { code: 'W', city: 'Austin' }
    });

    await new Promise(r => setTimeout(r, 40));
    expect(emittedSnapshots.length).toBeGreaterThanOrEqual(2);
    expect(emittedSnapshots[emittedSnapshots.length - 1]).toBe(1);

    unsub();
  });
});
