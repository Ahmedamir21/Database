/**
 * One hook for every screen that reads from the API.
 *
 * It keeps the three states that every screen has to handle (loading, data, error) in one
 * place, and it gives the screen a `reload()` to call after a change (a registration, a
 * score, a payment) so that the numbers on the page are always the numbers in the database.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(loader, key = 'once') {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const alive = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (alive.current) setState({ loading: false, data, error: null });
    } catch (error) {
      if (alive.current) setState({ loading: false, data: null, error: error.message || 'The request failed.' });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run, key]);

  return { ...state, reload: run, setData: (data) => setState({ loading: false, data, error: null }) };
}

/** a small helper for the forms: run an action, keep the message, refresh what changed */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const exec = useCallback(async (action, { onSuccess, successMessage } = {}) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setMessage(successMessage || result?.message || 'Done.');
      if (onSuccess) await onSuccess(result);
      return result;
    } catch (actionError) {
      setError(actionError.message || 'The operation failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, message, exec, clear: () => { setError(null); setMessage(null); } };
}
