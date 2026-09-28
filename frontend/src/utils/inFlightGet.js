// Coalesce concurrent reads only. Settled responses are never cached, so the next
// refresh makes a new request. Cancelable/custom requests retain their own lifecycle.
export function createInFlightGet(get, getScope) {
  const pending = new Map();
  return function sharedGet(url, config) {
    if (config && Object.keys(config).length) return get(url, config);
    const key = JSON.stringify([getScope(), url]);
    let request = pending.get(key);
    if (!request) {
      request = Promise.resolve().then(() => get(url, config));
      pending.set(key, request);
      const clear = () => { if (pending.get(key) === request) pending.delete(key); };
      request.then(clear, clear);
    }
    // Consumers sometimes sort or normalize data in-place. Keep their copies isolated.
    return request.then(response => ({ ...response, data: structuredClone(response.data) }));
  };
}
