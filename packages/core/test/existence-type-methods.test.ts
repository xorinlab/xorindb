import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface MemberProfile {
  username: string;
  age?: number;
  email?: string | null;
  bio?: string;
  scores?: number[];
  attributes?: Record<string, unknown>;
  preferences?: {
    notifications?: {
      emailAlerts?: boolean;
    };
  };
}

describe('Chained Existence and Type Methods (.exists, .type)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-existence-type-db-${Date.now()}` });
  });

  it('should test property existence using .exists(true) and .exists(false)', async () => {
    const members = await db.collection<MemberProfile>({ name: 'members' });

    await members.insert({
      username: 'alice',
      age: 26,
      bio: 'Open source contributor'
    });

    await members.insert({
      username: 'bob',
      age: 30
      // bio is undefined
    });

    // .exists() defaults to true
    const withBio = await members.find()
      .where('bio').exists()
      .exec();

    expect(withBio.length).toBe(1);
    expect(withBio[0].username).toBe('alice');

    // .exists(false)
    const withoutBio = await members.find()
      .where('bio').exists(false)
      .exec();

    expect(withoutBio.length).toBe(1);
    expect(withoutBio[0].username).toBe('bob');
  });

  it('should evaluate existence on nested dot-notation paths', async () => {
    const members = await db.collection<MemberProfile>({ name: 'members' });

    await members.insert({
      username: 'carol',
      preferences: {
        notifications: {
          emailAlerts: true
        }
      }
    });

    await members.insert({
      username: 'dan',
      preferences: {
        notifications: {}
      }
    });

    await members.insert({
      username: 'erin'
      // preferences is undefined
    });

    const withEmailAlerts = await members.find()
      .where('preferences.notifications.emailAlerts').exists(true)
      .exec();

    expect(withEmailAlerts.length).toBe(1);
    expect(withEmailAlerts[0].username).toBe('carol');

    const withoutEmailAlerts = await members.find()
      .where('preferences.notifications.emailAlerts').exists(false)
      .exec();

    expect(withoutEmailAlerts.length).toBe(2);
    expect(withoutEmailAlerts.map(m => m.username).sort()).toEqual(['dan', 'erin']);
  });

  it('should inspect and match runtime JSON/BSON types using .type()', async () => {
    const members = await db.collection<MemberProfile>({ name: 'members' });

    await members.insert({
      username: 'frank',
      age: 28,
      email: 'frank@example.com',
      scores: [90, 85],
      attributes: { tier: 'gold' }
    });

    await members.insert({
      username: 'grace',
      email: null,
      attributes: { tier: 1 }
    });

    // Match string type
    const stringEmails = await members.find()
      .where('email').type('string')
      .exec();

    expect(stringEmails.length).toBe(1);
    expect(stringEmails[0].username).toBe('frank');

    // Match null type
    const nullEmails = await members.find()
      .where('email').type('null')
      .exec();

    expect(nullEmails.length).toBe(1);
    expect(nullEmails[0].username).toBe('grace');

    // Match array type
    const arrayScores = await members.find()
      .where('scores').type('array')
      .exec();

    expect(arrayScores.length).toBe(1);
    expect(arrayScores[0].username).toBe('frank');

    // Match number type
    const numberAges = await members.find()
      .where('age').type('number')
      .exec();

    expect(numberAges.length).toBe(1);
    expect(numberAges[0].username).toBe('frank');
  });

  it('should combine .exists(), .type() with comparison operators in chain', async () => {
    const members = await db.collection<MemberProfile>({ name: 'members' });

    await members.insert({
      username: 'heidi',
      age: 22,
      email: 'heidi@test.com'
    });

    await members.insert({
      username: 'ivan',
      age: 16,
      email: 'ivan@test.com'
    });

    await members.insert({
      username: 'judy',
      age: 25
      // no email
    });

    const adultsWithEmail = await members.find()
      .where('age').type('number').gte(18)
      .where('email').exists(true).type('string')
      .exec();

    expect(adultsWithEmail.length).toBe(1);
    expect(adultsWithEmail[0].username).toBe('heidi');
  });
});
