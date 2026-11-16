import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Query Cache & De-duplication', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-query-cache-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should return identical Query instance for identical filter and options (de-duplication)', async () => {
    const tasks = db.collection<{ id?: string; title: string; done: boolean }>('tasks');

    const query1 = tasks.find({ done: false });
    const query2 = tasks.find({ done: false });

    // Same reference in memory!
    expect(query1).toBe(query2);
    expect(tasks.getQueryCache().size).toBe(1);

    const queryWithLimit1 = tasks.find({ done: false }, { limit: 5 });
    const queryWithLimit2 = tasks.find({ done: false }, { limit: 5 });
    expect(queryWithLimit1).toBe(queryWithLimit2);
    expect(queryWithLimit1).not.toBe(query1);

    expect(tasks.getQueryCache().size).toBe(2);
  });

  it('should de-duplicate identical Mango selector query objects', async () => {
    const items = db.collection<{ id?: string; category: string; price: number }>('items');

    const q1 = items.find({
      selector: { category: 'electronics' },
      sort: { price: 'asc' },
      limit: 10
    });

    const q2 = items.find({
      selector: { category: 'electronics' },
      sort: { price: 'asc' },
      limit: 10
    });

    expect(q1).toBe(q2);
  });

  it('should clear query cache when requested', async () => {
    const posts = db.collection<{ id?: string; title: string }>('posts');
    posts.find({ title: 'test' });
    expect(posts.getQueryCache().size).toBe(1);

    posts.getQueryCache().clear();
    expect(posts.getQueryCache().size).toBe(0);
  });
});
