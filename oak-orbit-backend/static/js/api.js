/* Thin fetch wrapper around the Flask API. Every call sends/receives JSON
   and includes the session cookie so the server knows who's asking. */
const api = (() => {
  async function call(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res, data;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw { error: 'Network error. Is the server running?' };
    }
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (!res.ok) throw (data && data.error ? data : { error: 'Something went wrong.' });
    return data;
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b === undefined ? {} : b),
    put: (p, b) => call('PUT', p, b === undefined ? {} : b),
    del: (p) => call('DELETE', p),
  };
})();
