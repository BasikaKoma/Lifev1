const DB_NAME = 'lifev1-offline';
const STORE_NAME = 'write_queue';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    Promise.resolve(fn(store))
      .then(resolve)
      .catch(reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function enqueueWrite(operation) {
  return withStore('readwrite', (store) => {
    store.add({
      ...operation,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function getQueuedWrites() {
  return withStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function removeQueuedWrite(id) {
  return withStore('readwrite', (store) => {
    store.delete(id);
  });
}

export async function flushWriteQueue(processor) {
  if (typeof processor !== 'function') return 0;
  const items = await getQueuedWrites();
  let flushed = 0;

  for (const item of items) {
    try {
      await processor(item);
      await removeQueuedWrite(item.id);
      flushed += 1;
    } catch {
      break;
    }
  }

  return flushed;
}

export function installOfflineFlush(onFlush) {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    flushWriteQueue(onFlush).catch(() => {});
  };

  window.addEventListener('online', handleOnline);

  let removeAppListener = () => {};
  (async () => {
    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) handleOnline();
        });
        removeAppListener = () => handle.remove();
      } catch {
        // Capacitor not installed
      }
    }
  })();

  if (navigator.onLine) {
    handleOnline();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    removeAppListener();
  };
}
