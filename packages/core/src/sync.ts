import { Collection } from './collection';
import { BaseDocument, DocumentWithMeta, SyncOptions } from './types';

export class SyncEngine<T extends BaseDocument> {
  private collection: Collection<T>;
  private options: SyncOptions<T>;
  private isRunning: boolean = false;
  private checkpoint: number = 0;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPushBatch: Map<string, DocumentWithMeta<T>> = new Map();
  private isPushing: boolean = false;

  constructor(collection: Collection<T>, options: SyncOptions<T>) {
    this.collection = collection;
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Listen to local changes to automatically push
    this.collection.getEmitter().on<T>(this.collection.getName(), (event) => {
      if (event.doc) {
        this.pendingPushBatch.set(event.doc.id, event.doc);
        this.debouncedPush();
      }
    });

    // Initial pull
    await this.pull();

    // Setup polling for pull if pullIntervalMs provided
    const interval = this.options.pullIntervalMs ?? 10000;
    this.intervalTimer = setInterval(() => {
      if (this.isRunning) {
        this.pull().catch(console.error);
      }
    }, interval);
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  async pull(): Promise<void> {
    if (!this.options.pull) return;

    try {
      const response = await this.options.pull(this.checkpoint);
      if (response && Array.isArray(response.documents) && response.documents.length > 0) {
        const storage = this.collection.getStorage();
        for (const serverDoc of response.documents) {
          const localDoc = await storage.get<T>(this.collection.getName(), serverDoc.id);

          if (!localDoc) {
            // New doc from server
            await storage.put(this.collection.getName(), serverDoc);
            this.collection.getEmitter().emit(this.collection.getName(), {
              collection: this.collection.getName(),
              type: serverDoc._deleted ? 'delete' : 'insert',
              id: serverDoc.id,
              doc: serverDoc
            });
          } else {
            // Check conflict
            if (localDoc._updatedAt > serverDoc._updatedAt) {
              // Local is newer or conflict
              let resolved = serverDoc;
              if (this.options.conflictResolver) {
                resolved = await this.options.conflictResolver({
                  clientState: localDoc,
                  serverState: serverDoc
                });
              }
              await storage.put(this.collection.getName(), resolved);
              this.collection.getEmitter().emit(this.collection.getName(), {
                collection: this.collection.getName(),
                type: resolved._deleted ? 'delete' : 'update',
                id: resolved.id,
                doc: resolved
              });
            } else {
              // Server is newer
              await storage.put(this.collection.getName(), serverDoc);
              this.collection.getEmitter().emit(this.collection.getName(), {
                collection: this.collection.getName(),
                type: serverDoc._deleted ? 'delete' : 'update',
                id: serverDoc.id,
                doc: serverDoc
              });
            }
          }
        }
        this.checkpoint = response.checkpoint;
      }
    } catch (err) {
      console.warn(`[xorindb sync] Pull failed for ${this.collection.getName()}:`, err);
    }
  }

  private pushTimeout: ReturnType<typeof setTimeout> | null = null;
  private debouncedPush(): void {
    if (this.pushTimeout) clearTimeout(this.pushTimeout);
    this.pushTimeout = setTimeout(() => {
      this.push().catch(console.error);
    }, 300);
  }

  async push(): Promise<void> {
    if (!this.options.push || this.isPushing || this.pendingPushBatch.size === 0) return;

    this.isPushing = true;
    const batch = Array.from(this.pendingPushBatch.values());
    this.pendingPushBatch.clear();

    try {
      const result = await this.options.push(batch);

      // Handle server conflicts returned from push
      if (result && result.conflicts && result.conflicts.length > 0) {
        for (const conflict of result.conflicts) {
          let resolved = conflict.serverState;
          if (this.options.conflictResolver) {
            resolved = await this.options.conflictResolver({
              clientState: conflict.clientState,
              serverState: conflict.serverState
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
    } catch (err) {
      console.warn(`[xorindb sync] Push failed for ${this.collection.getName()}:`, err);
      // Re-add to batch to retry next time
      for (const doc of batch) {
        this.pendingPushBatch.set(doc.id, doc);
      }
    } finally {
      this.isPushing = false;
    }
  }
}
