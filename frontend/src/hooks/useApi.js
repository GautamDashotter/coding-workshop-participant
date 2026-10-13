import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

/**
 * Load data from a GET endpoint.
 * Previous data stays visible while a new request (filter change or reload) is in flight.
 * @param {string|null} path endpoint path; null skips loading
 * @param {object} [query] query parameters
 * @returns {{data: any, loading: boolean, refreshing: boolean, error: Error|null, reload: Function}}
 */
export default function useApi(path, query) {
  const queryKey = JSON.stringify(query || {});
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const requestKey = path ? `${path}?${queryKey}#${nonce}` : null;

  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    api.get(path, JSON.parse(queryKey))
      .then((data) => live && setState({ key: requestKey, data, error: null }))
      .catch((error) => live && setState((s) => ({ key: requestKey, data: s.data, error })));
    return () => { live = false; };
  }, [path, queryKey, requestKey]);

  const pending = Boolean(path) && state.key !== requestKey;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: state.error ? null : state.data,
    error: pending ? null : state.error,
    loading: pending && !state.data,
    refreshing: pending,
    reload,
  };
}
