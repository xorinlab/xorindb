import { CollectionSchema } from './validator';

/**
 * Web Crypto API AES-GCM Field Encryptor:
 * Encrypts and decrypts sensitive document fields on the client-side
 * before writing to IndexedDB or transmitting.
 */
export class FieldEncryptor<T> {
  private password?: string;
  private encryptedFields: Set<string> = new Set();
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(password?: string, schema?: CollectionSchema<T>) {
    this.password = password;
    if (schema?.encrypted && Array.isArray(schema.encrypted)) {
      for (const field of schema.encrypted as string[]) {
        this.encryptedFields.add(field);
      }
    }
  }

  hasEncryptedFields(): boolean {
    return Boolean(this.password && this.encryptedFields.size > 0);
  }

  private async getCryptoKey(): Promise<CryptoKey> {
    if (this.keyPromise) return this.keyPromise;

    this.keyPromise = (async () => {
      const enc = new TextEncoder();
      const pwKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(this.password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      return crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: enc.encode('xorindb_salt_v1'),
          iterations: 10000,
          hash: 'SHA-256'
        },
        pwKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    })();

    return this.keyPromise;
  }

  async encryptDoc(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.hasEncryptedFields()) return doc;

    const key = await this.getCryptoKey();
    const result: Record<string, unknown> = { ...doc };

    for (const field of this.encryptedFields) {
      const val = doc[field];
      if (val === undefined || val === null) continue;

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(val));

      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
      );

      // Store as base64 envelope
      result[field] = {
        __xorin_enc: true,
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(cipher))
      };
    }

    return result;
  }

  async decryptDoc(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.hasEncryptedFields()) return doc;

    const key = await this.getCryptoKey();
    const result: Record<string, unknown> = { ...doc };

    for (const field of this.encryptedFields) {
      const val = doc[field] as { __xorin_enc?: boolean; iv?: number[]; data?: number[] } | undefined;
      if (!val || typeof val !== 'object' || !val.__xorin_enc || !val.iv || !val.data) {
        continue;
      }

      try {
        const iv = new Uint8Array(val.iv);
        const data = new Uint8Array(val.data);

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          data
        );

        const text = new TextDecoder().decode(decrypted);
        result[field] = JSON.parse(text);
      } catch (err) {
        console.warn(`[xorindb encryption] Failed to decrypt field "${field}":`, err);
      }
    }

    return result;
  }
}
