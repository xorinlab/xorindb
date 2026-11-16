import { DocumentWithMeta } from '../types';
import { KeyCompressor } from '../schema/compression';
import { FieldEncryptor } from '../schema/encryption';

export async function prepareDocForStorage<T>(
  doc: DocumentWithMeta<T>,
  fieldEncryptor: FieldEncryptor<T>,
  keyCompressor: KeyCompressor<T>
): Promise<DocumentWithMeta<T>> {
  const encryptedDoc = fieldEncryptor.hasEncryptedFields()
    ? ((await fieldEncryptor.encryptDoc(
        doc as unknown as Record<string, unknown>
      )) as unknown as DocumentWithMeta<T>)
    : doc;

  return keyCompressor.isCompressionEnabled()
    ? ((keyCompressor.compress(
        encryptedDoc as unknown as Record<string, unknown>
      )) as unknown as DocumentWithMeta<T>)
    : encryptedDoc;
}

export async function restoreDocFromStorage<T>(
  raw: DocumentWithMeta<T>,
  fieldEncryptor: FieldEncryptor<T>,
  keyCompressor: KeyCompressor<T>
): Promise<DocumentWithMeta<T>> {
  const decompressed = keyCompressor.isCompressionEnabled()
    ? ((keyCompressor.decompress(
        raw as unknown as Record<string, unknown>
      )) as unknown as DocumentWithMeta<T>)
    : raw;

  return fieldEncryptor.hasEncryptedFields()
    ? ((await fieldEncryptor.decryptDoc(
        decompressed as unknown as Record<string, unknown>
      )) as unknown as DocumentWithMeta<T>)
    : decompressed;
}
