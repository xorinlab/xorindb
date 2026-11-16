import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface Product {
  title: string;
  price: number;
  rating: number;
  inStock: boolean;
  tags: string[];
  vendor: {
    name: string;
    city: string;
  };
  specs?: {
    warrantyYears?: number;
  };
}

describe('Query Builder Fluent Method Chaining (.where(field)...)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-qb-db-${Date.now()}` });
  });

  it('should chain .where(field).eq() and .ne()', async () => {
    const products = await db.collection<Product>({ name: 'products' });

    await products.insert({
      title: 'Phone X',
      price: 800,
      rating: 4.5,
      inStock: true,
      tags: ['electronics', 'mobile'],
      vendor: { name: 'AppleLab', city: 'Cupertino' }
    });

    await products.insert({
      title: 'Headphones Pro',
      price: 150,
      rating: 4.0,
      inStock: false,
      tags: ['audio'],
      vendor: { name: 'AudioLab', city: 'Tokyo' }
    });

    const inStockItems = await products.find()
      .where('inStock').eq(true)
      .exec();

    expect(inStockItems.length).toBe(1);
    expect(inStockItems[0].title).toBe('Phone X');

    const nonAudioItems = await products.find()
      .where('inStock').ne(false)
      .exec();

    expect(nonAudioItems.length).toBe(1);
    expect(nonAudioItems[0].title).toBe('Phone X');
  });

  it('should chain range operators .gt(), .gte(), .lt(), .lte() on same and multiple fields', async () => {
    const products = await db.collection<Product>({ name: 'products' });

    await products.insert({
      title: 'Item A',
      price: 50,
      rating: 3.5,
      inStock: true,
      tags: [],
      vendor: { name: 'V1', city: 'NY' }
    });

    await products.insert({
      title: 'Item B',
      price: 100,
      rating: 4.2,
      inStock: true,
      tags: [],
      vendor: { name: 'V2', city: 'SF' }
    });

    await products.insert({
      title: 'Item C',
      price: 200,
      rating: 4.8,
      inStock: true,
      tags: [],
      vendor: { name: 'V3', city: 'Austin' }
    });

    // Multiple conditions on price: 50 < price <= 100
    const midPriceItems = await products.find()
      .where('price').gt(50).lte(100)
      .exec();

    expect(midPriceItems.length).toBe(1);
    expect(midPriceItems[0].title).toBe('Item B');

    // Multi-field chain: price >= 100 and rating > 4.5
    const premiumItems = await products.find()
      .where('price').gte(100)
      .where('rating').gt(4.5)
      .exec();

    expect(premiumItems.length).toBe(1);
    expect(premiumItems[0].title).toBe('Item C');
  });

  it('should chain .in(), .nin(), .regex() and nested dot-notation', async () => {
    const products = await db.collection<Product>({ name: 'products' });

    await products.insert({
      title: 'Smart Watch',
      price: 250,
      rating: 4.6,
      inStock: true,
      tags: ['gadget', 'wearable'],
      vendor: { name: 'Zenith Tech', city: 'Zurich' }
    });

    await products.insert({
      title: 'Vintage Clock',
      price: 120,
      rating: 3.8,
      inStock: true,
      tags: ['decor'],
      vendor: { name: 'Classic Antique', city: 'London' }
    });

    // .where(nested).regex()
    const techVendors = await products.find()
      .where('vendor.name').regex('tech', 'i')
      .exec();

    expect(techVendors.length).toBe(1);
    expect(techVendors[0].title).toBe('Smart Watch');

    // .in() on array
    const matchedTag = await products.find()
      .where('vendor.city').in(['Zurich', 'Berlin'])
      .exec();

    expect(matchedTag.length).toBe(1);
    expect(matchedTag[0].title).toBe('Smart Watch');
  });

  it('should chain .exists(), .type(), and .size()', async () => {
    const products = await db.collection<Product>({ name: 'products' });

    await products.insert({
      title: 'Tablet',
      price: 400,
      rating: 4.5,
      inStock: true,
      tags: ['tech', 'screen'],
      vendor: { name: 'V', city: 'C' },
      specs: { warrantyYears: 2 }
    });

    await products.insert({
      title: 'Pen',
      price: 10,
      rating: 4.0,
      inStock: true,
      tags: ['stationery'],
      vendor: { name: 'V', city: 'C' }
    });

    // .where(nested).exists()
    const withWarranty = await products.find()
      .where('specs.warrantyYears').exists(true)
      .exec();

    expect(withWarranty.length).toBe(1);
    expect(withWarranty[0].title).toBe('Tablet');

    // .size()
    const twoTags = await products.find()
      .where('tags').size(2)
      .exec();

    expect(twoTags.length).toBe(1);
    expect(twoTags[0].title).toBe('Tablet');
  });

  it('should support fluent method chaining on findOne() and reactive subscriptions', async () => {
    const products = await db.collection<Product>({ name: 'products' });

    await products.insert({
      title: 'Keyboard RGB',
      price: 89,
      rating: 4.7,
      inStock: true,
      tags: ['pc'],
      vendor: { name: 'GamerCo', city: 'Seoul' }
    });

    // findOne fluent chaining
    const single = await products.findOne()
      .where('price').lt(100)
      .where('rating').gte(4.5)
      .exec();

    expect(single).not.toBeNull();
    expect(single?.title).toBe('Keyboard RGB');

    // Reactive subscription with query builder
    let emittedTitle = '';
    const query = products.find().where('price').gt(50);
    const unsub = query.$.subscribe((items) => {
      if (items.length > 0) {
        emittedTitle = items[0].title;
      }
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(emittedTitle).toBe('Keyboard RGB');
    unsub();
  });

  it('should throw descriptive error when calling operator before .where()', async () => {
    const products = await db.collection<Product>({ name: 'products' });

    expect(() => {
      // @ts-expect-error test invalid runtime call
      products.find().gt(10);
    }).toThrow(/Cannot apply operator '\$gt' without active field/);
  });
});
