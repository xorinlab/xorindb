import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface UserAccount {
  username: string; // custom primary key
  email: string;
  age: number;
}

describe('XorinDB Custom Primary Key', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase(`custom_pk_${Math.random().toString(36).substring(7)}`);
  });

  it('should use custom primaryKey (e.g. username) as the document identifier', async () => {
    const users = db.collection<UserAccount>('users', {
      schema: {
        primaryKey: 'username',
        required: ['username', 'email'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          age: { type: 'number' }
        }
      }
    });

    const user = await users.insert({
      username: 'shafayet_anik',
      email: 'anik@example.com',
      age: 26
    });

    // Both user.username and internal id should point to the custom primaryKey
    expect(user.username).toBe('shafayet_anik');
    expect(user.id).toBe('shafayet_anik');

    // Find by custom primary key ID
    const found = await users.findById('shafayet_anik');
    expect(found).not.toBeNull();
    expect(found?.email).toBe('anik@example.com');

    // Update by custom primary key ID
    await users.update('shafayet_anik', { age: 27 });
    const updated = await users.findById('shafayet_anik');
    expect(updated?.age).toBe(27);

    // Delete by custom primary key ID
    await users.delete('shafayet_anik');
    const afterDelete = await users.findById('shafayet_anik');
    expect(afterDelete).toBeNull();
  });
});
