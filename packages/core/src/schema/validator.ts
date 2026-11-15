export type JsonSchemaPropertyType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface JsonSchemaProperty {
  type: JsonSchemaPropertyType;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: unknown[];
  items?: JsonSchemaProperty;
}

export type IndexDefinition<T> = keyof T | Array<keyof T>;

export interface CollectionSchema<T = Record<string, unknown>> {
  title?: string;
  version?: number;
  primaryKey?: keyof T | string;
  keyCompression?: boolean;
  type?: 'object';
  properties?: {
    [P in keyof T]?: JsonSchemaProperty;
  };
  required?: Array<keyof T>;
  indexes?: Array<IndexDefinition<T>>;
}

export function validateDocumentAgainstSchema<T>(
  doc: Record<string, unknown>,
  schema?: CollectionSchema<T>
): void {
  if (!schema) return;

  // 1. Check required properties
  if (schema.required && Array.isArray(schema.required)) {
    for (const reqKey of schema.required as string[]) {
      if (doc[reqKey] === undefined || doc[reqKey] === null) {
        throw new Error(`[Schema Validation Error] Field "${reqKey}" is required.`);
      }
    }
  }

  // 2. Check property types & constraints
  if (schema.properties) {
    for (const [propName, propDef] of Object.entries(schema.properties) as [string, JsonSchemaProperty][]) {
      const val = doc[propName];
      if (val === undefined || val === null) continue;

      // Type check
      if (propDef.type === 'string' && typeof val !== 'string') {
        throw new Error(`[Schema Validation Error] Field "${propName}" must be a string, received ${typeof val}.`);
      }
      if (propDef.type === 'number' && typeof val !== 'number') {
        throw new Error(`[Schema Validation Error] Field "${propName}" must be a number, received ${typeof val}.`);
      }
      if (propDef.type === 'boolean' && typeof val !== 'boolean') {
        throw new Error(`[Schema Validation Error] Field "${propName}" must be a boolean, received ${typeof val}.`);
      }
      if (propDef.type === 'array' && !Array.isArray(val)) {
        throw new Error(`[Schema Validation Error] Field "${propName}" must be an array.`);
      }
      if (propDef.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
        throw new Error(`[Schema Validation Error] Field "${propName}" must be an object.`);
      }

      // String constraints
      if (typeof val === 'string') {
        if (propDef.minLength !== undefined && val.length < propDef.minLength) {
          throw new Error(`[Schema Validation Error] Field "${propName}" must have length >= ${propDef.minLength}.`);
        }
        if (propDef.maxLength !== undefined && val.length > propDef.maxLength) {
          throw new Error(`[Schema Validation Error] Field "${propName}" must have length <= ${propDef.maxLength}.`);
        }
      }

      // Number constraints
      if (typeof val === 'number') {
        if (propDef.minimum !== undefined && val < propDef.minimum) {
          throw new Error(`[Schema Validation Error] Field "${propName}" must be >= ${propDef.minimum}.`);
        }
        if (propDef.maximum !== undefined && val > propDef.maximum) {
          throw new Error(`[Schema Validation Error] Field "${propName}" must be <= ${propDef.maximum}.`);
        }
      }

      // Enum check
      if (propDef.enum && !propDef.enum.includes(val)) {
        throw new Error(
          `[Schema Validation Error] Field "${propName}" must be one of [${propDef.enum.join(', ')}], received "${val}".`
        );
      }
    }
  }
}
