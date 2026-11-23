"use client";

import { useEffect, useRef, useState } from "react";
import { emptyState, type LabState } from "../lib/missions";
import {
  createPersistence,
  isRecordReset,
  type SaveStatus,
} from "../lib/persistence";

type StoredLabOptions = {
  onSaved?: (state: LabState) => void;
  onExternalReset?: () => void;
};

export function useStoredLab(options: StoredLabOptions = {}) {
  // Keep screen callbacks current without reloading records on each render.
  const callbacks = useRef(options);
  callbacks.current = options;
  const [state, setState] = useState(emptyState);
  const [status, setStatus] = useState<SaveStatus>({
    phase: "loading",
    ready: false,
    localSaved: false,
    savedAt: null,
    expiresAt: null,
    message: "",
  });
  const controller = useRef<ReturnType<typeof createPersistence> | null>(null);
  useEffect(() => {
    let alive = true;
    const persistence = createPersistence({
      storage: {
        get length() {
          return localStorage.length;
        },
        key: (index) => localStorage.key(index),
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      },
      tabStorage: {
        getItem: (key) => sessionStorage.getItem(key),
        setItem: (key, value) => sessionStorage.setItem(key, value),
        removeItem: (key) => sessionStorage.removeItem(key),
      },
      onState: (next) => {
        if (alive) setState(next);
      },
      onStatus: (next) => {
        if (alive) setStatus(next);
      },
      onSaved: (next) => callbacks.current.onSaved?.(next),
    });
    controller.current = persistence;
    void persistence.load();
    const onStorage = (event: StorageEvent) => {
      if (isRecordReset(event)) {
        callbacks.current.onExternalReset?.();
        persistence.externalReset();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      persistence.dispose();
      controller.current = null;
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    controller.current?.stage(state);
  }, [state]);
  return { state, setState, status, controller };
}
