"use client";

import { useEffect, useRef, useState } from "react";
import { emptyState } from "../lib/missions";
import {
  createPersistence,
  isRecordReset,
  type SaveStatus,
} from "../lib/persistence";

export function useStoredLab() {
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
      onState: setState,
      onStatus: setStatus,
    });
    controller.current = persistence;
    void persistence.load();
    const onStorage = (event: StorageEvent) => {
      if (isRecordReset(event)) persistence.externalReset();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      persistence.dispose();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    controller.current?.stage(state);
  }, [state]);
  return { state, setState, status, controller };
}
