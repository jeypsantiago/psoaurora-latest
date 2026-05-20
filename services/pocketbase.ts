import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { readStorageString } from './storage';

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');
const isLocalhostUrl = (value: string) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
const isLocalhostHost = (host: string) => /^(localhost|127\.0\.0\.1)$/i.test(host);

const defaultUrl = 'http://127.0.0.1:8090';
const runtimeConfiguredUrl = typeof window !== 'undefined'
  ? window.__AURORA_RUNTIME_CONFIG__?.VITE_POCKETBASE_URL || window.__AURORA_RUNTIME_CONFIG__?.POCKETBASE_URL || ''
  : '';
const configuredUrl = runtimeConfiguredUrl || import.meta.env.VITE_POCKETBASE_URL || defaultUrl;
const localOverrideUrl = typeof window !== 'undefined'
  ? readStorageString(STORAGE_KEYS.backendUrlOverride).trim()
  : '';
const allowBackendOverride = typeof window !== 'undefined' && isLocalhostHost(window.location.hostname);
const preferredConfiguredUrl = allowBackendOverride && localOverrideUrl ? localOverrideUrl : configuredUrl;
const shouldUseFallbackDomain = typeof window !== 'undefined'
  && !isLocalhostHost(window.location.hostname)
  && isLocalhostUrl(preferredConfiguredUrl);

export const POCKETBASE_URL = normalizeUrl(shouldUseFallbackDomain ? defaultUrl : preferredConfiguredUrl);

export const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);
export const AUTH_COLLECTION = 'users';

let currentToken = pb.authStore.token || '';
let currentModel: RecordModel | null = (pb.authStore.model as RecordModel | null) ?? null;
let authResolved = false;
let initialAuthPromise: Promise<RecordModel | null> | null = null;
const authListeners = new Set<(token: string, record: RecordModel | null) => void>();

const notifyAuthListeners = () => {
  for (const listener of authListeners) {
    listener(currentToken, currentModel);
  }
};

const setCurrentAuth = (token: string, record: RecordModel | null) => {
  currentToken = token;
  currentModel = record;
  authResolved = true;
  notifyAuthListeners();
};

const refreshInitialAuth = async () => {
  const startedToken = pb.authStore.token || '';

  if (!pb.authStore.isValid) {
    setCurrentAuth('', null);
    return null;
  }

  try {
    const authData = await pb.collection(AUTH_COLLECTION).authRefresh();
    if ((pb.authStore.token || '') !== (authData.token || startedToken)) {
      return currentModel;
    }
    setCurrentAuth(authData.token, (authData.record as RecordModel | null) ?? null);
    return authData.record ?? null;
  } catch (error) {
    if ((pb.authStore.token || '') !== startedToken) {
      return currentModel;
    }
    console.error('Failed to refresh initial PocketBase auth state.', error);
    pb.authStore.clear();
    setCurrentAuth('', null);
    return null;
  }
};

pb.authStore.onChange((token, model) => {
  setCurrentAuth(token || '', (model as RecordModel | null) ?? null);
}, false);

export const waitForInitialAuth = async () => {
  initialAuthPromise ??= refreshInitialAuth();
  await initialAuthPromise;
};

export const getAuthToken = async () => {
  await waitForInitialAuth();
  return currentToken || '';
};

export const getCurrentUserId = () => String(currentModel?.id || '').trim() || null;

export const getCurrentAuthRecord = () => currentModel;

export const hasActiveSession = () => !!currentToken && !!currentModel;

export const isAuthResolved = () => authResolved;

export const subscribeToAuth = (listener: (token: string, record: RecordModel | null) => void) => {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
};
