import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Permission } from './types';
import { backend } from './services/backend';
import { STORAGE_KEYS } from './constants/storageKeys';
import { dataImageUrlToFile, isDataImageUrl, prepareUpload, type MediaUploadProgress, warmMediaUploadPipeline } from './services/mediaAssets';
import { readStorageJsonSafe, writeStorageJson } from './services/storage';
import { dispatchThemeSync } from './theme-context';
import {
  clearUserScopedManagedState,
  hydrateManagedStateToLocalStorage,
  installLocalStateBridge,
} from './services/localStateBridge';
import {
  clearFastLoginSession,
  readFastLoginSession,
  writeFastLoginSession,
} from './services/fastLoginCache';
import { normalizeRoleBadgeColor } from './utils/roleBadges';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  badgeColor: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  prefsBundle?: Record<string, unknown>;
  gender: string;
  position: string;
  password?: string;
  lastAccess: string;
  avatar?: string;
  avatarSrcSet?: string;
  signature?: string;
  avatarFileId?: string;
  signatureFileId?: string;
  avatarPath?: string;
  signaturePath?: string;
  mustResetPassword?: boolean;
  isSuperAdmin?: boolean;
}

export interface UserMediaInput {
  avatarFile?: File | null;
  signatureFile?: File | null;
}

interface UserContextType {
  users: User[];
  roles: Role[];
  currentUser: User | null;
  isReady: boolean;
  addUser: (user: Omit<User, 'id' | 'lastAccess'> & UserMediaInput) => Promise<void>;
  updateUser: (
    id: string,
    user: Partial<User> & UserMediaInput,
    options?: {
      onAvatarUploadProgress?: (progress: MediaUploadProgress) => void;
      onSignatureUploadProgress?: (progress: MediaUploadProgress) => void;
    },
  ) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  addRole: (role: Omit<Role, 'id'>) => Promise<void>;
  updateRole: (id: string, role: Partial<Role>) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    position: string;
    gender: string;
    password: string;
  }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
}

const AVATAR_FIELD_NAME = 'avatarFile';
const SIGNATURE_FIELD_NAME = 'signatureFile';

const DEFAULT_ROLES: Role[] = [
  {
    id: '1',
    name: 'Super Admin',
    description: 'Full system access with the ability to manage all users, roles, and global configurations.',
    permissions: ['all'],
    badgeColor: 'blue',
  },
  {
    id: '2',
    name: 'Registry Editor',
    description: 'Responsible for creating and maintaining civil registry records (Birth, Marriage, Death certificates).',
    permissions: ['dashboard.view', 'records.view', 'records.edit', 'records.export'],
    badgeColor: 'emerald',
  },
  {
    id: '3',
    name: 'Inventory Lead',
    description: 'Manages office supplies, stock levels, and processes acquisition/issue requests.',
    permissions: ['dashboard.view', 'supply.view', 'supply.request', 'supply.approve', 'supply.inventory', 'supply.export'],
    badgeColor: 'amber',
  },
  {
    id: '4',
    name: 'Viewer',
    description: 'Read-only access to records and dashboards for general inquiry purposes.',
    permissions: ['dashboard.view', 'records.view', 'supply.view', 'census.view'],
    badgeColor: 'slate',
  },
  {
    id: '5',
    name: 'Report Contributor',
    description: 'Self-service access to create and maintain owned report monitoring projects and schedules.',
    permissions: ['dashboard.view', 'reports.view', 'reports.view_all', 'reports.edit'],
    badgeColor: 'violet',
  },
];

const ensureDefaultRoles = (roles: Role[]): Role[] => {
  const updatedRoles = roles.map((role, index) => {
    const defaultRole = DEFAULT_ROLES.find((r) => r.name === role.name);
    const badgeColor = normalizeRoleBadgeColor(
      role.badgeColor,
      role.name,
      index,
    );
    if (defaultRole) {
      const nextPermissions = Array.from(new Set([...role.permissions, ...defaultRole.permissions]));
      if (nextPermissions.length !== role.permissions.length || badgeColor !== role.badgeColor) {
        return { ...role, permissions: nextPermissions, badgeColor };
      }
    }
    if (badgeColor !== role.badgeColor) {
      return { ...role, badgeColor };
    }
    return role;
  });

  const existingNames = new Set(updatedRoles.map((role) => role.name));
  const missingRoles = DEFAULT_ROLES.filter((role) => !existingNames.has(role.name));
  return missingRoles.length > 0 ? [...updatedRoles, ...missingRoles] : updatedRoles;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

const runWhenIdle = (callback: () => void, timeout = 2000): (() => void) => {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  const browserWindow = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof browserWindow.requestIdleCallback === 'function') {
    const idleId = browserWindow.requestIdleCallback(callback, { timeout });
    return () => browserWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, Math.min(timeout, 1000));
  return () => window.clearTimeout(timeoutId);
};

