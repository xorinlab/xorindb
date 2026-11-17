import { Collection } from '../collection';
import { SyncEngine } from '../sync';
import { BaseDocument, ChangeRow, Checkpoint, HttpReplicationOptions, PullResult } from '../types';

export function replicateHttp<T extends BaseDocument>(
  collection: Collection<T>,
  options: HttpReplicationOptions<T>
): SyncEngine<T> {
  const baseUrl = options.url.replace(/\/$/, '');
  const batchSize = options.batchSize ?? 100;

  const getHeaders = async (): Promise<Record<string, string>> => {
    let customHeaders: Record<string, string> = {};
    if (typeof options.headers === 'function') {
      customHeaders = await options.headers();
    } else if (options.headers) {
      customHeaders = options.headers;
    }
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...customHeaders
    };
  };

  // 1. Pull Handler
  const pull = async (checkpoint: Checkpoint | null, limit: number): Promise<PullResult<T>> => {
    const updatedAt = checkpoint ? checkpoint.updatedAt : 0;
    const id = checkpoint ? encodeURIComponent(checkpoint.id) : '';
    const url = `${baseUrl}/pull?updatedAt=${updatedAt}&id=${id}&batchSize=${limit || batchSize}`;

    const headers = await getHeaders();
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(`HTTP pull failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      documents: data.documents || [],
      checkpoint: data.checkpoint || null
    };
  };

  // 2. Push Handler
  const push = async (changeRows: ChangeRow<T>[]) => {
    const url = `${baseUrl}/push`;
    const headers = await getHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(changeRows)
    });

    if (!response.ok) {
      throw new Error(`HTTP push failed with status ${response.status}`);
    }

    const conflicts = await response.json();
    return conflicts; // Returns conflict documents if any
  };

  // 3. SSE Live stream URL
  const streamUrl = options.pullStream !== false ? `${baseUrl}/pullStream` : undefined;

  return collection.sync({
    pull,
    push,
    streamUrl,
    conflictResolver: options.conflictResolver
  });
}
