import { CollectionSchema } from './validator';

export class KeyCompressor<T> {
  private schema?: CollectionSchema<T>;
  private keyToCompressed: Map<string, string> = new Map();
  private compressedToKey: Map<string, string> = new Map();
  private isEnabled: boolean = false;

  constructor(schema?: CollectionSchema<T>) {
    this.schema = schema;
    this.isEnabled = Boolean(schema?.keyCompression && schema.properties);

    if (this.isEnabled && schema?.properties) {
      this.buildCompressionTable(schema.properties);
    }
  }

  private buildCompressionTable(properties: Record<string, unknown>): void {
    const keys = Object.keys(properties).sort();
    let charCode = 97; // 'a'

    for (const key of keys) {
      // Don't compress core internal properties or primary key
      if (key === 'id' || key === '_deleted' || key === '_updatedAt' || key === this.schema?.primaryKey) {
        continue;
      }

      let shortKey = '';
      if (charCode <= 122) {
        shortKey = `|${String.fromCharCode(charCode)}`;
        charCode++;
      } else {
        shortKey = `|${charCode - 97}`;
        charCode++;
      }

      this.keyToCompressed.set(key, shortKey);
      this.compressedToKey.set(shortKey, key);
    }
  }

  compress(doc: Record<string, unknown>): Record<string, unknown> {
    if (!this.isEnabled) return doc;

    const compressed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(doc)) {
      const targetKey = this.keyToCompressed.get(key) || key;
      compressed[targetKey] = val;
    }
    return compressed;
  }

  decompress(doc: Record<string, unknown>): Record<string, unknown> {
    if (!this.isEnabled) return doc;

    const decompressed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(doc)) {
      const targetKey = this.compressedToKey.get(key) || key;
      decompressed[targetKey] = val;
    }
    return decompressed;
  }

  isCompressionEnabled(): boolean {
    return this.isEnabled;
  }
}
