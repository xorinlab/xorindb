import { ChangeEvent } from '../types';

export type EventCallback<T = unknown> = (event: ChangeEvent<T>) => void;

export class EventEmitter {
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private channelName: string;

  constructor(channelName: string, enableMultiTab: boolean = true) {
    this.channelName = channelName;

    if (enableMultiTab && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(`xorindb_${channelName}`);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type && event.data.collection) {
            this.emitLocal(event.data.collection, event.data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or failed to initialize', e);
      }
    }
  }

  on<T>(collection: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(collection)) {
      this.listeners.set(collection, new Set());
    }
    this.listeners.get(collection)!.add(callback);

    return () => {
      const set = this.listeners.get(collection);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(collection);
        }
      }
    };
  }

  private emitLocal<T>(collection: string, event: ChangeEvent<T>): void {
    const set = this.listeners.get(collection);
    if (set) {
      for (const cb of set) {
        try {
          cb(event);
        } catch (err) {
          console.error('Error in change listener callback:', err);
        }
      }
    }
  }

  emit<T>(collection: string, event: ChangeEvent<T>): void {
    this.emitLocal(collection, event);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(event);
      } catch (err) {
        console.warn('Failed to broadcast change event across tabs:', err);
      }
    }
  }

  close(): void {
    this.listeners.clear();
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }
}
