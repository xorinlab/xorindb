import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface OrderDocument {
  orderId: string;
  channel: string;
  tags: string[];
  items: Array<{
    sku: string;
    quantity: number;
    price: number;
  }>;
  scores?: number[];
  customer: {
    vipTiers: string[];
  };
}

describe('Chained Set and Array Methods (.in, .nin, .all, .size, .elemMatch)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-set-array-db-${Date.now()}` });
  });

  it('should filter with .in() and .nin() for scalar and array membership', async () => {
    const orders = await db.collection<OrderDocument>({ name: 'orders' });

    await orders.insert({
      orderId: 'O1',
      channel: 'web',
      tags: ['express', 'sale'],
      items: [{ sku: 'SKU-1', quantity: 1, price: 100 }],
      customer: { vipTiers: ['gold'] }
    });

    await orders.insert({
      orderId: 'O2',
      channel: 'mobile',
      tags: ['gift'],
      items: [{ sku: 'SKU-2', quantity: 2, price: 50 }],
      customer: { vipTiers: ['silver'] }
    });

    await orders.insert({
      orderId: 'O3',
      channel: 'in-store',
      tags: ['clearance'],
      items: [{ sku: 'SKU-3', quantity: 1, price: 30 }],
      customer: { vipTiers: ['bronze'] }
    });

    // .in() on scalar channel
    const digitalOrders = await orders.find()
      .where('channel').in(['web', 'mobile'])
      .exec();

    expect(digitalOrders.length).toBe(2);
    expect(digitalOrders.map(o => o.orderId).sort()).toEqual(['O1', 'O2']);

    // .nin() on scalar channel
    const nonInStore = await orders.find()
      .where('channel').nin(['in-store'])
      .exec();

    expect(nonInStore.length).toBe(2);
    expect(nonInStore.map(o => o.orderId).sort()).toEqual(['O1', 'O2']);
  });

  it('should verify array length with .size()', async () => {
    const orders = await db.collection<OrderDocument>({ name: 'orders' });

    await orders.insert({
      orderId: 'S1',
      channel: 'web',
      tags: ['a', 'b', 'c'],
      items: [{ sku: 'X', quantity: 1, price: 10 }],
      customer: { vipTiers: [] }
    });

    await orders.insert({
      orderId: 'S2',
      channel: 'web',
      tags: ['a'],
      items: [
        { sku: 'Y', quantity: 1, price: 20 },
        { sku: 'Z', quantity: 2, price: 30 }
      ],
      customer: { vipTiers: [] }
    });

    const threeTags = await orders.find()
      .where('tags').size(3)
      .exec();

    expect(threeTags.length).toBe(1);
    expect(threeTags[0].orderId).toBe('S1');

    const twoItems = await orders.find()
      .where('items').size(2)
      .exec();

    expect(twoItems.length).toBe(1);
    expect(twoItems[0].orderId).toBe('S2');
  });

  it('should verify required subset inclusion with .all()', async () => {
    const orders = await db.collection<OrderDocument>({ name: 'orders' });

    await orders.insert({
      orderId: 'A1',
      channel: 'web',
      tags: ['electronics', 'holiday', 'free-shipping'],
      items: [],
      customer: { vipTiers: [] }
    });

    await orders.insert({
      orderId: 'A2',
      channel: 'web',
      tags: ['electronics', 'clearance'],
      items: [],
      customer: { vipTiers: [] }
    });

    const holidayElectronics = await orders.find()
      .where('tags').all(['electronics', 'holiday'])
      .exec();

    expect(holidayElectronics.length).toBe(1);
    expect(holidayElectronics[0].orderId).toBe('A1');
  });

  it('should match nested array elements with .elemMatch()', async () => {
    const orders = await db.collection<OrderDocument>({ name: 'orders' });

    await orders.insert({
      orderId: 'EM1',
      channel: 'web',
      tags: [],
      items: [
        { sku: 'LAPTOP-PRO', quantity: 1, price: 1500 },
        { sku: 'MOUSE', quantity: 2, price: 25 }
      ],
      scores: [80, 95, 60],
      customer: { vipTiers: ['platinum'] }
    });

    await orders.insert({
      orderId: 'EM2',
      channel: 'web',
      tags: [],
      items: [
        { sku: 'KEYBOARD', quantity: 1, price: 80 },
        { sku: 'MOUSE', quantity: 1, price: 25 }
      ],
      scores: [70, 75, 82],
      customer: { vipTiers: ['gold'] }
    });

    // Object condition inside items array
    const expensiveOrders = await orders.find()
      .where('items').elemMatch({ price: { $gte: 1000 } })
      .exec();

    expect(expensiveOrders.length).toBe(1);
    expect(expensiveOrders[0].orderId).toBe('EM1');

    // Primitive condition inside scores array
    const topScorers = await orders.find()
      .where('scores').elemMatch({ $gte: 90 })
      .exec();

    expect(topScorers.length).toBe(1);
    expect(topScorers[0].orderId).toBe('EM1');
  });

  it('should support chained set and array methods on nested dot-notation paths', async () => {
    const orders = await db.collection<OrderDocument>({ name: 'orders' });

    await orders.insert({
      orderId: 'VIP1',
      channel: 'app',
      tags: [],
      items: [],
      customer: { vipTiers: ['founder', 'gold'] }
    });

    await orders.insert({
      orderId: 'VIP2',
      channel: 'app',
      tags: [],
      items: [],
      customer: { vipTiers: ['silver'] }
    });

    const founders = await orders.find()
      .where('customer.vipTiers').all(['founder'])
      .exec();

    expect(founders.length).toBe(1);
    expect(founders[0].orderId).toBe('VIP1');
  });
});
