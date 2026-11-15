import { shallowRef, onScopeDispose, type ShallowRef } from 'vue';
import { Query } from '../query/query';
import { BaseDocument, DocumentWithMeta } from '../types';

export function useXorinQuery<T extends BaseDocument>(query: Query<T>): ShallowRef<DocumentWithMeta<T>[]> {
  const data = shallowRef<DocumentWithMeta<T>[]>(query.getCurrentValue() || []);

  const unsubscribe = query.subscribe((newData) => {
    data.value = newData;
  });

  onScopeDispose(() => {
    unsubscribe();
  });

  return data;
}
