import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('XorinDB Leader Election, Lifecycle & Singleton', () => {
  let db: Database;
  const dbName = `leader_test_${Math.random().toString(36).substring(7)}`;

  beforeEach(async () => {
    db = await createDatabase(dbName);
  });

  it('should acquire leadership using waitForLeadership()', async () => {
    const isLeader = await db.waitForLeadership();
    expect(isLeader).toBe(true);
    expect(db.isLeader()).toBe(true);
  });

  it('should reuse existing database instance when ignoreDuplicate is true (default)', async () => {
    const sameDb = await createDatabase(dbName);
    expect(sameDb).toBe(db);
  });

  it('should throw error when ignoreDuplicate is explicitly set to false and duplicate created', async () => {
    await expect(
      createDatabase({ name: dbName, ignoreDuplicate: false })
    ).rejects.toThrow(/already created/);
  });

  it('should drop database with remove() and allow creating clean fresh instance', async () => {
    const items = db.collection<{ title: string }>('items');
    await items.insert({ title: 'Item to be removed' });

    await db.remove();

    // Recreate fresh DB with same name
    const freshDb = await createDatabase(dbName);
    const freshItems = freshDb.collection('items');
    const all = await freshItems.find().exec();
    expect(all).toHaveLength(0);
    await freshDb.close();
  });
});
