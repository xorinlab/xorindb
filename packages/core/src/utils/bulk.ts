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
    const preProcessed = await collection.getHooks().runPreInsert(item as any);
    const docObj = { ...(preProcessed as unknown as Record<string, unknown>) };
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

    let doc: DocumentWithMeta<T> = {
      ...(docObj as unknown as T),
      id,
      _deleted: false,
      _updatedAt: Date.now()
    };
    doc = await collection.getHooks().runPreSave(doc);
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
      await collection.getHooks().runPostInsert(doc);
      await collection.getHooks().runPostSave(doc);
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
    const preProcessed = await collection.getHooks().runPreInsert(item as any);
    const docObj = { ...preProcessed };
    const id = collection.resolveDocumentId(docObj);

    try {
      const existing = await collection.findById(id);
      if (!existing || existing._deleted) {
        if (schema) validateDocumentAgainstSchema(docObj, schema);
        let newDoc: DocumentWithMeta<T> = {
          ...(docObj as unknown as T),
          id,
          _deleted: false,
          _updatedAt: Date.now()
        };
        newDoc = await collection.getHooks().runPreSave(newDoc);
        toWrite.push(newDoc);
        events.push({ type: 'insert', doc: newDoc });
        result.success.push(newDoc);
      } else {
        let updated: DocumentWithMeta<T> = { ...existing, ...(docObj as unknown as T), id, _updatedAt: Date.now() };
        if (schema) validateDocumentAgainstSchema(updated as Record<string, unknown>, schema);
        updated = await collection.getHooks().runPreSave(updated);
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
      if (evt.type === 'insert') {
        await collection.getHooks().runPostInsert(evt.doc);
      }
      await collection.getHooks().runPostSave(evt.doc, evt.previous);
    }
  }

  return result;
}
