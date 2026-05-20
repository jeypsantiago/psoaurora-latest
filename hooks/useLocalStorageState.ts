import React, { useState, useEffect, useCallback, useRef } from "react";
import { readStorageJsonSafe } from "../services/storage";

export function useLocalStorageState<T>(
  key: string,
  fallback: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() =>
    readStorageJsonSafe<T>(key, fallback),
  );

  const latestStateRef = useRef<T>(state);
  const latestFallbackRef = useRef<T>(fallback);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestFallbackRef.current = fallback;
  }, [fallback]);

  const setValue = useCallback(
    (value: React.SetStateAction<T>) => {
      setState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: T) => T)(prev)
            : value;
        const serialized = JSON.stringify(next);
        if (typeof window !== "undefined") {
          const currentInStorage = window.localStorage.getItem(key);
          if (currentInStorage !== serialized) {
            window.localStorage.setItem(key, serialized);
          }
        }
        return next;
      });
    },
    [key],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== key) return;

      try {
        const newValue = event.newValue;
        const parsed =
          newValue !== null
            ? (JSON.parse(newValue) as T)
            : latestFallbackRef.current;

        if (JSON.stringify(latestStateRef.current) !== JSON.stringify(parsed)) {
          setState(parsed);
        }
      } catch (e) {
        console.error(`Failed to parse storage event for key "${key}":`, e);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [key]);

  return [state, setValue];
}
