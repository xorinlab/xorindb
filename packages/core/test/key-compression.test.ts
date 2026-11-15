import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createDatabase, Database } from '../src';

interface CustomerProfile {
  id?: string;
  veryLongCustomerFullName: string;
  veryLongCustomerResidentialAddress: string;
  totalAccountBalanceAmount: number;
}

describe('XorinDB Key Compression', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase(`compress_test_${Math.random().toString(36).substring(7)}`);
  });

  it('should compress long property names in storage and decompress transparently on query', async () => {
    const customers = db.collection<CustomerProfile>('customers', {
      schema: {
        keyCompression: true,
        required: ['veryLongCustomerFullName', 'totalAccountBalanceAmount'],
        properties: {
          veryLongCustomerFullName: { type: 'string' },
          veryLongCustomerResidentialAddress: { type: 'string' },
          totalAccountBalanceAmount: { type: 'number' }
        }
      }
    });

    const inserted = await customers.insert({
      veryLongCustomerFullName: 'Shafayet Anik',
      veryLongCustomerResidentialAddress: 'Dhaka, Bangladesh',
      totalAccountBalanceAmount: 5000
    });

    // 1. Transparent to client
    expect(inserted.veryLongCustomerFullName).toBe('Shafayet Anik');
    expect(inserted.totalAccountBalanceAmount).toBe(5000);

    // 2. Check underlying storage: Long keys should NOT exist on the raw disk object!
    const rawDiskDoc = await db.getStorage().get('customers', inserted.id);
    expect(rawDiskDoc).not.toBeNull();
    expect((rawDiskDoc as any).veryLongCustomerFullName).toBeUndefined();
    expect((rawDiskDoc as any).veryLongCustomerResidentialAddress).toBeUndefined();

    // Short keys like |a, |b should hold the data
    const hasCompressedKeys = Object.keys(rawDiskDoc || {}).some(k => k.startsWith('|'));
    expect(hasCompressedKeys).toBe(true);

    // 3. Query should automatically decompress and return original property names
    const queryResult = await customers.find({ totalAccountBalanceAmount: 5000 }).exec();
    expect(queryResult).toHaveLength(1);
    expect(queryResult[0].veryLongCustomerFullName).toBe('Shafayet Anik');
    expect(queryResult[0].veryLongCustomerResidentialAddress).toBe('Dhaka, Bangladesh');

    // 4. findById should also decompress transparently
    const byId = await customers.findById(inserted.id);
    expect(byId?.veryLongCustomerFullName).toBe('Shafayet Anik');
  });
});
