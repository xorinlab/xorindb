import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface UserProfile {
  name: string;
  age?: number;
  email?: string | null;
  settings?: {
    theme?: string;
  };
  tags?: string[];
  metadata?: unknown;
}

describe('Existence and Type Evaluation Queries ($exists & $type)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-exists-db-${Date.now()}` });
  });

  it('should query documents using $exists: true and $exists: false', async () => {
    const users = await db.collection<UserProfile>({ name: 'users' });

    await users.insert({
      name: 'Alice',
      age: 28,
      email: 'alice@example.com'
    });

    await users.insert({
      name: 'Bob'
      // age and email are undefined
    });

    const withAge = await users.find({
      age: { $exists: true }
    }).exec();

    expect(withAge.length).toBe(1);
    expect(withAge[0].name).toBe('Alice');

    const withoutAge = await users.find({
      age: { $exists: false }
    }).exec();

    expect(withoutAge.length).toBe(1);
    expect(withoutAge[0].name).toBe('Bob');
  });

  it('should evaluate $exists on nested dot-notation fields', async () => {
    const users = await db.collection<UserProfile>({ name: 'users' });

    await users.insert({
      name: 'Charlie',
      settings: { theme: 'dark' }
    });

    await users.insert({
      name: 'Dave',
      settings: {}
    });

    await users.insert({
      name: 'Eve'
      // settings is undefined
    });

    const withTheme = await users.find({
      'settings.theme': { $exists: true }
    }).exec();

    expect(withTheme.length).toBe(1);
    expect(withTheme[0].name).toBe('Charlie');

    const withoutTheme = await users.find({
      'settings.theme': { $exists: false }
    }).exec();

    expect(withoutTheme.length).toBe(2);
  });

  it('should evaluate field type matching using $type', async () => {
    const users = await db.collection<UserProfile>({ name: 'users' });

    await users.insert({
      name: 'Frank',
      age: 30,
      metadata: 'verified-account',
      tags: ['developer', 'admin']
    });

    await users.insert({
      name: 'Grace',
      metadata: 12345,
      tags: []
    });

    await users.insert({
      name: 'Heidi',
      email: null,
      metadata: { role: 'tester' }
    });

    // 1. Match string type
    const strMeta = await users.find({
      metadata: { $type: 'string' }
    }).exec();
    expect(strMeta.length).toBe(1);
    expect(strMeta[0].name).toBe('Frank');

    // 2. Match number type
    const numMeta = await users.find({
      metadata: { $type: 'number' }
    }).exec();
    expect(numMeta.length).toBe(1);
    expect(numMeta[0].name).toBe('Grace');

    // 3. Match array type
    const arrayTags = await users.find({
      tags: { $type: 'array' }
    }).exec();
    expect(arrayTags.length).toBe(2);

    // 4. Match null type
    const nullEmails = await users.find({
      email: { $type: 'null' }
    }).exec();
    expect(nullEmails.length).toBe(1);
    expect(nullEmails[0].name).toBe('Heidi');

    // 5. Match object type
    const objMeta = await users.find({
      metadata: { $type: 'object' }
    }).exec();
    expect(objMeta.length).toBe(1);
    expect(objMeta[0].name).toBe('Heidi');
  });

  it('should combine $exists and $type with logical operators and conditions', async () => {
    const users = await db.collection<UserProfile>({ name: 'users' });

    await users.insert({
      name: 'Ivan',
      age: 25,
      email: 'ivan@work.com'
    });

    await users.insert({
      name: 'Judy',
      age: 17,
      email: null
    });

    const adultWithValidEmail = await users.find({
      $and: [
        { age: { $gte: 18 } },
        { email: { $exists: true, $type: 'string' } }
      ]
    }).exec();

    expect(adultWithValidEmail.length).toBe(1);
    expect(adultWithValidEmail[0].name).toBe('Ivan');
  });
});
