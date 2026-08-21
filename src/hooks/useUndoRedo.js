import { useCallback, useEffect, useRef } from 'react';
import { applyUndoSnapshot, snapshotUndoState } from '../utils/undoState';

const MAX_UNDO = 50;
const DEBOUNCE_MS = 350;

export function useUndoRedo(stateRef, setState) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isApplying = useRef(false);
  const debounceSnapshot = useRef(null);
  const debounceTimer = useRef(null);

  const flushDebounce = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (debounceSnapshot.current) {
      undoStack.current.push(debounceSnapshot.current);
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
      redoStack.current = [];
      debounceSnapshot.current = null;
    }
  }, []);

  const pushUndo = useCallback((snapshot) => {
    if (!snapshot) return;
    undoStack.current.push(snapshot);
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const recordBeforeChange = useCallback(
    (current, { debounce = false } = {}) => {
      if (isApplying.current || !current) return;

      if (debounce) {
        if (!debounceSnapshot.current) {
          debounceSnapshot.current = snapshotUndoState(current);
        }
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          debounceTimer.current = null;
          if (debounceSnapshot.current) {
            pushUndo(debounceSnapshot.current);
            debounceSnapshot.current = null;
          }
        }, DEBOUNCE_MS);
        return;
      }

      const snapshot = snapshotUndoState(current);
      if (!snapshot) return;
      flushDebounce();
      pushUndo(snapshot);
    },
    [flushDebounce, pushUndo]
  );

  const clearHistory = useCallback(() => {
    flushDebounce();
    undoStack.current = [];
    redoStack.current = [];
  }, [flushDebounce]);

  const undo = useCallback(() => {
    flushDebounce();
    const current = stateRef.current;
    if (!current || undoStack.current.length === 0) return false;

    const previous = undoStack.current.pop();
    redoStack.current.push(snapshotUndoState(current));

    isApplying.current = true;
    setState((prev) => applyUndoSnapshot(prev, previous));
    isApplying.current = false;
    return true;
  }, [flushDebounce, setState, stateRef]);

  const redo = useCallback(() => {
    flushDebounce();
    const current = stateRef.current;
    if (!current || redoStack.current.length === 0) return false;

    const next = redoStack.current.pop();
    undoStack.current.push(snapshotUndoState(current));

    isApplying.current = true;
    setState((prev) => applyUndoSnapshot(prev, next));
    isApplying.current = false;
    return true;
  }, [flushDebounce, setState, stateRef]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const isUndo = e.code === 'KeyZ' && !e.shiftKey;
      const isRedo = (e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY';

      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [undo, redo]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    []
  );

  return {
    recordBeforeChange,
    clearHistory,
    undo,
    redo,
    canUndo: () => undoStack.current.length > 0 || Boolean(debounceSnapshot.current),
    canRedo: () => redoStack.current.length > 0,
  };
}
