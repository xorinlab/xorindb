import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface Ticket {
  id?: string;
  workspaceId: string;
  status: 'open' | 'closed';
  priority: number;
  title: string;
}

describe('XorinDB Single & Compound Indexes', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase(`index_test_${Math.random().toString(36).substring(7)}`);
  });

  it('should create single and compound indexes in storage', async () => {
    const tickets = db.collection<Ticket>('tickets', {
      schema: {
        properties: {
          workspaceId: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'number' },
          title: { type: 'string' }
        },
        // Single index: 'status'
        // Compound index: ['workspaceId', 'status']
        indexes: [
          'status',
          ['workspaceId', 'status'],
          ['status', 'priority']
        ]
      }
    });

    const item1 = await tickets.insert({
      workspaceId: 'ws-alpha',
      status: 'open',
      priority: 1,
      title: 'Fix auth bug'
    });

    const item2 = await tickets.insert({
      workspaceId: 'ws-alpha',
      status: 'closed',
      priority: 2,
      title: 'Old ticket'
    });

    const item3 = await tickets.insert({
      workspaceId: 'ws-beta',
      status: 'open',
      priority: 3,
      title: 'UI polish'
    });

    // Query matching compound criteria
    const openAlpha = await tickets.find({
      workspaceId: 'ws-alpha',
      status: 'open'
    }).exec();

    expect(openAlpha).toHaveLength(1);
    expect(openAlpha[0].id).toBe(item1.id);

    // Query matching single index
    const allOpen = await tickets.find({ status: 'open' }).exec();
    expect(allOpen).toHaveLength(2);
  });
});
