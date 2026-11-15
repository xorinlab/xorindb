# 03. Schema, Indexing & Security

## 1. Schema Validation
XorinDB supports declarative JSON Schema validation at collection initialization.

```typescript
const issues = db.collection('issues', {
  schema: {
    version: 1,
    primaryKey: 'id',
    required: ['title', 'status'],
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 100 },
      status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
      priority: { type: 'number', minimum: 1, maximum: 5 },
      secretApiKey: { type: 'string' }
    },
    indexes: [
      'status',
      ['workspaceId', 'status'] // Compound Index
    ],
    encrypted: ['secretApiKey'],
    keyCompression: true
  }
});
```

---

## 2. Custom Primary Key (`primaryKey`)
Instead of mandatory UUID `id`, specify any unique domain field as primary key:
```typescript
const users = db.collection('users', {
  schema: {
    primaryKey: 'username',
    properties: {
      username: { type: 'string' }
    }
  }
});

const user = await users.insert({ username: 'shafayet_anik' });
const fetched = await users.findById('shafayet_anik');
```

---

## 3. Compound Indexes
To optimize complex multi-field lookups on large client datasets:
```typescript
schema: {
  indexes: [
    'status',
    ['workspaceId', 'status'],
    ['status', 'priority']
  ]
}
```
Creates native IndexedDB compound indexes (`idx_workspaceId_status`) ensuring query resolution without linear disk scans.

---

## 4. Key Compression
Reduces storage footprint in IndexedDB by replacing verbose JSON keys with short tokens on disk (`|a`, `|b`) while transparently presenting original keys in user code:
```typescript
schema: {
  keyCompression: true,
  properties: {
    veryLongCustomerResidentialAddress: { type: 'string' }
  }
}
```

---

## 5. Field-Level Encryption (AES-GCM 256-bit)
Protects sensitive client data from browser DevTools inspection or malicious extensions:
```typescript
const db = await createDatabase({
  name: 'secure-vault',
  password: 'user-passphrase'
});

const secrets = db.collection('secrets', {
  schema: {
    encrypted: ['apiToken', 'privateKey'],
    properties: {
      title: { type: 'string' },
      apiToken: { type: 'string' },
      privateKey: { type: 'string' }
    }
  }
});
```
Encrypted fields are transformed into AES-GCM cipher envelopes (`{ __xorin_enc: true, iv: [...], data: [...] }`) with random 12-byte IVs and PBKDF2 derived keys.
