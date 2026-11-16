import type { Collection } from '../collection';
import type { BaseDocument, BulkWriteResult, DocumentWithMeta, PrimaryKey } from '../types';
import { validateDocumentAgainstSchema } from '../schema/validator';
import { prepareDocForStorage } from './pipeline';

export async function executeBulkInsert<T extends BaseDocument>(
  collection: Collection<T>,
  docs: Array<Omit<T, 'id' | '_deleted' | '_updatedAt'> & { id?: PrimaryKey }>
): Promise<BulkWriteResult<T>> {
  await collection.ensureMigrated();
  const result: BulkWriteResult<T> = { success: [], error: [] };
  const schema = collection.getSchema();
  const validDocs: DocumentWithMeta<T>[] = [];

  for (const item of docs) {
    const docObj = { ...(item as unknown as Record<string, unknown>) };
    const id = collection.resolveDocumentId(docObj);

    if (schema) {
      try {
        validateDocumentAgainstSchema(docObj, schema);
      } catch (err: any) {
        result.error.push({ id, document: item as Partial<T>, error: err });
        continue;
      }
    }

    const existing = await collection.findById(id);
    if (existing && !existing._deleted) {
      result.error.push({
        id,
        document: item as Partial<T>,
        error: new Error(`Document with id "${id}" already exists in collection "${collection.getName()}".`)
      });
      continue;
    }

    const doc: DocumentWithMeta<T> = {
      ...(docObj as unknown as T),
      id,
      _deleted: false,
      _updatedAt: Date.now()
    };
    validDocs.push(doc);
    result.success.push(doc);
  }

  if (validDocs.length > 0) {
    const storageDocs = await Promise.all(
      validDocs.map(d => prepareDocForStorage(d, collection.getFieldEncryptor(), collection.getKeyCompressor()))
    );
    await collection.getStorage().putBatch(collection.getName(), storageDocs);

    for (const doc of validDocs) {
      collection.getEmitter().emit(collection.getName(), {
        collection: collection.getName(),
        type: 'insert',
        id: doc.id,
        doc
      });
    }
  }

  return result;
}

export async function executeBulkUpsert<T extends BaseDocument>(
  collection: Collection<T>,
  docs: Array<Partial<T> & { id?: PrimaryKey; [key: string]: unknown }>
): Promise<BulkWriteResult<T>> {
  await collection.ensureMigrated();
  const result: BulkWriteResult<T> = { success: [], error: [] };
  const schema = collection.getSchema();
  const toWrite: DocumentWithMeta<T>[] = [];
  const events: Array<{ type: 'insert' | 'update'; doc: DocumentWithMeta<T>; previous?: DocumentWithMeta<T> }> = [];

  for (const item of docs) {
    const docObj = { ...item };
    const id = collection.resolveDocumentId(docObj);

    try {
      const existing = await collection.findById(id);
      if (!existing || existing._deleted) {
        if (schema) validateDocumentAgainstSchema(docObj, schema);
        const newDoc: DocumentWithMeta<T> = {
          ...(docObj as unknown as T),
          id,
          _deleted: false,
          _updatedAt: Date.now()
        };
        toWrite.push(newDoc);
        events.push({ type: 'insert', doc: newDoc });
        result.success.push(newDoc);
      } else {
        const updated: DocumentWithMeta<T> = { ...existing, ...(docObj as unknown as T), id, _updatedAt: Date.now() };
        if (schema) validateDocumentAgainstSchema(updated as Record<string, unknown>, schema);
        toWrite.push(updated);
        events.push({ type: 'update', doc: updated, previous: existing });
        result.success.push(updated);
      }
    } catch (err: any) {
      result.error.push({ id, document: item as Partial<T>, error: err });
    }
  }

  if (toWrite.length > 0) {
    const storageDocs = await Promise.all(
      toWrite.map(d => prepareDocForStorage(d, collection.getFieldEncryptor(), collection.getKeyCompressor()))
    );
    await collection.getStorage().putBatch(collection.getName(), storageDocs);

    for (const evt of events) {
      collection.getEmitter().emit(collection.getName(), {
        collection: collection.getName(),
        type: evt.type,
        id: evt.doc.id,
        doc: evt.doc,
        previous: evt.previous
      });
    }
  }

  return result;
}
