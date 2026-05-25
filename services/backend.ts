import type { RecordModel } from 'pocketbase';
import { deleteLandingAssetBySource } from './mediaAssets';
import {
  AUTH_COLLECTION,
  pb,
  getCurrentAuthRecord,
  getCurrentUserId,
  hasActiveSession,
  waitForInitialAuth,
} from './pocketbase';

type AnyRecord = Record<string, any>;
type AuthChangeListener = (token: string, record: AnyRecord | null) => void;
type UserMutationPayload = Record<string, unknown>;
type UserMutationOptions = {
  onAvatarUploadProgress?: (progress: unknown) => void;
  onSignatureUploadProgress?: (progress: unknown) => void;
};

export const BACKEND_URL = pb.baseURL;

class BackendResponseError extends Error {
  status: number;
  response: Record<string, unknown>;

  constructor(status: number, message: string, response: Record<string, unknown> = {}) {
    super(message);
    this.name = `BackendResponseError ${status}`;
    this.status = status;
    this.response = response;
  }
}

const authListeners = new Set<AuthChangeListener>();
let currentToken = pb.authStore.token || '';
let currentRecord: AnyRecord | null = null;

const notifyAuthListeners = () => {
  for (const listener of authListeners) {
    listener(currentToken, currentRecord);
  }
};

const asArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean);
      }
    } catch {
      return [value.trim()];
    }
  }
  return [];
};

const asObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const firstFileName = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

const mapUserRecord = (row: AnyRecord | null): AnyRecord | null => {
  if (!row) return null;

  const avatarFile = firstFileName(row.avatar);
  const signatureFile = firstFileName(row.signature);

  return {
    id: String(row.id || ''),
    email: row.email || '',
    name: row.name || row.email || 'Unnamed User',
    roles: asArray(row.roles),
    gender: row.gender || 'Prefer not to say',
    position: row.position || '',
    prefsBundle: asObject(row.prefsBundle),
    lastAccess: row.lastAccess || 'Never',
    avatar: avatarFile ? pb.files.getURL(row as RecordModel, avatarFile) : '',
    signature: signatureFile ? pb.files.getURL(row as RecordModel, signatureFile) : '',
    avatarFileId: avatarFile,
    signatureFileId: signatureFile,
    avatarPath: avatarFile,
    signaturePath: signatureFile,
    mustResetPassword: !!row.mustResetPassword,
    isSuperAdmin: !!row.isSuperAdmin,
    _raw: row,
  };
};

const toBackendError = (error: any, fallbackMessage: string) => {
  if (!error) return null;
  const status = Number(error?.status || error?.response?.status || 500);
  const message = error?.response?.message || error?.message || fallbackMessage;
  return new BackendResponseError(status, message, error?.response?.data || {});
};

const throwBackendError = (error: any, fallbackMessage: string) => {
  const mapped = toBackendError(error, fallbackMessage);
  if (mapped) throw mapped;
};

const notFound = (message: string) => {
  throw new BackendResponseError(404, message);
};

const quotedFilterValue = (value: string) =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const buildAppStateFilter = (filter?: string) => {
  if (!filter) return '';
  return filter.replace(/\bowner\s*=/g, 'ownerId =');
};

const setCurrentAuth = (token: string, record: AnyRecord | null) => {
  currentToken = token;
  currentRecord = record;
  notifyAuthListeners();
};

const appendIfDefined = (formData: FormData, key: string, value: unknown) => {
  if (value === undefined) return;
  if (value === null) {
    formData.append(key, '');
    return;
  }
  if (value instanceof File || value instanceof Blob) {
    formData.append(key, value);
    return;
  }
  if (typeof value === 'object') {
    formData.append(key, JSON.stringify(value));
    return;
  }
  formData.append(key, String(value));
};

const normalizeUserPayload = (payload: UserMutationPayload, includePassword = true) => {
  const normalizedRoles = Array.isArray(payload.roles)
    ? payload.roles.map((value) => String(value)).filter(Boolean)
    : undefined;
  const isSuperAdmin = typeof payload.isSuperAdmin === 'boolean'
    ? payload.isSuperAdmin
    : (normalizedRoles ? normalizedRoles.includes('Super Admin') : undefined);

  return {
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    roles: normalizedRoles,
    isSuperAdmin,
    gender: typeof payload.gender === 'string' ? payload.gender : undefined,
    position: typeof payload.position === 'string' ? payload.position : undefined,
    lastAccess: typeof payload.lastAccess === 'string' ? payload.lastAccess : undefined,
    prefsBundle: payload.prefsBundle && typeof payload.prefsBundle === 'object' ? payload.prefsBundle : undefined,
    mustResetPassword: typeof payload.mustResetPassword === 'boolean' ? payload.mustResetPassword : undefined,
    password: includePassword && typeof payload.password === 'string' && payload.password.trim()
      ? payload.password.trim()
      : undefined,
    avatarFile: payload.avatarFile instanceof File ? payload.avatarFile : undefined,
    signatureFile: payload.signatureFile instanceof File ? payload.signatureFile : undefined,
    clearAvatar: payload.avatarFile === null || payload.avatar === '',
    clearSignature: payload.signatureFile === null || payload.signature === '',
  };
};

