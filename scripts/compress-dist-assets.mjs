#!/usr/bin/env node

import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.xml',
]);

const minBytes = 1024;

const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return entryPath;
  }));
  return files.flat();
};

const shouldCompress = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!compressibleExtensions.has(ext)) return false;
  if (filePath.endsWith('.br') || filePath.endsWith('.gz')) return false;
  const stat = await fs.stat(filePath);
  return stat.size >= minBytes;
};

const compressFile = async (filePath) => {
  const input = await fs.readFile(filePath);
  const [br, gz] = await Promise.all([
    brotliCompressAsync(input, {
      params: {
        // 11 maximizes static asset compression; this runs at build time only.
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
    gzipAsync(input, { level: 9 }),
  ]);

  await Promise.all([
    fs.writeFile(`${filePath}.br`, br),
    fs.writeFile(`${filePath}.gz`, gz),
  ]);
};

try {
  const files = await walk(distDir);
  const targets = [];
  for (const filePath of files) {
    if (await shouldCompress(filePath)) {
      targets.push(filePath);
    }
  }

  await Promise.all(targets.map(compressFile));
  console.log(`[compress-dist-assets] compressed ${targets.length} assets`);
} catch (error) {
  console.error('[compress-dist-assets] failed', error);
  process.exit(1);
}
