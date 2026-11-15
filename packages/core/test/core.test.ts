import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface Todo {
  id?: string;
  title: string;
  completed: boolean;
  order?: number;
}

describe('XorinDB Core', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test_db_${Math.random().toString(36).substring(7)}`,
      multiTab: false
    });
  });

  it('should insert a document and assign default UUID and metadata', async () => {
    const todos = db.collection<Todo>('todos');
    const item = await todos.insert({
      title: 'Buy milk',
      completed: false
    });

    expect(item.id).toBeDefined();
    expect(typeof item.id).toBe('string');
    expect(item.title).toBe('Buy milk');
    expect(item.completed).toBe(false);
    expect(item._deleted).toBe(false);
    expect(item._updatedAt).toBeTypeOf('number');

    const fetched = await todos.findById(item.id);
    expect(fetched).toEqual(item);
  });

  it('should query documents with filter, sort and pagination', async () => {
    const todos = db.collection<Todo>('todos');

    await todos.insertMany([
      { title: 'Task 1', completed: false, order: 1 },
      { title: 'Task 2', completed: true, order: 2 },
      { title: 'Task 3', completed: false, order: 3 },
    ]);

    const activeTodos = await todos.find({ completed: false }, { sort: { order: 'asc' } }).exec();
    expect(activeTodos).toHaveLength(2);
    expect(activeTodos[0].title).toBe('Task 1');
    expect(activeTodos[1].title).toBe('Task 3');

    const limited = await todos.find({}, { limit: 2, sort: { order: 'asc' } }).exec();
    expect(limited).toHaveLength(2);
    expect(limited[0].title).toBe('Task 1');
    expect(limited[1].title).toBe('Task 2');
  });

  it('should support live reactive queries via subscribe()', async () => {
    const todos = db.collection<Todo>('todos');
    const query = todos.find({ completed: false });

    const receivedBatches: Todo[][] = [];
    const unsub = query.subscribe((list) => {
      receivedBatches.push(list);
    });

    // Wait microtask for initial query
    await new Promise(r => setTimeout(r, 50));

    await todos.insert({ title: 'Task A', completed: false });
    await new Promise(r => setTimeout(r, 50));

    await todos.insert({ title: 'Task B', completed: true }); // should not be included in completed: false
    await new Promise(r => setTimeout(r, 50));

    expect(receivedBatches.length).toBeGreaterThanOrEqual(2);
    const lastBatch = receivedBatches[receivedBatches.length - 1];
    expect(lastBatch.some(t => t.title === 'Task A')).toBe(true);
    expect(lastBatch.some(t => t.title === 'Task B')).toBe(false);

    unsub();
  });

  it('should soft-delete documents as tombstones for replication', async () => {
    const todos = db.collection<Todo>('todos');
    const item = await todos.insert({ title: 'Temporary task', completed: false });

    await todos.delete(item.id);

    const activeAfterDelete = await todos.find().exec();
    expect(activeAfterDelete.find(t => t.id === item.id)).toBeUndefined();

    // Verify it exists in raw storage with _deleted: true
    const rawDoc = await db.getStorage().get(todos.getName(), item.id);
    expect(rawDoc?._deleted).toBe(true);
  });
});
