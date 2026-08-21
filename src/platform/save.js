export function onFlushBeforeClose(callback) {
  if (window.electronSave?.onFlushBeforeClose) {
    return window.electronSave.onFlushBeforeClose(callback);
  }
  return undefined;
}

export async function flushNow(flushFn) {
  if (typeof flushFn !== 'function') return true;
  try {
    const result = await flushFn();
    return result !== false;
  } catch {
    return false;
  }
}
