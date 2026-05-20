import { getStorageItem, removeStorageItem, setStorageItem } from './storage';

type CachedLoginPayload = {
  token: string;
  record: Record<string, unknown>;
  cachedAt: number;
};

const CACHE_PREFIX = 'aurora_fast_login_cache';
const CACHE_VERSION = 1;
const KEY_ITERATIONS = 120_000;
const EXPIRY_SKEW_MS = 60_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const hasWebCrypto = () =>
  typeof window !== 'undefined'
  && !!window.crypto?.subtle
  && typeof window.crypto.getRandomValues === 'function';

const normalizeIdentity = (identity: string) => identity.trim().toLowerCase();

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const base64UrlToBytes = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return base64ToBytes(padded);
};

const digestToBase64Url = async (value: string) => {
  const digest = await window.crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return bytesToBase64(new Uint8Array(digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const storageKeyForIdentity = async (identity: string) =>
  `${CACHE_PREFIX}:${await digestToBase64Url(normalizeIdentity(identity))}`;

const deriveKey = async (identity: string, secret: string, salt: Uint8Array) => {
  const material = await window.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(`${normalizeIdentity(identity)}\n${secret}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: KEY_ITERATIONS,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

const tokenExpiryMs = (token: string) => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return 0;
    const decoded = JSON.parse(textDecoder.decode(base64UrlToBytes(payload)));
    const exp = Number(decoded?.exp || 0);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const hasUsableTokenWindow = (token: string) => {
  const expiresAt = tokenExpiryMs(token);
  return expiresAt > Date.now() + EXPIRY_SKEW_MS;
};

export const readFastLoginSession = async (
  identity: string,
  secret: string,
): Promise<CachedLoginPayload | null> => {
  if (!hasWebCrypto()) return null;

  try {
    const key = await storageKeyForIdentity(identity);
    const cached = getStorageItem(key);
    if (!cached) return null;

    const envelope = JSON.parse(cached) as {
      version?: number;
      salt?: string;
      iv?: string;
      data?: string;
    };

    if (envelope.version !== CACHE_VERSION || !envelope.salt || !envelope.iv || !envelope.data) {
      removeStorageItem(key);
      return null;
    }

    const cryptoKey = await deriveKey(identity, secret, base64ToBytes(envelope.salt));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
      cryptoKey,
      base64ToBytes(envelope.data),
    );
    const payload = JSON.parse(textDecoder.decode(decrypted)) as CachedLoginPayload;

    if (!payload.token || !payload.record || !hasUsableTokenWindow(payload.token)) {
      removeStorageItem(key);
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

export const writeFastLoginSession = async (
  identity: string,
  secret: string,
  payload: CachedLoginPayload,
) => {
  if (!hasWebCrypto() || !payload.token || !hasUsableTokenWindow(payload.token)) return;

  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const cryptoKey = await deriveKey(identity, secret, salt);
    const data = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      textEncoder.encode(JSON.stringify({
        token: payload.token,
        record: payload.record,
        cachedAt: payload.cachedAt,
      })),
    );

    setStorageItem(await storageKeyForIdentity(identity), JSON.stringify({
      version: CACHE_VERSION,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(data)),
    }));
  } catch {
    // Cache failures should never block sign-in.
  }
};

export const clearFastLoginSession = async (identity: string) => {
  if (!hasWebCrypto()) return;

  try {
    removeStorageItem(await storageKeyForIdentity(identity));
  } catch {
    // Best-effort cleanup only.
  }
};