const extractSingleFileName = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

const toRecordFileUrl = (
  record: any,
  fieldName: string,
  options?: Record<string, string>,
): string => {
  const filename = extractSingleFileName(record?.[fieldName]);
  if (!filename) return '';

  try {
    return backend.files.getURL(record, filename, options);
  } catch {
    return '';
  }
};

const toAvatarSrcSet = (record: any): string => {
  const oneX = toRecordFileUrl(record, 'avatar', { thumb: '80x80' });
  const twoX = toRecordFileUrl(record, 'avatar', { thumb: '160x160' });
  if (oneX && twoX) return `${oneX} 1x, ${twoX} 2x`;
  return '';
};

const normalizeRoles = (value: unknown): string[] => {
  const normalizeLabel = (role: string) => {
    const token = role.trim().toLowerCase();
    if (token === 'superadmin' || token === 'super_admin') {
      return 'Super Admin';
    }
    return role.trim();
  };

  if (Array.isArray(value)) {
    return value.map((role) => normalizeLabel(String(role))).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((role) => normalizeLabel(String(role))).filter(Boolean);
      }
    } catch {
      return [normalizeLabel(trimmed)];
    }

    return [normalizeLabel(trimmed)];
  }

  return [];
};

const fromAuthRecord = (record: any): User => {
  const avatarUrl = (typeof record.avatar === 'string' ? record.avatar : '') || toRecordFileUrl(record, 'avatar');
  const avatarSrcSet = (typeof record.avatarSrcSet === 'string' ? record.avatarSrcSet : '') || toAvatarSrcSet(record);
  const signatureUrl = (typeof record.signature === 'string' ? record.signature : '') || toRecordFileUrl(record, 'signature');
  const prefsBundle = record?.prefsBundle && typeof record.prefsBundle === 'object' && !Array.isArray(record.prefsBundle)
    ? record.prefsBundle
    : {};

  return {
    id: String(record.id),
    name: record.name || record.email || 'Unnamed User',
    email: record.email || '',
    roles: normalizeRoles(record.roles),
    prefsBundle,
    gender: record.gender || 'Prefer not to say',
    position: record.position || '',
    lastAccess: record.lastAccess || 'Never',
    avatar: avatarUrl,
    avatarSrcSet,
    signature: signatureUrl,
    avatarFileId: typeof record.avatarFileId === 'string' ? record.avatarFileId : '',
    signatureFileId: typeof record.signatureFileId === 'string' ? record.signatureFileId : '',
    avatarPath: typeof record.avatarPath === 'string' ? record.avatarPath : '',
    signaturePath: typeof record.signaturePath === 'string' ? record.signaturePath : '',
    mustResetPassword: !!record.mustResetPassword,
    isSuperAdmin: !!record.isSuperAdmin,
  };
};

