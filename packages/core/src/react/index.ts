import { useSyncExternalStore, useMemo } from 'react';
import { Query } from '../query/query';
import { BaseDocument, DocumentWithMeta } from '../types';

export function useXorinQuery<T extends BaseDocument>(query: Query<T>): DocumentWithMeta<T>[] {
  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      const unsub = query.subscribe(() => {
        callback();
      });
      return unsub;
    };
  }, [query]);

  const getSnapshot = useMemo(() => {
    return () => query.getCurrentValue() || [];
  }, [query]);

  // Support SSR safely
  const getServerSnapshot = () => [];

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
