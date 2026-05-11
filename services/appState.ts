import { backend } from './backend';
import { STORAGE_KEYS } from '../constants/storageKeys';

export type AppStateScope = 'global' | 'user';

const USER_PREFS_FIELD = 'prefsBundle';

const APP_STATE_SCOPE_MAP: Record<string, AppStateScope> = {
  [STORAGE_KEYS.roles]: 'global',
  [STORAGE_KEYS.landingConfig]: 'global',
  [STORAGE_KEYS.registryRecords]: 'global',
  [STORAGE_KEYS.recordDocTypes]: 'global',
  [STORAGE_KEYS.recordDocFields]: 'global',
  [STORAGE_KEYS.dataCollections]: 'global',

  [STORAGE_KEYS.supplyInventory]: 'global',
  [STORAGE_KEYS.supplyRequests]: 'global',
  [STORAGE_KEYS.supplyRisConfig]: 'global',
  [STORAGE_KEYS.supplyUnitMaster]: 'global',

  [STORAGE_KEYS.employmentRecords]: 'global',
  [STORAGE_KEYS.employmentConfig]: 'global',
  [STORAGE_KEYS.employmentSurveyProjects]: 'global',
  [STORAGE_KEYS.employmentFocalPersons]: 'global',
  [STORAGE_KEYS.employmentDesignations]: 'global',

  [STORAGE_KEYS.reportProjects]: 'global',
  [STORAGE_KEYS.reportSubmissions]: 'global',
  [STORAGE_KEYS.reportSettings]: 'global',
  [STORAGE_KEYS.reportReminderLog]: 'global',

  [STORAGE_KEYS.propertyConfig]: 'global',
  [STORAGE_KEYS.propertyCategories]: 'global',
  [STORAGE_KEYS.propertyAssets]: 'global',
  [STORAGE_KEYS.propertyCustody]: 'global',
  [STORAGE_KEYS.propertyTransactions]: 'global',
  [STORAGE_KEYS.propertyEvents]: 'global',
  [STORAGE_KEYS.propertyCountLines]: 'global',
  [STORAGE_KEYS.propertyAuditLog]: 'global',

  [STORAGE_KEYS.gmailWhitelist]: 'global',

  [STORAGE_KEYS.censusSurveyMasters]: 'global',
  [STORAGE_KEYS.censusSurveyCycles]: 'global',

  [STORAGE_KEYS.recordMunicipalities]: 'global',
  [STORAGE_KEYS.recordLocations]: 'global',

  [STORAGE_KEYS.theme]: 'user',
  [STORAGE_KEYS.sidebarExpanded]: 'user',
  [STORAGE_KEYS.supplyItemsView]: 'user',
  [STORAGE_KEYS.supplyInventoryView]: 'user',
  [STORAGE_KEYS.supplyCart]: 'user',
  [STORAGE_KEYS.supplyRequestPurpose]: 'user',
  [STORAGE_KEYS.censusSurveysView]: 'user',
  [STORAGE_KEYS.propertyRegistryView]: 'user',
  [STORAGE_KEYS.gmailOpenedIds]: 'user',
};

const USER_SCOPED_APP_STATE_KEY_SET = new Set<string>(
  Object.entries(APP_STATE_SCOPE_MAP)
    .filter(([, scope]) => scope === 'user')
    .map(([key]) => key)
);

const appStateRecordIdByKey = new Map<string, string>();
const appStateMutationQueueByKey = new Map<string, Promise<void>>();
const userBundleMutationQueueByOwner = new Map<string, Promise<void>>();

const quoted = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const isNotFound = (error: unknown) => {
  return Number((error as { status?: number } | null)?.status || 0) === 404;
};

const parseStorageValue = (rawValue: string): unknown => {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
};

export const serializeStorageValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

export const getAppStateScope = (key: string): AppStateScope => APP_STATE_SCOPE_MAP[key] || 'global';

export const isManagedAppStateKey = (key: string): boolean => Object.prototype.hasOwnProperty.call(APP_STATE_SCOPE_MAP, key);

export const getManagedAppStateKeys = (): string[] => Object.keys(APP_STATE_SCOPE_MAP);

