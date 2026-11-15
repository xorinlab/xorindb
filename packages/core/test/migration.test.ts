import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase } from '../src';

describe('XorinDB Schema Migration Strategy', () => {
  it('should migrate existing documents from version 0 to version 1', async () => {
    const dbName = `migration_test_${Math.random().toString(36).substring(7)}`;

    // 1. Initial app version (version 0): stores firstName and lastName
    const dbV0 = await createDatabase({ name: dbName });
    const usersV0 = dbV0.collection('users');

    await usersV0.insert({
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe'
    });

    await usersV0.insert({
      id: 'user-2',
      firstName: 'Jane',
      lastName: 'Smith'
    });

    await dbV0.close();

    // 2. New App Release (version 1): combines into fullName
    const dbV1 = await createDatabase({ name: dbName });
    const usersV1 = dbV1.collection('users', {
      schema: {
        version: 1,
        properties: {
          fullName: { type: 'string' }
        }
      },
      migrationStrategies: {
        1: (oldDoc: any) => {
          return {
            id: oldDoc.id,
            fullName: `${oldDoc.firstName} ${oldDoc.lastName}`
          };
        }
      }
    });

    const allUsers = await usersV1.find().exec();
    expect(allUsers).toHaveLength(2);

    const user1 = allUsers.find(u => u.id === 'user-1');
    expect(user1?.fullName).toBe('John Doe');
    expect((user1 as any)?.firstName).toBeUndefined();

    const user2 = allUsers.find(u => u.id === 'user-2');
    expect(user2?.fullName).toBe('Jane Smith');

    await dbV1.close();
  });

  it('should drop documents if migration strategy returns null', async () => {
    const dbName = `migration_drop_test_${Math.random().toString(36).substring(7)}`;

    const dbV0 = await createDatabase(dbName);
    const itemsV0 = dbV0.collection('items');
    await itemsV0.insert({ id: 'valid-item', keep: true });
    await itemsV0.insert({ id: 'obsolete-item', keep: false });
    await dbV0.close();

    const dbV1 = await createDatabase(dbName);
    const itemsV1 = dbV1.collection('items', {
      schema: { version: 1 },
      migrationStrategies: {
        1: (oldDoc: any) => {
          if (!oldDoc.keep) return null; // Drop obsolete item
          return oldDoc;
        }
      }
    });

    const allItems = await itemsV1.find().exec();
    expect(allItems).toHaveLength(1);
    expect(allItems[0].id).toBe('valid-item');

    await dbV1.close();
  });
});
