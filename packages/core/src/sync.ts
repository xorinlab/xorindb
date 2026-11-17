import { Collection } from './collection';
import { BaseDocument, ChangeRow, Checkpoint, DocumentWithMeta, SyncOptions } from './types';

export class SyncEngine<T extends BaseDocument> {
  private collection: Collection<T>;
  private options: SyncOptions<T>;
  private isRunning: boolean = false;
  private checkpoint: Checkpoint | null = null;
  private pendingPushBatch: Map<string, ChangeRow<T>> = new Map();
  private isPushing: boolean = false;
  private eventSource: EventSource | null = null;

  constructor(collection: Collection<T>, options: SyncOptions<T>) {
    this.collection = collection;
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Listen to local collection writes to queue pushes
    this.collection.getEmitter().on<T>(this.collection.getName(), (event) => {
      if (event.doc) {
        this.pendingPushBatch.set(event.id, {
          id: event.id,
          newDocumentState: event.doc,
          assumedMasterState: event.previous || null
        });
        this.debouncedPush();
      }
    });

    // 2. Initial iteration pull
    await this.pull();

    // 3. Setup real-time Server-Sent Events (SSE) stream if URL provided
    if (this.options.streamUrl && typeof EventSource !== 'undefined') {
      this.initStream();
    }
  }

  private initStream(): void {
    if (!this.options.streamUrl || typeof EventSource === 'undefined') return;

    try {
      this.eventSource = new EventSource(this.options.streamUrl, { withCredentials: true });

      this.eventSource.onmessage = async (event) => {
        try {
          if (!event.data) return;

          // RESYNC protocol
          if (event.data === 'RESYNC') {
            await this.pull();
            return;
          }

          const parsed = JSON.parse(event.data);
          if (parsed.documents && Array.isArray(parsed.documents)) {
            await this.processIncomingDocuments(parsed.documents);
            if (parsed.checkpoint) {
              this.checkpoint = parsed.checkpoint;
            }
          }
        } catch (err) {
          console.warn('[xorindb SSE stream error]', err);
        }
      };

      this.eventSource.onerror = async () => {
        // Step 9 from spec: On stream error/reconnect, emit RESYNC to catch up missing writes
        try {
          await this.pull();
        } catch {
          // ignore
        }
      };
    } catch (e) {
      console.warn('[xorindb] EventSource initialization failed:', e);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  async pull(): Promise<void> {
    if (!this.options.pull) return;

    try {
      const batchSize = 100;
      let hasMore = true;

      while (hasMore && this.isRunning) {
        const response = await this.options.pull(this.checkpoint, batchSize);

        if (!response || !response.documents || response.documents.length === 0) {
          hasMore = false;
          break;
        }

        await this.processIncomingDocuments(response.documents);

        if (response.checkpoint) {
          this.checkpoint = response.checkpoint;
        }

        // If returned documents less than requested batch size, server has no more documents for now
        if (response.documents.length < batchSize) {
          hasMore = false;
        }
      }
    } catch (err) {
      console.warn(`[xorindb sync] Pull failed for ${this.collection.getName()}:`, err);
    }
  }

  private async processIncomingDocuments(incoming: DocumentWithMeta<T>[]): Promise<void> {
    const storage = this.collection.getStorage();
    const colName = this.collection.getName();

    for (const serverDoc of incoming) {
      const localDoc = await storage.get<T>(colName, serverDoc.id);

      if (!localDoc) {
        // Document doesn't exist locally: save server state
        await storage.put(colName, serverDoc);
        this.collection.getEmitter().emit(colName, {
          collection: colName,
          type: serverDoc._deleted ? 'delete' : 'insert',
          id: serverDoc.id,
          doc: serverDoc
        });
      } else {
        // Conflict resolution
        if (localDoc._updatedAt > serverDoc._updatedAt) {
          let resolved = serverDoc;
          if (this.options.conflictResolver) {
            resolved = await this.options.conflictResolver({
              clientState: localDoc,
              serverState: serverDoc
            });
          }
          await storage.put(colName, resolved);
          this.collection.getEmitter().emit(colName, {
            collection: colName,
            type: resolved._deleted ? 'delete' : 'update',
            id: resolved.id,
            doc: resolved
          });
        } else {
          // Server state is newer
          await storage.put(colName, serverDoc);
          this.collection.getEmitter().emit(colName, {
            collection: colName,
            type: serverDoc._deleted ? 'delete' : 'update',
            id: serverDoc.id,
            doc: serverDoc
          });
        }
      }
    }
  }

  private pushTimeout: ReturnType<typeof setTimeout> | null = null;
  private debouncedPush(): void {
    if (this.pushTimeout) clearTimeout(this.pushTimeout);
    this.pushTimeout = setTimeout(() => {
      this.push().catch(console.error);
    }, 200);
  }

  async push(): Promise<void> {
    if (!this.options.push || this.isPushing || this.pendingPushBatch.size === 0) return;

    this.isPushing = true;
    const batch = Array.from(this.pendingPushBatch.values());
    this.pendingPushBatch.clear();

    try {
      // Send change rows: [{ id, newDocumentState, assumedMasterState }]
      const conflicts = await this.options.push(batch);

      // Handle server conflicts returned from push
      if (conflicts && Array.isArray(conflicts) && conflicts.length > 0) {
        for (const serverMasterState of conflicts) {
          const clientRow = batch.find((r) => r.id === serverMasterState.id);
          if (clientRow) {
            let resolved = serverMasterState;
            if (this.options.conflictResolver) {
              resolved = await this.options.conflictResolver({
                clientState: clientRow.newDocumentState,
                serverState: serverMasterState
              });
            }
            await this.collection.getStorage().put(this.collection.getName(), resolved);
            this.collection.getEmitter().emit(this.collection.getName(), {
              collection: this.collection.getName(),
              type: resolved._deleted ? 'delete' : 'update',
              id: resolved.id,
              doc: resolved
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[xorindb sync] Push failed for ${this.collection.getName()}:`, err);
      // Re-add to batch to retry next cycle
      for (const row of batch) {
        this.pendingPushBatch.set(row.id, row);
      }
    } finally {
      this.isPushing = false;
    }
  }
}
