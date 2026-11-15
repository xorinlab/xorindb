import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database, replicateHttp } from '../src';

interface Item {
  id?: string;
  name: string;
  status: string;
}

describe('XorinDB HTTP Replication', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({
      name: `sync_test_${Math.random().toString(36).substring(7)}`,
      multiTab: false
    });
  });

  it('should pull new documents from server and update local database', async () => {
    const items = db.collection<Item>('items');

    const fakeServerDoc = {
      id: 'srv-1',
      name: 'Server Item 1',
      status: 'pending',
      _deleted: false,
      _updatedAt: Date.now()
    };

    // Mock global fetch
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/pull')) {
        return {
          ok: true,
          json: async () => ({
            documents: [fakeServerDoc],
            checkpoint: { id: fakeServerDoc.id, updatedAt: fakeServerDoc._updatedAt }
          })
        };
      }
      return { ok: true, json: async () => [] };
    });

    const sync = replicateHttp(items, {
      url: 'https://mock-api.com',
      pullStream: false
    });

    await new Promise(r => setTimeout(r, 100));

    const localItems = await items.find().exec();
    expect(localItems.some(i => i.id === 'srv-1')).toBe(true);

    sync.stop();
  });

  it('should push local changes with assumedMasterState and newDocumentState', async () => {
    const items = db.collection<Item>('items');

    let pushedBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url.includes('/pull')) {
        return {
          ok: true,
          json: async () => ({ documents: [], checkpoint: null })
        };
      }
      if (url.includes('/push')) {
        pushedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => [] // no conflicts
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const sync = replicateHttp(items, {
      url: 'https://mock-api.com',
      pullStream: false
    });

    const inserted = await items.insert({ name: 'Client Created', status: 'new' });

    // Wait for debounced push
    await new Promise(r => setTimeout(r, 350));

    expect(pushedBody).not.toBeNull();
    expect(pushedBody.length).toBe(1);
    expect(pushedBody[0].id).toBe(inserted.id);
    expect(pushedBody[0].newDocumentState.name).toBe('Client Created');

    sync.stop();
  });
});
