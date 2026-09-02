#!/usr/bin/env node
/**
 * Backup — the database and the private files, together.
 *
 * The two halves are worthless apart: a database row points at a stored file by
 * its key, and a file without its row is an orphan nobody can reach. So one run
 * writes one snapshot directory holding both, plus a manifest that records what
 * was taken, when, and the digest of every file.
 *
 * Transport: `pg_dump` on PATH when there is one, otherwise the same binary
 * inside the local Docker container. Nothing here talks to a live deployment.
 *
 *   node tools/backup.mjs --out backups
 *   node tools/backup.mjs --out backups --database-url postgres://... --storage private-storage
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Command-line arguments, read only when this file is the entry point. */
function readArgs() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    if (!key?.startsWith('--')) continue;
    args.set(key.slice(2), process.argv[i + 1] ?? '');
  }
  return args;
}

/**
 * The same database, addressed from inside the container.
 *
 * The local compose file publishes Postgres on 5433, but inside the container
 * it still listens on its own 5432, so a URL that works from the host has to be
 * rewritten before it is handed to a client running in there.
 */
export function containerUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hostname = '127.0.0.1';
    parsed.port = '5432';
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Runs pg_dump wherever it actually exists, and says which one it used. */
export function dumpDatabase(url, target, containerName) {
  const direct = spawnSync('pg_dump', ['--no-owner', '--no-privileges', '--file', target, url], {
    encoding: 'utf8',
  });
  if (direct.status === 0) return { transport: 'pg_dump' };

  // The local compose database keeps its client inside the container.
  const viaDocker = spawnSync(
    'docker',
    ['exec', containerName, 'pg_dump', '--no-owner', '--no-privileges', containerUrl(url)],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (viaDocker.status !== 0) {
    throw new Error(
      'pg_dump failed both directly and through docker: ' +
        (direct.error?.message ?? direct.stderr ?? '') +
        ' | ' +
        (viaDocker.error?.message ?? viaDocker.stderr ?? ''),
    );
  }
  return { transport: 'docker exec ' + containerName + ' pg_dump', sql: viaDocker.stdout };
}

async function copyPrivateFiles(from, to) {
  const files = [];
  async function walk(dir, relative) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const key = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, key);
        continue;
      }
      const bytes = await fs.readFile(absolute);
      const target = path.join(to, key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
      files.push({ key, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  await walk(from, '');
  return files;
}

export async function runBackup({ url, storage, out, containerName }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = path.join(out, stamp);
  await fs.mkdir(path.join(snapshot, 'files'), { recursive: true });

  const sqlPath = path.join(snapshot, 'database.sql');
  const result = dumpDatabase(url, sqlPath, containerName);
  if (result.sql !== undefined) await fs.writeFile(sqlPath, result.sql, 'utf8');
  const sql = await fs.readFile(sqlPath);

  const files = await copyPrivateFiles(storage, path.join(snapshot, 'files'));
  const manifest = {
    takenAt: new Date().toISOString(),
    transport: result.transport,
    database: {
      sha256: createHash('sha256').update(sql).digest('hex'),
      bytes: sql.length,
    },
    privateFiles: { count: files.length, files },
    note:
      'Restore both halves together. A database without its private files, or files without their rows, is not a usable restore.',
  };
  await fs.writeFile(path.join(snapshot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { snapshot, manifest };
}

if (import.meta.url === 'file://' + process.argv[1]?.replace(/\\/g, '/')) {
  const { snapshot, manifest } = await runBackup({
    url: databaseUrl,
    storage: storageDir,
    out: outRoot,
    containerName: container,
  });
  console.log('Backup written to ' + snapshot);
  console.log('  database dump: ' + manifest.database.bytes + ' bytes via ' + manifest.transport);
  console.log('  private files: ' + manifest.privateFiles.count);
}