const buildUserFormData = (payload: UserMutationPayload, includePassword = true) => {
  const normalized = normalizeUserPayload(payload, includePassword);
  const formData = new FormData();

  appendIfDefined(formData, 'email', normalized.email);
  appendIfDefined(formData, 'emailVisibility', typeof payload.emailVisibility === 'boolean' ? payload.emailVisibility : undefined);
  appendIfDefined(formData, 'verified', typeof payload.verified === 'boolean' ? payload.verified : undefined);
  appendIfDefined(formData, 'name', normalized.name);
  appendIfDefined(formData, 'roles', normalized.roles);
  appendIfDefined(formData, 'isSuperAdmin', normalized.isSuperAdmin);
  appendIfDefined(formData, 'gender', normalized.gender);
  appendIfDefined(formData, 'position', normalized.position);
  appendIfDefined(formData, 'lastAccess', normalized.lastAccess);
  appendIfDefined(formData, 'prefsBundle', normalized.prefsBundle);
  appendIfDefined(formData, 'mustResetPassword', normalized.mustResetPassword);

  if (normalized.password) {
    appendIfDefined(formData, 'password', normalized.password);
    appendIfDefined(formData, 'passwordConfirm', normalized.password);
  }

  if (normalized.avatarFile) {
    appendIfDefined(formData, 'avatar', normalized.avatarFile);
  } else if (normalized.clearAvatar) {
    appendIfDefined(formData, 'avatar', null);
  }

  if (normalized.signatureFile) {
    appendIfDefined(formData, 'signature', normalized.signatureFile);
  } else if (normalized.clearSignature) {
    appendIfDefined(formData, 'signature', null);
  }

  return formData;
};

const fetchUserRecord = async (userId: string) => {
  try {
    return await pb.collection(AUTH_COLLECTION).getOne(userId);
  } catch (error) {
    throwBackendError(error, 'Unable to load user.');
    return null;
  }
};

const usersCollection = {
  async getFullList(options?: { sort?: string }) {
    try {
      const records = await pb.collection(AUTH_COLLECTION).getFullList({
        sort: options?.sort === 'name' ? 'name' : undefined,
      });
      return records.map((record) => mapUserRecord(record));
    } catch (error) {
      const status = Number(error?.status || error?.response?.status || 0);
      const currentUserId = getCurrentUserId();
      if ((status === 401 || status === 403) && currentUserId) {
        const currentRecord = await fetchUserRecord(currentUserId);
        return currentRecord ? [mapUserRecord(currentRecord)] : [];
      }
      throwBackendError(error, 'Unable to load users.');
      return [];
    }
  },

  async getOne(id: string) {
    const row = await fetchUserRecord(id);
    if (!row) notFound('User not found.');
    return mapUserRecord(row);
  },

  async create(payload: UserMutationPayload, _options?: UserMutationOptions) {
    try {
      const normalized = normalizeUserPayload(payload, true);
      const formData = buildUserFormData({
        ...payload,
        emailVisibility: true,
        verified: true,
        mustResetPassword: normalized.password ? false : true,
      });

      if (!normalized.password) {
        const generatedPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        formData.set('password', generatedPassword);
        formData.set('passwordConfirm', generatedPassword);
      }

      const created = await pb.collection(AUTH_COLLECTION).create(formData);
      return mapUserRecord(created);
    } catch (error) {
      throwBackendError(error, 'Unable to create user.');
      return null;
    }
  },

  async update(id: string, payload: UserMutationPayload, _options?: UserMutationOptions) {
    try {
      const formData = buildUserFormData(payload, true);
      const updated = await pb.collection(AUTH_COLLECTION).update(id, formData);

      const mapped = mapUserRecord(updated);
      if (getCurrentUserId() === id) {
        pb.authStore.save(pb.authStore.token, updated);
        setCurrentAuth(pb.authStore.token, mapped);
      }

      return mapped;
    } catch (error) {
      throwBackendError(error, 'Unable to update user.');
      return null;
    }
  },

  async delete(id: string) {
    try {
      await pb.collection(AUTH_COLLECTION).delete(id);
    } catch (error) {
      throwBackendError(error, 'Unable to delete user.');
    }
  },

  async authWithPassword(identity: string, secret: string) {
    try {
      const authData = await pb.collection(AUTH_COLLECTION).authWithPassword(identity, secret);
      const mapped = mapUserRecord(authData.record);
      setCurrentAuth(authData.token, mapped);
      return {
        token: authData.token,
        record: mapped,
      };
    } catch (error) {
      throw new Error(error?.response?.message || error?.message || 'Invalid email or password.');
    }
  },
};

