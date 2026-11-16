import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Collection findOne & Method Chaining', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-findone-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should find a single document by string primary key', async () => {
    const users = db.collection<{ id?: string; name: string; role: string }>('users');
    await users.insert({ id: 'u1', name: 'Alice', role: 'admin' });
    await users.insert({ id: 'u2', name: 'Bob', role: 'user' });

    const user = await users.findOne('u1').exec();
    expect(user).toBeDefined();
    expect(user?.name).toBe('Alice');
    expect(user?.role).toBe('admin');
  });

  it('should support chaining .where() and .sort() on findOne()', async () => {
    const posts = db.collection<{ id?: string; title: string; views: number }>('posts');
    await posts.insert({ id: 'p1', title: 'First Post', views: 50 });
    await posts.insert({ id: 'p2', title: 'Top Post', views: 500 });
    await posts.insert({ id: 'p3', title: 'Average Post', views: 150 });

    const topPost = await posts
      .findOne()
      .where({ views: { $gt: 100 } })
      .sort({ views: 'desc' })
      .exec();

    expect(topPost).toBeDefined();
    expect(topPost?.id).toBe('p2');
    expect(topPost?.title).toBe('Top Post');
  });

  it('should support reactive live subscription via findOne().$.subscribe()', async () => {
    const profiles = db.collection<{ id?: string; username: string; status: string }>('profiles');
    await profiles.insert({ id: 'user1', username: 'john_doe', status: 'offline' });

    const received: string[] = [];

    const unsubscribe = profiles.findOne('user1').$.subscribe((doc) => {
      if (doc) received.push(doc.status);
    });

    // Wait for initial fetch
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual(['offline']);

    // Update document
    await profiles.update('user1', { status: 'online' });
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual(['offline', 'online']);

    unsubscribe();
  });

  it('should return null when document is not found or soft-deleted', async () => {
    const tasks = db.collection<{ id?: string; text: string }>('tasks');
    await tasks.insert({ id: 't1', text: 'Clean room' });

    const found = await tasks.findOne('non_existing').exec();
    expect(found).toBeNull();

    await tasks.delete('t1');
    const afterDelete = await tasks.findOne('t1').exec();
    expect(afterDelete).toBeNull();
  });
});
