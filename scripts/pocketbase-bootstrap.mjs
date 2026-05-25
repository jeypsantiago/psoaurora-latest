#!/usr/bin/env node

import PocketBase from 'pocketbase';

const fail = (message) => {
  console.error(`[pocketbase:bootstrap] ${message}`);
  process.exit(1);
};

const pocketbaseUrl = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || '';
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD || '';

if (!superuserEmail || !superuserPassword) {
  fail('Missing POCKETBASE_SUPERUSER_EMAIL or POCKETBASE_SUPERUSER_PASSWORD.');
}

const pb = new PocketBase(pocketbaseUrl);
const authCollectionName = 'users';

const elevatedRule = `@request.auth.collectionName = '_superusers' || (@request.auth.id != '' && @request.auth.collectionName = '${authCollectionName}' && @request.auth.isSuperAdmin = true)`;
const selfOrSuperAdminRule = `@request.auth.collectionName = '_superusers' || @request.auth.id = id || (@request.auth.collectionName = '${authCollectionName}' && @request.auth.isSuperAdmin = true)`;
const publicAppStateRule = `${elevatedRule} || @request.auth.id != '' || (scope = 'global' && (key = 'aurora_landing_config' || key = 'aurora_census_survey_masters' || key = 'aurora_census_survey_cycles'))`;

const collectionDefinitions = [
  {
    name: authCollectionName,
    type: 'auth',
    listRule: elevatedRule,
    viewRule: selfOrSuperAdminRule,
    createRule: elevatedRule,
    updateRule: selfOrSuperAdminRule,
    deleteRule: elevatedRule,
    manageRule: selfOrSuperAdminRule,
    fields: [
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'roles', type: 'json', required: false },
      { name: 'isSuperAdmin', type: 'bool', required: false },
      { name: 'gender', type: 'text', required: false, max: 40 },
      { name: 'position', type: 'text', required: false, max: 160 },
      { name: 'prefsBundle', type: 'json', required: false },
      { name: 'lastAccess', type: 'text', required: false, max: 120 },
      { name: 'avatar', type: 'file', required: false, maxSelect: 1, maxSize: 15728640, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] },
      { name: 'signature', type: 'file', required: false, maxSelect: 1, maxSize: 15728640, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] },
      { name: 'mustResetPassword', type: 'bool', required: false },
    ],
    indexes: [
      `CREATE INDEX idx_${authCollectionName}_name ON ${authCollectionName} (name)`,
    ],
    passwordAuth: {
      enabled: true,
      identityFields: ['email'],
    },
  },
  {
    name: 'app_state',
    type: 'base',
    listRule: publicAppStateRule,
    viewRule: publicAppStateRule,
    createRule: "@request.auth.collectionName = '_superusers' || @request.auth.id != ''",
    updateRule: "@request.auth.collectionName = '_superusers' || @request.auth.id != ''",
    deleteRule: "@request.auth.collectionName = '_superusers' || @request.auth.id != ''",
    fields: [
      { name: 'key', type: 'text', required: true, max: 160 },
      { name: 'scope', type: 'select', required: true, maxSelect: 1, values: ['global', 'user'] },
      { name: 'ownerId', type: 'text', required: false, max: 80 },
      { name: 'value', type: 'json', required: false },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_app_state_scope_owner_key ON app_state (scope, ownerId, key)',
      'CREATE INDEX idx_app_state_scope_key ON app_state (scope, key)',
      'CREATE INDEX idx_app_state_key ON app_state (key)',
    ],
  },
  {
    name: 'landing_assets',
    type: 'base',
    listRule: 'id != ""',
    viewRule: 'id != ""',
    createRule: elevatedRule,
    updateRule: elevatedRule,
    deleteRule: elevatedRule,
    fields: [
      { name: 'label', type: 'text', required: false, max: 180 },
      { name: 'kind', type: 'text', required: false, max: 80 },
      { name: 'ownerId', type: 'text', required: false, max: 80 },
      { name: 'slotId', type: 'text', required: false, max: 120 },
      { name: 'legacySourceUrl', type: 'text', required: false, max: 500 },
      { name: 'file', type: 'file', required: true, maxSelect: 1, maxSize: 20971520, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] },
    ],
    indexes: [
      'CREATE INDEX idx_landing_assets_owner_slot ON landing_assets (ownerId, slotId)',
    ],
  },
];

const upsertCollection = async (definition) => {
  try {
    const existing = await pb.collections.getOne(definition.name);
    const updated = await pb.collections.update(existing.id, definition);
    console.log(`[pocketbase:bootstrap] updated ${updated.name}`);
    return updated;
  } catch (error) {
    if (Number(error?.status || error?.response?.status || 0) !== 404) {
      throw error;
    }

    const created = await pb.collections.create(definition);
    console.log(`[pocketbase:bootstrap] created ${created.name}`);
    return created;
  }
};

const renameLegacyAuthCollectionIfNeeded = async () => {
  try {
    const existingUsers = await pb.collections.getOne(authCollectionName);
    return existingUsers;
  } catch (error) {
    if (Number(error?.status || error?.response?.status || 0) !== 404) {
      throw error;
    }
  }

  try {
    const legacy = await pb.collections.getOne('staff_users');
    const renamed = await pb.collections.update(legacy.id, {
      ...legacy,
      name: authCollectionName,
    });
    console.log(`[pocketbase:bootstrap] renamed staff_users to ${authCollectionName}`);
    return renamed;
  } catch (error) {
    if (Number(error?.status || error?.response?.status || 0) === 404) {
      return null;
    }
    throw error;
  }
};

await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
await renameLegacyAuthCollectionIfNeeded();

for (const definition of collectionDefinitions) {
  await upsertCollection(definition);
}

console.log('[pocketbase:bootstrap] PocketBase collections are ready.');
