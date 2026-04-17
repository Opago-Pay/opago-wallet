import 'react-native-get-random-values';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

if (typeof global.DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}

if (typeof window !== 'undefined') {
  window.indexedDB = {
    databases: async () => [],
    open: function () {
      const db = {
        close: () => {},
        transaction: () => {
          const tx = {
            objectStore: () => {
              const store = {
                get: () => { const r = { onsuccess: null, result: null }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; },
                put: () => { const r = { onsuccess: null }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; },
                delete: () => { const r = { onsuccess: null }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; },
                getAll: () => { const r = { onsuccess: null, result: [] }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; },
                openCursor: () => { const r = { onsuccess: null, result: null }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; },
                index: () => ({
                  getAll: () => { const r = { onsuccess: null, result: [] }; setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0); return r; }
                }),
                createIndex: () => {}
              };
              return store;
            },
            oncomplete: null,
            onerror: null,
          };
          setTimeout(() => tx.oncomplete && tx.oncomplete(), 10);
          return tx;
        },
        createObjectStore: () => ({
          createIndex: () => {}
        }),
        objectStoreNames: { contains: () => true, length: 1 }
      };
      const request = {
        result: db,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };
      setTimeout(() => {
        if (request.onupgradeneeded) request.onupgradeneeded({ target: request, oldVersion: 0, newVersion: 1 });
        if (request.onsuccess) request.onsuccess({ target: request });
      }, 0);
      return request;
    }
  };
}

const originalFetch = global.fetch;
global.fetch = async function(url, options) {
  try {
    if (options && options.signal) {
      // React Native's native fetch outright rejects requests if the `signal` isn't its own strictly typed native AbortSignal
      // If we pass an extended one from Atomiq, fetch will throw "TypeError: Network request failed" or "signal is not an instance of AbortSignal" synchronously
      delete options.signal;
    }
    return await originalFetch(url, options);
  } catch (error) {
    console.log("FETCH ERROR for URL:", url, "Error details:", error);
    throw error;
  }
};

if (typeof global.crypto !== 'object') {
  global.crypto = {};
}

// Ensure globalThis.crypto maps perfectly immediately
if (typeof globalThis !== 'undefined') {
  globalThis.crypto = global.crypto;
}

if (typeof AbortSignal !== 'undefined') {
  AbortSignal.prototype.throwIfAborted = function () {
    if (this.aborted) {
      const err = this.reason || new Error('The operation was aborted');
      if (!this.reason) err.name = 'AbortError';
      throw err;
    }
  };
}

if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    _data: {},
    setItem: function(id, val) { return this._data[id] = String(val); },
    getItem: function(id) { return this._data.hasOwnProperty(id) ? this._data[id] : null; },
    removeItem: function(id) { return delete this._data[id]; },
    clear: function() { return this._data = {}; }
  };
}
if (typeof window !== 'undefined') {
  window.localStorage = window.localStorage || global.localStorage;
}


