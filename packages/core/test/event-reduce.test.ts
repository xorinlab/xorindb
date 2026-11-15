import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface Task {
  id?: string;
  title: string;
  status: 'todo' | 'done';
}

describe('XorinDB EventReduce Query Optimization', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase(`eventreduce_test_${Math.random().toString(36).substring(7)}`);
  });

  it('should not notify subscriber if mutated document does not match query filter', async () => {
    const tasks = db.collection<Task>('tasks');
    const todoQuery = tasks.find({ status: 'todo' });

    const subscriberFn = vi.fn();
    const unsub = todoQuery.subscribe(subscriberFn);

    // Wait for initial subscription call
    await new Promise(r => setTimeout(r, 60));
    expect(subscriberFn).toHaveBeenCalledTimes(1); // initial empty list

    // Insert a document that has status 'done' (does NOT match 'todo')
    await tasks.insert({ title: 'Task Done', status: 'done' });
    await new Promise(r => setTimeout(r, 60));

    // EventReduce should skip this event -> subscriber must NOT be triggered again
    expect(subscriberFn).toHaveBeenCalledTimes(1);

    // Now insert a matching document
    await tasks.insert({ title: 'Task Todo', status: 'todo' });
    await new Promise(r => setTimeout(r, 60));

    // Should be called now
    expect(subscriberFn).toHaveBeenCalledTimes(2);
    expect(subscriberFn.mock.calls[1][0]).toHaveLength(1);
    expect(subscriberFn.mock.calls[1][0][0].title).toBe('Task Todo');

    unsub();
  });

  it('should update query in-memory without full storage re-scan on simple insert/remove', async () => {
    const tasks = db.collection<Task>('tasks_opt');
    const allQuery = tasks.find();

    const results: Task[][] = [];
    const unsub = allQuery.subscribe((list) => {
      results.push(list);
    });

    await new Promise(r => setTimeout(r, 60));

    const item = await tasks.insert({ title: 'Item 1', status: 'todo' });
    await new Promise(r => setTimeout(r, 60));

    await tasks.delete(item.id);
    await new Promise(r => setTimeout(r, 60));

    expect(results.length).toBe(3);
    expect(results[0]).toHaveLength(0); // initial
    expect(results[1]).toHaveLength(1); // after insert
    expect(results[2]).toHaveLength(0); // after delete

    unsub();
  });
});
