import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Query update() & remove() bulk mutations', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-query-mutations-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should update all documents matching the query filter using query.update()', async () => {
    const tasks = db.collection<{ id?: string; title: string; status: string; priority: number }>('tasks');

    await tasks.bulkInsert([
      { id: 't1', title: 'Task 1', status: 'todo', priority: 1 },
      { id: 't2', title: 'Task 2', status: 'todo', priority: 2 },
      { id: 't3', title: 'Task 3', status: 'done', priority: 5 },
    ]);

    // Bulk update all 'todo' items to 'in_progress' and set priority to 3
    const updated = await tasks.find({ status: 'todo' }).update({
      status: 'in_progress',
      priority: 3
    });

    expect(updated).toHaveLength(2);
    expect(updated.every(d => d.status === 'in_progress' && d.priority === 3)).toBe(true);

    // Verify storage reflects changes
    const t1 = await tasks.findById('t1');
    const t2 = await tasks.findById('t2');
    const t3 = await tasks.findById('t3');

    expect(t1?.status).toBe('in_progress');
    expect(t1?.priority).toBe(3);
    expect(t2?.status).toBe('in_progress');
    expect(t2?.priority).toBe(3);
    expect(t3?.status).toBe('done'); // untouched
  });

  it('should remove all documents matching the query filter using query.remove()', async () => {
    const logs = db.collection<{ id?: string; level: string; message: string }>('logs');

    await logs.bulkInsert([
      { id: 'l1', level: 'info', message: 'System startup' },
      { id: 'l2', level: 'debug', message: 'Connecting to DB' },
      { id: 'l3', level: 'debug', message: 'Cache miss' },
      { id: 'l4', level: 'error', message: 'Timeout' },
    ]);

    // Bulk remove all 'debug' logs
    const removed = await logs.find({ level: 'debug' }).remove();
    expect(removed).toHaveLength(2);
    expect(removed.map(r => r.id).sort()).toEqual(['l2', 'l3']);

    // Check count after removal
    const activeCount = await logs.count();
    expect(activeCount).toBe(2);

    const remaining = await logs.find().exec();
    expect(remaining.map(r => r.level).sort()).toEqual(['error', 'info']);
  });

  it('should support update() and remove() on findOne() query', async () => {
    const profiles = db.collection<{ id?: string; name: string; verified: boolean }>('profiles');

    await profiles.insert({ id: 'p1', name: 'Alice', verified: false });

    // Update single document via findOne().update()
    const updated = await profiles.findOne('p1').update({ verified: true });
    expect(updated?.verified).toBe(true);

    const check = await profiles.findById('p1');
    expect(check?.verified).toBe(true);

    // Remove single document via findOne().remove()
    const removed = await profiles.findOne('p1').remove();
    expect(removed?.id).toBe('p1');

    const afterRemove = await profiles.findById('p1');
    expect(afterRemove).toBeNull();
  });
});