const normalizeOwnerId = (ownerId?: string | null): string | null => {
  const normalized = typeof ownerId === 'string' ? ownerId.trim() : '';
  return normalized || null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  !!value
  && typeof value === 'object'
  && !Array.isArray(value)
);

const getBundleObject = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) return {};
  return { ...value };
};

const extractManagedUserValuesFromBundle = (bundle: Record<string, unknown>): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const key of USER_SCOPED_APP_STATE_KEY_SET) {
    if (Object.prototype.hasOwnProperty.call(bundle, key)) {
      values[key] = bundle[key];
    }
  }
  return values;
};

const removeManagedUserValuesFromBundle = (bundle: Record<string, unknown>) => {
  const nextBundle = { ...bundle };
  let changed = false;

  for (const key of USER_SCOPED_APP_STATE_KEY_SET) {
    if (!Object.prototype.hasOwnProperty.call(nextBundle, key)) continue;
    delete nextBundle[key];
    changed = true;
  }

  return { nextBundle, changed };
};

const findRecordByStoredKey = async (storedKey: string) => {
  const cachedId = appStateRecordIdByKey.get(storedKey);
  if (cachedId) {
    try {
      const byId = await backend.collection('app_state').getOne(cachedId);
      appStateRecordIdByKey.set(storedKey, byId.id);
      return byId;
    } catch (error) {
      if (!isNotFound(error)) throw error;
      appStateRecordIdByKey.delete(storedKey);
    }
  }

  try {
    const found = await backend.collection('app_state').getFirstListItem(`key = ${quoted(storedKey)}`);
    appStateRecordIdByKey.set(storedKey, found.id);
    return found;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
};

const upsertRecordByStoredKey = async (
  storedKey: string,
  {
    scope,
    owner,
    value,
  }: {
    scope: AppStateScope;
    owner?: string;
    value: unknown;
  }
) => {
  const existing = await findRecordByStoredKey(storedKey);

  if (existing) {
    const updated = await backend.collection('app_state').update(existing.id, {
      key: storedKey,
      scope,
      owner,
      value,
    });
    appStateRecordIdByKey.set(storedKey, updated.id);
    return updated;
  }

  const created = await backend.collection('app_state').create({
    key: storedKey,
    scope,
    owner,
    value,
  });
  appStateRecordIdByKey.set(storedKey, created.id);
  return created;
};

const deleteRecordByStoredKey = async (storedKey: string) => {
  const existing = await findRecordByStoredKey(storedKey);
  if (!existing) return;

  try {
    await backend.collection('app_state').delete(existing.id);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  appStateRecordIdByKey.delete(storedKey);
};

const getUserRecord = async (ownerId: string) => {
  const authRecord = backend.authStore.record;
  if (
    authRecord
    && String(authRecord.id) === ownerId
    && Object.prototype.hasOwnProperty.call(authRecord, USER_PREFS_FIELD)
  ) {
    return authRecord;
  }

  return backend.collection('users').getOne(ownerId);
};

const updateUserPrefsBundle = async (ownerId: string, bundle: Record<string, unknown>) => {
  const updated = await backend.collection('users').update(ownerId, {
    [USER_PREFS_FIELD]: bundle,
  });

  if (backend.authStore.record?.id === ownerId) {
    backend.authStore.save(backend.authStore.token, updated);
  }

  return updated;
};

const enqueueUserBundleMutation = async (ownerId: string, action: () => Promise<void>) => {
  const previous = userBundleMutationQueueByOwner.get(ownerId) || Promise.resolve();

  const next = previous
    .catch(() => {
      // Keep queue alive after failed mutation.
    })
    .then(action);

  userBundleMutationQueueByOwner.set(ownerId, next);

  try {
    await next;
  } finally {
    if (userBundleMutationQueueByOwner.get(ownerId) === next) {
      userBundleMutationQueueByOwner.delete(ownerId);
    }
  }
};

const enqueueAppStateMutation = async (storedKey: string, action: () => Promise<void>) => {
  const previous = appStateMutationQueueByKey.get(storedKey) || Promise.resolve();

  const next = previous
    .catch(() => {
      // Keep queue alive after failed mutation.
    })
    .then(action);

  appStateMutationQueueByKey.set(storedKey, next);

  try {
    await next;
  } finally {
    if (appStateMutationQueueByKey.get(storedKey) === next) {
      appStateMutationQueueByKey.delete(storedKey);
    }
  }
};

export const upsertAppStateFromStorageValue = async (key: string, rawValue: string, ownerId?: string | null) => {
  if (!backend.authStore.isValid || !isManagedAppStateKey(key)) return;

  const scope = getAppStateScope(key);
  const normalizedOwner = normalizeOwnerId(ownerId);
  if (scope === 'user' && !normalizedOwner) return;

  const value = parseStorageValue(rawValue);

  if (scope === 'user' && normalizedOwner) {
    await enqueueUserBundleMutation(normalizedOwner, async () => {
      const userRecord = await getUserRecord(normalizedOwner);
      const nextBundle = getBundleObject(userRecord?.[USER_PREFS_FIELD]);
      nextBundle[key] = value;

      await updateUserPrefsBundle(normalizedOwner, nextBundle);
    });

    return;
  }

  await enqueueAppStateMutation(key, async () => {
    await upsertRecordByStoredKey(key, {
      scope,
      owner: undefined,
      value,
    });
  });
};

export const removeAppStateKey = async (key: string, ownerId?: string | null) => {
  if (!backend.authStore.isValid || !isManagedAppStateKey(key)) return;

  const scope = getAppStateScope(key);
  const normalizedOwner = normalizeOwnerId(ownerId);
  if (scope === 'user' && !normalizedOwner) return;

  if (scope === 'user' && normalizedOwner) {
    await enqueueUserBundleMutation(normalizedOwner, async () => {
      const userRecord = await getUserRecord(normalizedOwner);
      const bundleObject = getBundleObject(userRecord?.[USER_PREFS_FIELD]);

      let shouldPersist = false;
      if (Object.prototype.hasOwnProperty.call(bundleObject, key)) {
        delete bundleObject[key];
        shouldPersist = true;
      }

      if (shouldPersist) {
        await updateUserPrefsBundle(normalizedOwner, bundleObject);
      }
    });

    return;
  }

  await enqueueAppStateMutation(key, async () => {
    await deleteRecordByStoredKey(key);
  });
};

export const loadManagedAppState = async (ownerId?: string | null): Promise<Record<string, string>> => {
  if (!backend.authStore.isValid) return {};

  const normalizedOwner = normalizeOwnerId(ownerId);
  const merged: Record<string, string> = {};

  const globalRecords = await backend.collection('app_state').getFullList({
    filter: `scope = ${quoted('global')}`,
    sort: 'key',
  });

  for (const record of globalRecords) {
    const appKey = String(record.key || '');
    if (!isManagedAppStateKey(appKey)) continue;

    merged[appKey] = serializeStorageValue(record.value);
    appStateRecordIdByKey.set(String(record.key), record.id);
  }

  if (normalizedOwner) {
    const userRecord = await getUserRecord(normalizedOwner);
    const managedBundleValues = extractManagedUserValuesFromBundle(
      getBundleObject(userRecord?.[USER_PREFS_FIELD]),
    );
    for (const [appKey, value] of Object.entries(managedBundleValues)) {
      merged[appKey] = serializeStorageValue(value);
    }
  }

  return merged;
};

export const clearAllManagedAppState = async (): Promise<void> => {
  if (!backend.authStore.isValid) return;

  const records = await backend.collection('app_state').getFullList({ sort: 'key' });
  for (const record of records) {
    await backend.collection('app_state').delete(record.id);
  }

  appStateRecordIdByKey.clear();
  appStateMutationQueueByKey.clear();
  const userRecords = await backend.collection('users').getFullList({ sort: 'id' });
  for (const userRecord of userRecords) {
    const ownerId = String(userRecord.id);
    await enqueueUserBundleMutation(ownerId, async () => {
      const currentRecord = await getUserRecord(ownerId);
      const bundleObject = getBundleObject(currentRecord?.[USER_PREFS_FIELD]);
      const { nextBundle, changed } = removeManagedUserValuesFromBundle(bundleObject);

      if (changed) {
        await updateUserPrefsBundle(ownerId, nextBundle);
      }
    });
  }

  userBundleMutationQueueByOwner.clear();
};
