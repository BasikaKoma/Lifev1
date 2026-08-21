/** Autosave interval while there are unsaved edits. */
export const SAVE_INTERVAL_MS = 5 * 60 * 1000;

/** Coalesce IndexedDB ink writes so drawing stays off the disk path. */
export const LOCAL_INK_WRITE_MS = 250;

/** Abort Supabase requests that hang (e.g. unhealthy database). */
export const SAVE_REQUEST_TIMEOUT_MS = 30_000;
