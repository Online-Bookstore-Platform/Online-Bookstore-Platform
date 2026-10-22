import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api.js';

/**
 * GET `path` and keep { status, data, error }.
 *  - Passing a falsy path does nothing.
 *  - Previous data stays available while a new request is loading, so a list
 *    does not flash empty when the person changes a filter or page.
 *  - Superseded requests are aborted.
 */
export function useApi(path) {
  const [state, setState] = useState({ status: path ? 'loading' : 'idle', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    setState((s) => ({ status: 'loading', data: s.data, error: null }));

    apiGet(path, { signal: controller.signal })
      .then((payload) => setState({ status: 'success', data: payload, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState((s) => ({ status: 'error', data: s.data, error }));
      });

    return () => controller.abort();
  }, [path, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
