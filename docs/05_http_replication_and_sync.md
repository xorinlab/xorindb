# 05. HTTP Replication & Sync

## 1. Protocol Architecture
XorinDB supports two-way background synchronization over standard HTTP and Server-Sent Events (SSE).

```text
 ┌───────────────┐                             ┌──────────────────┐
 │               │  GET /pull?updatedAt&id     │                  │
 │   XorinDB     ├────────────────────────────►│  Backend Server  │
 │   Client      │◄────────────────────────────┤  (Express/Go/Py) │
 │               │  { documents, checkpoint }  │                  │
 │               │                             │                  │
 │               │  POST /push [changeRows]    │                  │
 │               ├────────────────────────────►│                  │
 │               │◄────────────────────────────┤                  │
 │               │  [conflicts]                │                  │
 │               │                             │                  │
 │               │  GET /pullStream (SSE)      │                  │
 │               │◄────────────────────────────┤                  │
 └───────────────┘                             └──────────────────┘
```

---

## 2. Client Replication Setup (`replicateHttp`)

```typescript
import { createDatabase, replicateHttp } from 'xorindb';

const db = await createDatabase('team-board');
const issues = db.collection('issues');

// Ensure only Leader Tab runs replication
await db.waitForLeadership();

const sync = replicateHttp(issues, {
  url: 'https://api.mybackend.com/issues',
  headers: async () => ({
    'Authorization': `Bearer ${sessionToken}`
  }),
  batchSize: 100,
  pullStream: true,       // SSE Real-time stream
  pullIntervalMs: 10000,  // Periodic fallback
  conflictResolver: ({ clientState, serverState }) => {
    // 3-Way Merge or Custom Business Rules
    return {
      ...clientState,
      status: serverState.status
    };
  }
});
```

---

## 3. Server-Side Endpoints

### 1. `GET /pull`
- **Query Params**: `updatedAt`, `id`, `batchSize`
- **Response**:
```json
{
  "documents": [{ "id": "1", "title": "Bug", "_deleted": false, "_updatedAt": 1700000000 }],
  "checkpoint": { "id": "1", "updatedAt": 1700000000 }
}
```

### 2. `POST /push`
- **Body**: Array of `ChangeRow`:
```json
[
  {
    "id": "1",
    "newDocumentState": { "id": "1", "title": "Updated" },
    "assumedMasterState": { "id": "1", "title": "Old" }
  }
]
```
- **Conflict Handling**: Compare `assumedMasterState.updatedAt` with actual server document. If conflicting, return server master state in the response array.

### 3. `GET /pullStream` (Server-Sent Events)
- Open HTTP stream (`Content-Type: text/event-stream`).
- Emits real-time document change events to clients.
- Supports **`RESYNC`** flag: If client disconnects and reconnects, emitting `RESYNC` triggers an iteration pull to recover missed writes.
