import { BsonTypeName, FilterQuery } from '../types';

export interface IQueryBuilder<T, R> {
  where(fieldOrFilter: string | FilterQuery<T>): R;
  eq(value: unknown): R;
  equals(value: unknown): R;
  ne(value: unknown): R;
  gt(value: number | string): R;
  gte(value: number | string): R;
  lt(value: number | string): R;
  lte(value: number | string): R;
  in(values: unknown[]): R;
  nin(values: unknown[]): R;
  regex(pattern: string | RegExp, options?: string): R;
  exists(exists?: boolean): R;
  type(typeName: BsonTypeName | string): R;
  size(len: number): R;
  all(values: unknown[]): R;
  elemMatch(condition: Record<string, unknown> | FilterQuery<unknown>): R;
}

export class QueryFilterState<T> {
  private filter: FilterQuery<T> = {};
  private currentField?: string;

  getFilter(): FilterQuery<T> {
    return this.filter;
  }

  setFilter(filter?: FilterQuery<T>): void {
    this.filter = filter ? { ...filter } : {};
  }

  where(fieldOrFilter: string | FilterQuery<T>): void {
    if (typeof fieldOrFilter === 'string') {
      this.currentField = fieldOrFilter;
    } else {
      this.filter = { ...this.filter, ...fieldOrFilter };
      this.currentField = undefined;
    }
  }

  addCondition(operator: string, value: unknown, extra?: Record<string, unknown>): void {
    const field = this.currentField;
    if (!field) {
      throw new Error(`Cannot apply operator '${operator}' without active field. Call .where('field') first.`);
    }

    const currentVal = this.filter[field];
    if (currentVal !== null && typeof currentVal === 'object' && !(currentVal instanceof RegExp) && !Array.isArray(currentVal)) {
      (this.filter as Record<string, unknown>)[field] = {
        ...(currentVal as Record<string, unknown>),
        [operator]: value,
        ...(extra || {})
      };
    } else {
      (this.filter as Record<string, unknown>)[field] = {
        [operator]: value,
        ...(extra || {})
      };
    }
  }
}
