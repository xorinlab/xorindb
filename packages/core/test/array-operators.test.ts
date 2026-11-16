import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface Order {
  orderId: string;
  tags: string[];
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  scores?: number[];
}

describe('Array Query Operators ($size, $all, $elemMatch)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-array-db-${Date.now()}` });
  });

  it('should query documents by array length using $size', async () => {
    const orders = await db.collection<Order>({ name: 'orders' });

    await orders.insert({
      orderId: 'ORD-1',
      tags: ['express', 'gift'],
      items: [{ name: 'Laptop', quantity: 1, price: 1200 }]
    });

    await orders.insert({
      orderId: 'ORD-2',
      tags: ['standard'],
      items: [
        { name: 'Mouse', quantity: 2, price: 25 },
        { name: 'Keyboard', quantity: 1, price: 75 }
      ]
    });

    const twoTagOrders = await orders.find({
      tags: { $size: 2 }
    }).exec();

    expect(twoTagOrders.length).toBe(1);
    expect(twoTagOrders[0].orderId).toBe('ORD-1');

    const twoItemOrders = await orders.find({
      items: { $size: 2 }
    }).exec();

    expect(twoItemOrders.length).toBe(1);
    expect(twoItemOrders[0].orderId).toBe('ORD-2');
  });

  it('should query documents containing all required elements using $all', async () => {
    const orders = await db.collection<Order>({ name: 'orders' });

    await orders.insert({
      orderId: 'ORD-A',
      tags: ['electronics', 'gadgets', 'sale'],
      items: []
    });

    await orders.insert({
      orderId: 'ORD-B',
      tags: ['electronics', 'sale'],
      items: []
    });

    await orders.insert({
      orderId: 'ORD-C',
      tags: ['books', 'sale'],
      items: []
    });

    const electronicSales = await orders.find({
      tags: { $all: ['electronics', 'sale'] }
    }).exec();

    expect(electronicSales.length).toBe(2);
    const ids = electronicSales.map(o => o.orderId).sort();
    expect(ids).toEqual(['ORD-A', 'ORD-B']);

    const fullMatch = await orders.find({
      tags: { $all: ['electronics', 'gadgets', 'sale'] }
    }).exec();

    expect(fullMatch.length).toBe(1);
    expect(fullMatch[0].orderId).toBe('ORD-A');
  });

  it('should query arrays of objects using $elemMatch with complex conditions', async () => {
    const orders = await db.collection<Order>({ name: 'orders' });

    await orders.insert({
      orderId: 'ORD-X',
      tags: ['hardware'],
      items: [
        { name: 'Monitor', quantity: 1, price: 300 },
        { name: 'Cable', quantity: 3, price: 10 }
      ]
    });

    await orders.insert({
      orderId: 'ORD-Y',
      tags: ['hardware'],
      items: [
        { name: 'GPU', quantity: 1, price: 800 },
        { name: 'Cable', quantity: 1, price: 15 }
      ]
    });

    // Match order containing an item with price >= 500
    const expensiveOrders = await orders.find({
      items: {
        $elemMatch: {
          price: { $gte: 500 }
        }
      }
    }).exec();

    expect(expensiveOrders.length).toBe(1);
    expect(expensiveOrders[0].orderId).toBe('ORD-Y');

    // Match order containing Cable with quantity >= 2
    const bulkCables = await orders.find({
      items: {
        $elemMatch: {
          name: 'Cable',
          quantity: { $gte: 2 }
        }
      }
    }).exec();

    expect(bulkCables.length).toBe(1);
    expect(bulkCables[0].orderId).toBe('ORD-X');
  });

  it('should support $elemMatch on primitive arrays with value operator conditions', async () => {
    const orders = await db.collection<Order>({ name: 'orders' });

    await orders.insert({
      orderId: 'ORD-10',
      tags: [],
      items: [],
      scores: [10, 20, 95]
    });

    await orders.insert({
      orderId: 'ORD-20',
      tags: [],
      items: [],
      scores: [50, 60, 70]
    });

    const highScorers = await orders.find({
      scores: {
        $elemMatch: {
          $gt: 90
        }
      }
    }).exec();

    expect(highScorers.length).toBe(1);
    expect(highScorers[0].orderId).toBe('ORD-10');
  });
});
