import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface SecureNote {
  id?: string;
  title: string;
  secretContent: string; // should be encrypted
  apiToken: string;      // should be encrypted
}

describe('XorinDB Field-Level Encryption (AES-GCM)', () => {
  let db: Database;
  const masterPassword = 'super-secret-password-123';

  beforeEach(async () => {
    db = await createDatabase({
      name: `crypto_test_${Math.random().toString(36).substring(7)}`,
      password: masterPassword
    });
  });

  it('should encrypt designated fields in IndexedDB storage and decrypt on query', async () => {
    const notes = db.collection<SecureNote>('notes', {
      schema: {
        encrypted: ['secretContent', 'apiToken'],
        properties: {
          title: { type: 'string' },
          secretContent: { type: 'string' },
          apiToken: { type: 'string' }
        }
      }
    });

    const note = await notes.insert({
      title: 'Banking Secret',
      secretContent: 'Secret Bank PIN is 9876',
      apiToken: 'sk_live_xyz999'
    });

    // 1. Client query / read returns plaintext
    expect(note.secretContent).toBe('Secret Bank PIN is 9876');
    expect(note.apiToken).toBe('sk_live_xyz999');

    // 2. Underlying storage inspection: Plain text must NEVER be stored on disk!
    const rawDisk = await db.getStorage().get('notes', note.id);
    expect(rawDisk).not.toBeNull();
    expect((rawDisk as any).title).toBe('Banking Secret'); // unencrypted field

    // Check that secret fields are cipher envelopes
    const encryptedSecret = (rawDisk as any).secretContent;
    expect(encryptedSecret.__xorin_enc).toBe(true);
    expect(encryptedSecret.iv).toBeDefined();
    expect(encryptedSecret.data).toBeDefined();
    expect(JSON.stringify(rawDisk)).not.toContain('9876');
    expect(JSON.stringify(rawDisk)).not.toContain('sk_live_xyz999');

    // 3. Query should decrypt transparently
    const queried = await notes.find({ title: 'Banking Secret' }).exec();
    expect(queried).toHaveLength(1);
    expect(queried[0].secretContent).toBe('Secret Bank PIN is 9876');
    expect(queried[0].apiToken).toBe('sk_live_xyz999');

    // 4. findById should decrypt transparently
    const byId = await notes.findById(note.id);
    expect(byId?.secretContent).toBe('Secret Bank PIN is 9876');
  });
});
