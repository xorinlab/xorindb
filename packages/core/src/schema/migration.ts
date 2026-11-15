import { Collection } from '../collection';
import { BaseDocument, DocumentWithMeta } from '../types';

export type MigrationStrategyFunction = (
  oldDoc: Record<string, unknown>
) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;

export interface MigrationStrategies {
  [targetVersion: number]: MigrationStrategyFunction;
}

export class MigrationEngine<T extends BaseDocument> {
  private collection: Collection<T>;

  constructor(collection: Collection<T>) {
    this.collection = collection;
  }

  /**
   * Automatically migrates existing documents in storage if the current schema version
   * is higher than the version the documents were saved with.
   */
  async runMigration(
    targetVersion: number,
    strategies?: MigrationStrategies
  ): Promise<void> {
    if (targetVersion <= 0 || !strategies) return;

    const storage = this.collection.getStorage();
    const colName = this.collection.getName();

    // Internal metadata key to track collection version
    const metaCollection = '_xorin_meta';
    const metaDoc = await storage.get<{ version: number }>(metaCollection, colName);
    const currentStoredVersion = metaDoc ? metaDoc.version : 0;

    if (currentStoredVersion >= targetVersion) {
      // Already up-to-date
      return;
    }

    const allDocs = await storage.getAll<Record<string, unknown>>(colName);
    if (allDocs.length === 0) {
      // Update meta version and return
      await storage.put(metaCollection, {
        id: colName,
        version: targetVersion,
        _deleted: false,
        _updatedAt: Date.now()
      });
      return;
    }

    const migratedDocs: DocumentWithMeta<T>[] = [];
    const idsToDelete: string[] = [];

    for (const rawDoc of allDocs) {
      let currentDoc: Record<string, unknown> | null = { ...rawDoc };

      // Step-by-step migration through each version iteration
      for (let v = currentStoredVersion + 1; v <= targetVersion; v++) {
        const strategy = strategies[v];
        if (typeof strategy === 'function' && currentDoc !== null) {
          currentDoc = await strategy(currentDoc);
        }
      }

      if (currentDoc === null) {
        // Returning null from migration strategy means drop/delete this document
        idsToDelete.push(rawDoc.id as string);
      } else {
        const transformed: DocumentWithMeta<T> = {
          ...(currentDoc as unknown as T),
          id: (currentDoc.id as string) || (rawDoc.id as string),
          _deleted: Boolean(currentDoc._deleted ?? rawDoc._deleted ?? false),
          _updatedAt: Date.now()
        };
        migratedDocs.push(transformed);
      }
    }

    // Delete dropped docs
    for (const id of idsToDelete) {
      await storage.delete(colName, id);
    }

    // Save batch of transformed docs
    if (migratedDocs.length > 0) {
      await storage.putBatch(colName, migratedDocs);
    }

    // Update metadata version
    await storage.put(metaCollection, {
      id: colName,
      version: targetVersion,
      _deleted: false,
      _updatedAt: Date.now()
    });
  }
}
