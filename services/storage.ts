const hasWindow = typeof window !== 'undefined';

export const getStorageItem = (key: string): string | null => {
  if (!hasWindow) return null;
  return window.localStorage.getItem(key);
};

export const setStorageItem = (key: string, value: string): void => {
  if (!hasWindow) return;
  window.localStorage.setItem(key, value);
};

export const removeStorageItem = (key: string): void => {
  if (!hasWindow) return;
  window.localStorage.removeItem(key);
};

export const readStorageString = (key: string, fallback = ''): string => {
  const value = getStorageItem(key);
  return value ?? fallback;
};

export const readStorageJson = <T>(key: string, fallback: T): T => {
  const value = getStorageItem(key);
  return value ? (JSON.parse(value) as T) : fallback;
};

export const readStorageJsonSafe = <T>(key: string, fallback: T): T => {
  try {
    return readStorageJson(key, fallback);
  } catch {
    return fallback;
  }
};

export const writeStorageJson = (key: string, value: unknown): void => {
  const serialized = JSON.stringify(value);
  if (getStorageItem(key) === serialized) return;
  setStorageItem(key, serialized);
};
