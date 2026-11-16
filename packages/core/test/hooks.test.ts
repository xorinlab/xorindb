import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

describe('Collection Lifecycle Hooks', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `test-hooks-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      multiTab: false,
    });
  });

  it('should run preInsert and modify document before inserting', async () => {
    const users = db.collection<{ id?: string; name: string; createdAt?: number }>('users');

    users.preInsert((data) => {
      return {
        ...data,
        name: data.name ? data.name.trim().toUpperCase() : '',
        createdAt: 123456789
      };
    });

    const doc = await users.insert({ id: 'u1', name: '  alice  ' });
    expect(doc.name).toBe('ALICE');
    expect(doc.createdAt).toBe(123456789);

    const fetched = await users.findById('u1');
    expect(fetched?.name).toBe('ALICE');
    expect(fetched?.createdAt).toBe(123456789);
  });

  it('should run postInsert and preSave/postSave hooks', async () => {
    const logs: string[] = [];
    const notes = db.collection<{ id?: string; text: string }>('notes');

    notes
      .postInsert((doc) => {
        logs.push(`postInsert:${doc.id}`);
      })
      .preSave((doc) => {
        logs.push(`preSave:${doc.id}`);
      })
      .postSave((doc) => {
        logs.push(`postSave:${doc.id}`);
      });

    await notes.insert({ id: 'n1', text: 'Note 1' });
    expect(logs).toEqual(['preSave:n1', 'postInsert:n1', 'postSave:n1']);

    // Now update Note 1
    logs.length = 0;
    await notes.update('n1', { text: 'Note 1 updated' });
    expect(logs).toEqual(['preSave:n1', 'postSave:n1']);
  });

  it('should run preRemove and postRemove hooks on delete', async () => {
    const audit: string[] = [];
    const items = db.collection<{ id?: string; val: number }>('items');

    items
      .preRemove((id, doc) => {
        audit.push(`preRemove:${id}:${doc?.val}`);
      })
      .postRemove((id, doc) => {
        audit.push(`postRemove:${id}:${doc?.val}`);
      });

    await items.insert({ id: 'i1', val: 99 });
    await items.delete('i1');

    expect(audit).toEqual(['preRemove:i1:99', 'postRemove:i1:99']);
  });
});