const parseStoredRoles = (): Role[] | null => {
  const parsed = readStorageJsonSafe<unknown>(STORAGE_KEYS.roles, null);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed as Role[];
  }

  return null;
};

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  const syncRolesFromStorage = useCallback(() => {
    const parsed = parseStoredRoles();
    if (parsed) {
      const merged = ensureDefaultRoles(parsed);
      setRoles(merged);
      if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
        writeStorageJson(STORAGE_KEYS.roles, merged);
      }
      return merged;
    }

    setRoles(DEFAULT_ROLES);
    writeStorageJson(STORAGE_KEYS.roles, DEFAULT_ROLES);
    return DEFAULT_ROLES;
  }, []);

  const refreshUsers = useCallback(async () => {
    if (!backend.authStore.isValid) {
      setUsers([]);
      return;
    }

    const records = await backend.collection('users').getFullList({ sort: 'name' });
    setUsers(records.map((record) => fromAuthRecord(record)));
  }, []);

  const syncCurrentUserFromAuthStore = useCallback(() => {
    const record = backend.authStore.record;
    if (!backend.authStore.isValid || !record) {
      setCurrentUser(null);
      return null;
    }

    const mapped = fromAuthRecord(record);
    setCurrentUser(mapped);
    setUsers((prev) => (
      prev.some((user) => user.id === mapped.id) ? prev : [mapped, ...prev]
    ));
    return mapped;
  }, []);

  const bootstrap = useCallback(async () => {
    await backend.authStore.resolve();

    installLocalStateBridge(() => {
      if (!backend.authStore.isValid || !backend.authStore.record) return null;
      return String(backend.authStore.record.id);
    });

    if (!backend.authStore.isValid || !backend.authStore.record) {
      clearUserScopedManagedState();
      dispatchThemeSync();
      setCurrentUser(null);
      setUsers([]);
      syncRolesFromStorage();
      setIsReady(true);
      return;
    }

    const ownerId = String(backend.authStore.record.id);
    dispatchThemeSync();
    syncRolesFromStorage();
    syncCurrentUserFromAuthStore();

    void (async () => {
      try {
        await hydrateManagedStateToLocalStorage(ownerId);
        dispatchThemeSync();
        syncRolesFromStorage();
        await refreshUsers();
      } catch (error) {
        console.error('Failed to hydrate background user workspace state.', error);
      } finally {
        setIsReady(true);
      }
    })();
  }, [refreshUsers, syncCurrentUserFromAuthStore, syncRolesFromStorage]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await bootstrap();
      } catch (error) {
        console.error('Failed to bootstrap user context from the backend session.', error);
        if (!active) return;
        clearUserScopedManagedState();
        dispatchThemeSync();
        setCurrentUser(null);
        setUsers([]);
        syncRolesFromStorage();
        setIsReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [bootstrap, syncRolesFromStorage]);

  useEffect(() => {
    const unsubscribe = backend.authStore.onChange(() => {
      syncCurrentUserFromAuthStore();
    }, true);

    return unsubscribe;
  }, [syncCurrentUserFromAuthStore]);

  useEffect(() => {
    if (!currentUser?.id) return;
    return runWhenIdle(() => {
      void warmMediaUploadPipeline();
      void prepareUpload('staff-avatar', { ownerUserId: currentUser.id });
      void prepareUpload('staff-signature', { ownerUserId: currentUser.id });
    }, 3500);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;

    let intervalId: number | null = null;

    const runWarmup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void warmMediaUploadPipeline();
    };

    const startInterval = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(runWarmup, 45_000);
    };

    const stopInterval = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopInterval();
        return;
      }

      runWarmup();
      startInterval();
    };

    const cancelInitialWarmup = runWhenIdle(runWarmup, 5000);
    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelInitialWarmup();
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser?.id]);

  const addUser = useCallback(async (userData: Omit<User, 'id' | 'lastAccess'> & UserMediaInput) => {
    const safePassword = userData.password?.trim();
    if (!safePassword || safePassword.length < 8) {
      throw new Error('New user password is required (minimum 8 characters).');
    }

    const payload: Record<string, unknown> = {
      email: userData.email.trim(),
      password: safePassword,
      passwordConfirm: safePassword,
      name: userData.name,
      roles: userData.roles.length > 0 ? userData.roles : ['Viewer'],
      prefsBundle: {},
      gender: userData.gender,
      position: userData.position,
      lastAccess: null,
    };

    if (userData.avatarFile instanceof File) {
      payload[AVATAR_FIELD_NAME] = userData.avatarFile;
    } else if (typeof userData.avatar === 'string' && isDataImageUrl(userData.avatar)) {
      const avatarFile = dataImageUrlToFile(userData.avatar, `avatar-${Date.now()}`);
      if (avatarFile) payload[AVATAR_FIELD_NAME] = avatarFile;
    }

    if (userData.signatureFile instanceof File) {
      payload[SIGNATURE_FIELD_NAME] = userData.signatureFile;
    } else if (typeof userData.signature === 'string' && isDataImageUrl(userData.signature)) {
      const signatureFile = dataImageUrlToFile(userData.signature, `signature-${Date.now()}`);
      if (signatureFile) payload[SIGNATURE_FIELD_NAME] = signatureFile;
    }

    const created = await backend.collection('users').create(payload);

    setUsers((prev) => [...prev, fromAuthRecord(created)]);
  }, []);

  const updateUser = useCallback(async (
    id: string,
    userData: Partial<User> & UserMediaInput,
    options?: {
      onAvatarUploadProgress?: (progress: MediaUploadProgress) => void;
      onSignatureUploadProgress?: (progress: MediaUploadProgress) => void;
    },
  ) => {
    const payload: Record<string, unknown> = {};

    if (typeof userData.name === 'string') payload.name = userData.name;
    if (typeof userData.email === 'string') payload.email = userData.email.trim();
    if (Array.isArray(userData.roles)) payload.roles = userData.roles;
    if (typeof userData.gender === 'string') payload.gender = userData.gender;
    if (typeof userData.position === 'string') payload.position = userData.position;
    if (typeof userData.lastAccess === 'string') payload.lastAccess = userData.lastAccess;
    if (userData.prefsBundle && typeof userData.prefsBundle === 'object' && !Array.isArray(userData.prefsBundle)) {
      payload.prefsBundle = userData.prefsBundle;
    }
    if (typeof userData.mustResetPassword === 'boolean') payload.mustResetPassword = userData.mustResetPassword;
    if (typeof userData.password === 'string' && userData.password.trim()) {
      payload.password = userData.password.trim();
      payload.passwordConfirm = userData.password.trim();
    }

    if (typeof userData.avatarFileId === 'string' && userData.avatarFileId.trim()) {
      payload.avatarFileId = userData.avatarFileId.trim();
      if (typeof userData.avatarPath === 'string') payload.avatarPath = userData.avatarPath;
      if (typeof userData.avatar === 'string') payload.avatar = userData.avatar;
    }

    if (typeof userData.signatureFileId === 'string' && userData.signatureFileId.trim()) {
      payload.signatureFileId = userData.signatureFileId.trim();
      if (typeof userData.signaturePath === 'string') payload.signaturePath = userData.signaturePath;
      if (typeof userData.signature === 'string') payload.signature = userData.signature;
    }

    if (userData.avatarFile === null) {
      payload[AVATAR_FIELD_NAME] = null;
    } else if (userData.avatarFile instanceof File) {
      payload[AVATAR_FIELD_NAME] = userData.avatarFile;
    }

    if (typeof userData.avatar === 'string') {
      const avatarValue = userData.avatar.trim();
      if (!avatarValue) {
        payload[AVATAR_FIELD_NAME] = null;
      } else if (isDataImageUrl(avatarValue)) {
        const avatarFile = dataImageUrlToFile(avatarValue, `avatar-${id}-${Date.now()}`);
        if (!avatarFile) {
          throw new Error('Unable to process avatar file.');
        }
        payload[AVATAR_FIELD_NAME] = avatarFile;
      }
    }

    if (userData.signatureFile === null) {
      payload[SIGNATURE_FIELD_NAME] = null;
    } else if (userData.signatureFile instanceof File) {
      payload[SIGNATURE_FIELD_NAME] = userData.signatureFile;
    }

    if (typeof userData.signature === 'string') {
      const signatureValue = userData.signature.trim();
      if (!signatureValue) {
        payload[SIGNATURE_FIELD_NAME] = null;
      } else if (isDataImageUrl(signatureValue)) {
        const signatureFile = dataImageUrlToFile(signatureValue, `signature-${id}-${Date.now()}`);
        if (!signatureFile) {
          throw new Error('Unable to process signature file.');
        }
        payload[SIGNATURE_FIELD_NAME] = signatureFile;
      }
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    const updated = await backend.collection('users').update(id, payload, options);

    if (backend.authStore.record?.id === id) {
      backend.authStore.save(backend.authStore.token, updated);
    }

    const mapped = fromAuthRecord(updated);

    setUsers((prev) => prev.map((user) => (user.id === id ? mapped : user)));
    setCurrentUser((prev) => (prev?.id === id ? mapped : prev));
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    if (currentUser?.id === id) {
      throw new Error('You cannot delete the currently authenticated account.');
    }

    await backend.collection('users').delete(id);

    setUsers((prev) => prev.filter((user) => user.id !== id));
  }, [currentUser?.id]);

  const addRole = useCallback(async (roleData: Omit<Role, 'id'>) => {
    const nextRole: Role = {
      ...roleData,
      badgeColor: normalizeRoleBadgeColor(roleData.badgeColor, roleData.name, roles.length),
      id: Date.now().toString(),
    };

    setRoles((prev) => {
      const next = [...prev, nextRole];
      writeStorageJson(STORAGE_KEYS.roles, next);
      return next;
    });
  }, [roles.length]);

  const updateRole = useCallback(async (id: string, roleData: Partial<Role>) => {
    setRoles((prev) => {
      const next = prev.map((role, index) => {
        if (role.id !== id) return role;

        const merged = { ...role, ...roleData };
        return {
          ...merged,
          badgeColor: normalizeRoleBadgeColor(
            merged.badgeColor,
            merged.name,
            index,
          ),
        };
      });
      writeStorageJson(STORAGE_KEYS.roles, next);
      return next;
    });
  }, []);

  const deleteRole = useCallback(async (id: string) => {
    setRoles((prev) => {
      const next = prev.filter((role) => role.id !== id);
      writeStorageJson(STORAGE_KEYS.roles, next);
      return next;
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const identity = email.trim();
    const secret = password.trim();

    if (!identity || !secret) {
      throw new Error('Email and password are required.');
    }

    setIsReady(false);
    try {
      const cachedSession = await readFastLoginSession(identity, secret);
      if (cachedSession) {
        backend.authStore.save(cachedSession.token, cachedSession.record);
        void backend.authStore.refresh().then((result) => {
          void writeFastLoginSession(identity, secret, {
            token: result.token,
            record: result.record || {},
            cachedAt: Date.now(),
          });
          syncCurrentUserFromAuthStore();
        }).catch((error) => {
          void clearFastLoginSession(identity);
          console.error('Cached login session could not be refreshed.', error);
        });
      } else {
        const result = await backend.collection('users').authWithPassword(identity, secret);
        void writeFastLoginSession(identity, secret, {
          token: result.token,
          record: result.record || {},
          cachedAt: Date.now(),
        });
      }

      if (!backend.authStore.record) {
        throw new Error('Authentication succeeded but no account record was returned.');
      }

      const ownerId = String(backend.authStore.record.id);

      void backend.collection('users').update(ownerId, {
        lastAccess: new Date().toISOString(),
      }).catch(() => {
        // Non-fatal for login flow
      });

      dispatchThemeSync();
      syncRolesFromStorage();
      syncCurrentUserFromAuthStore();

      await hydrateManagedStateToLocalStorage(ownerId);
      dispatchThemeSync();
      syncRolesFromStorage();
      await refreshUsers();
    } catch (e) {
      setIsReady(true);
      throw e;
    } finally {
      setIsReady(true);
    }
  }, [refreshUsers, syncCurrentUserFromAuthStore, syncRolesFromStorage]);

  const register = useCallback(async (input: {
    name: string;
    email: string;
    position: string;
    gender: string;
    password: string;
  }) => {
    setIsReady(false);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.token || !result?.record) {
        throw new Error(result?.message || 'Unable to create account.');
      }

      backend.authStore.save(String(result.token), result.record);
      const ownerId = String(result.record.id);

      dispatchThemeSync();
      syncRolesFromStorage();
      syncCurrentUserFromAuthStore();

      await hydrateManagedStateToLocalStorage(ownerId);
      dispatchThemeSync();
      syncRolesFromStorage();
      await refreshUsers();
    } catch (e) {
      setIsReady(true);
      throw e;
    } finally {
      setIsReady(true);
    }
  }, [refreshUsers, syncCurrentUserFromAuthStore, syncRolesFromStorage]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const identity = email.trim();
    if (!identity) {
      throw new Error('Email is required.');
    }

    throw new Error(`Email reset is disabled for this deployment. Ask a Super Admin to reset the password for ${identity}.`);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const nextPassword = password.trim();
    if (nextPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    if (currentUser?.id) {
      const refreshed = await backend.collection('users').update(currentUser.id, {
        password: nextPassword,
        mustResetPassword: false,
      });
      backend.authStore.save(backend.authStore.token, refreshed);
      void clearFastLoginSession(currentUser.email);
      syncCurrentUserFromAuthStore();
      await refreshUsers();
    }
  }, [currentUser?.email, currentUser?.id, refreshUsers, syncCurrentUserFromAuthStore]);

  const logout = useCallback(() => {
    backend.authStore.clear();
    clearUserScopedManagedState();
    dispatchThemeSync();
    setCurrentUser(null);
    setUsers([]);
  }, []);

  return (
    <UserContext.Provider
      value={{
        users,
        roles,
        currentUser,
        isReady,
        addUser,
        updateUser,
        deleteUser,
        addRole,
        updateRole,
        deleteRole,
        login,
        register,
        requestPasswordReset,
        updatePassword,
        logout,
        refreshUsers,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUsers = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUsers must be used within a UserProvider');

  const isSuperAdmin = Boolean(
    context.currentUser?.isSuperAdmin || 
    context.currentUser?.roles?.includes("Super Admin")
  );

  const filteredUsers = React.useMemo(() => {
    if (isSuperAdmin) return context.users;
    return context.users.filter(
      (u) => !u.isSuperAdmin && !u.roles?.includes("Super Admin")
    );
  }, [context.users, isSuperAdmin]);

  return React.useMemo(() => ({
    ...context,
    users: filteredUsers,
  }), [context, filteredUsers]);
};
