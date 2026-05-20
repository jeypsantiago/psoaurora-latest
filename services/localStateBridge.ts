import {
  getAppStateScope,
  getManagedAppStateKeys,
  isManagedAppStateKey,
  loadManagedAppState,
  removeAppStateKey,
  upsertAppStateFromStorageValue,
} from './appState';

type UserIdGetter = () => string | null;

let isInstalled = false;
let isHydrating = false;
let getCurrentUserId: UserIdGetter = () => null;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const storagePrototype = Object.getPrototypeOf(window.localStorage) as Storage;
const originalGetItem = storagePrototype.getItem;
const originalSetItem = storagePrototype.setItem;
const originalRemoveItem = storagePrototype.removeItem;
const originalClear = storagePrototype.clear;

const queueSync = (key: string, action: () => Promise<void>) => {
  const prevTimer = pendingTimers.get(key);
  if (prevTimer) {
    clearTimeout(prevTimer);
  }

  const nextTimer = setTimeout(() => {
    pendingTimers.delete(key);
    void action().catch((error) => {
      console.error(`Failed to sync app state for key "${key}"`, error);
    });
  }, 120);

  pendingTimers.set(key, nextTimer);
};

const syncSetItem = (key: string, value: string) => {
  if (isHydrating || !isManagedAppStateKey(key)) return;

  const deleteTimer = pendingTimers.get(`delete:${key}`);
  if (deleteTimer) {
    clearTimeout(deleteTimer);
    pendingTimers.delete(`delete:${key}`);
  }

  const scope = getAppStateScope(key);
  const ownerId = getCurrentUserId();

  queueSync(key, async () => {
    await upsertAppStateFromStorageValue(key, value, ownerId);
  });

  if (scope === 'user' && !ownerId) {
    console.warn(`Skipped syncing user-scoped key "${key}" because no active user is authenticated.`);
  }
};

const syncRemoveItem = (key: string) => {
  if (isHydrating || !isManagedAppStateKey(key)) return;

  const setTimer = pendingTimers.get(key);
  if (setTimer) {
    clearTimeout(setTimer);
    pendingTimers.delete(key);
  }

  const ownerId = getCurrentUserId();
  queueSync(`delete:${key}`, async () => {
    await removeAppStateKey(key, ownerId);
  });
};

const setLocalWithoutSync = (key: string, value: string) => {
  isHydrating = true;
  try {
    const oldValue = originalGetItem.call(window.localStorage, key);
    originalSetItem.call(window.localStorage, key, value);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: value,
          oldValue,
          storageArea: window.localStorage,
        })
      );
    }
  } finally {
    isHydrating = false;
  }
};

const removeLocalWithoutSync = (key: string) => {
  isHydrating = true;
  try {
    const oldValue = originalGetItem.call(window.localStorage, key);
    originalRemoveItem.call(window.localStorage, key);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: null,
          oldValue,
          storageArea: window.localStorage,
        })
      );
    }
  } finally {
    isHydrating = false;
  }
};

export const installLocalStateBridge = (userIdGetter: UserIdGetter) => {
  getCurrentUserId = userIdGetter;

  if (isInstalled) return;

  storagePrototype.setItem = function setItemPatched(this: Storage, key: string, value: string) {
    const oldValue = originalGetItem.call(this, key);
    originalSetItem.call(this, key, value);
    if (this === window.localStorage) {
      syncSetItem(key, value);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: value,
          oldValue,
          storageArea: window.localStorage,
        })
      );
    }
  };

  storagePrototype.removeItem = function removeItemPatched(this: Storage, key: string) {
    const oldValue = originalGetItem.call(this, key);
    originalRemoveItem.call(this, key);
    if (this === window.localStorage) {
      syncRemoveItem(key);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: null,
          oldValue,
          storageArea: window.localStorage,
        })
      );
    }
  };

  storagePrototype.clear = function clearPatched(this: Storage) {
    if (this === window.localStorage) {
      const keysToDelete = getManagedAppStateKeys().filter((key) => originalGetItem.call(this, key) !== null);
      originalClear.call(this);
      for (const key of keysToDelete) {
        syncRemoveItem(key);
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: null,
            storageArea: window.localStorage,
          })
        );
      }
      return;
    }

    originalClear.call(this);
  };

  isInstalled = true;
};

export const hydrateManagedStateToLocalStorage = async (ownerId?: string | null) => {
  const remoteValues = await loadManagedAppState(ownerId);
  const managedKeys = getManagedAppStateKeys();

  for (const key of managedKeys) {
    if (Object.prototype.hasOwnProperty.call(remoteValues, key)) {
      setLocalWithoutSync(key, remoteValues[key]);
    } else {
      removeLocalWithoutSync(key);
    }
  }
};

export const clearUserScopedManagedState = () => {
  const managedKeys = getManagedAppStateKeys();
  for (const key of managedKeys) {
    if (getAppStateScope(key) === 'user') {
      removeLocalWithoutSync(key);
    }
  }
};