const appStateCollection = {
  async getOne(id: string) {
    try {
      return await pb.collection('app_state').getOne(id);
    } catch (error) {
      throwBackendError(error, 'Unable to load app state record.');
      return null;
    }
  },

  async getFirstListItem(filter: string) {
    try {
      return await pb.collection('app_state').getFirstListItem(buildAppStateFilter(filter));
    } catch (error) {
      const mapped = toBackendError(error, 'Unable to query app state.');
      if (mapped?.status === 404) notFound('App state record not found.');
      throw mapped;
    }
  },

  async getFullList(options?: { filter?: string; sort?: string }) {
    try {
      return await pb.collection('app_state').getFullList({
        filter: buildAppStateFilter(options?.filter),
        sort: options?.sort === 'key' ? 'key' : undefined,
      });
    } catch (error) {
      throwBackendError(error, 'Unable to load app state.');
      return [];
    }
  },

  async create(payload: AnyRecord) {
    try {
      return await pb.collection('app_state').create({
        key: payload.key,
        scope: payload.scope,
        ownerId: payload.owner || '',
        value: payload.value ?? null,
      });
    } catch (error) {
      throwBackendError(error, 'Unable to create app state record.');
      return null;
    }
  },

  async update(id: string, payload: AnyRecord) {
    try {
      return await pb.collection('app_state').update(id, {
        key: payload.key,
        scope: payload.scope,
        ownerId: payload.owner || '',
        value: payload.value ?? null,
      });
    } catch (error) {
      throwBackendError(error, 'Unable to update app state record.');
      return null;
    }
  },

  async delete(id: string) {
    try {
      await pb.collection('app_state').delete(id);
    } catch (error) {
      throwBackendError(error, 'Unable to delete app state record.');
    }
  },
};

const landingAssetsCollection = {
  async delete(source: string) {
    await deleteLandingAssetBySource(source);
  },
};

export const backend = {
  autoCancellation() {
    return undefined;
  },
  authStore: {
    get token() {
      return currentToken;
    },
    get record() {
      return currentRecord;
    },
    get isValid() {
      return hasActiveSession();
    },
    save(token: string, record: AnyRecord | null) {
      currentToken = token;
      currentRecord = record;
      pb.authStore.save(token, record?._raw || record || null);
      notifyAuthListeners();
    },
    clear() {
      pb.authStore.clear();
      setCurrentAuth('', null);
    },
    onChange(listener: AuthChangeListener, fireImmediately = false) {
      authListeners.add(listener);
      if (fireImmediately) {
        listener(currentToken, currentRecord);
      }

      return () => {
        authListeners.delete(listener);
      };
    },
    async resolve() {
      await waitForInitialAuth();
      const authRecord = getCurrentAuthRecord();
      if (pb.authStore.isValid && authRecord?.id) {
        setCurrentAuth(pb.authStore.token || '', mapUserRecord(authRecord));
        return;
      }
      setCurrentAuth('', null);
    },
    async refresh() {
      try {
        const authData = await pb.collection(AUTH_COLLECTION).authRefresh();
        const mapped = mapUserRecord(authData.record);
        setCurrentAuth(authData.token, mapped);
        return {
          token: authData.token,
          record: mapped,
        };
      } catch (error) {
        pb.authStore.clear();
        setCurrentAuth('', null);
        throw error;
      }
    },
  },
  files: {
    getURL(record: AnyRecord, fieldName: string) {
      const raw = record?._raw || record;
      if (!raw) return '';
      return pb.files.getURL(raw as RecordModel, fieldName);
    },
  },
  filter(value: string, params: Record<string, unknown>) {
    return pb.filter(value, params);
  },
  collection(name: string): any {
    if (name === AUTH_COLLECTION || name === 'users' || name === 'staff_users') return usersCollection;
    if (name === 'app_state') return appStateCollection;
    if (name === 'landing_assets') return landingAssetsCollection;
    throw new Error(`Unsupported backend collection: ${name}`);
  },
};

export { BackendResponseError as ClientResponseError, quotedFilterValue };
