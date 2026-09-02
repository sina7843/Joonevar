#!/usr/bin/env node
/**
 * Restore — the database and the private files, together.
 *
 * It refuses to restore half a snapshot, because half a snapshot is a broken
 * system: a sample row whose document points at a file that is not there reads
 * as data loss with extra steps. The manifest's digests are verified before
 * anything is written back.
 *
 *   node tools/restore.mjs --from backups/2026-09-02T10-00-00-000Z --database-url postgres://...
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { containerUrl } from './backup.mjs';

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

/** Runs psql wherever it exists, feeding it the dump on stdin. */
export function restoreDatabase(url, sql, containerName) {
  const direct = spawnSync('psql', ['--quiet', '--set', 'ON_ERROR_STOP=1', url], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (direct.status === 0) return 'psql';

  const viaDocker = spawnSync(
    'docker',
    ['exec', '-i', containerName, 'psql', '--quiet', '--set', 'ON_ERROR_STOP=1', containerUrl(url)],
    { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (viaDocker.status !== 0) {
    throw new Error(
      'psql failed both directly and through docker: ' +
        (direct.error?.message ?? direct.stderr ?? '') +
        ' | ' +
        (viaDocker.error?.message ?? viaDocker.stderr ?? ''),
    );
  }
  return 'docker exec ' + containerName + ' psql';
}

export async function runRestore({ from, url, storage, containerName }) {
  const manifest = JSON.parse(await fs.readFile(path.join(from, 'manifest.json'), 'utf8'));
  const sql = await fs.readFile(path.join(from, 'database.sql'));

  // Verify before writing: a snapshot that does not match its own manifest is
  // not restored at all.
  const digest = createHash('sha256').update(sql).digest('hex');
  if (digest !== manifest.database.sha256) {
    throw new Error('the database dump does not match its manifest digest; refusing to restore');
  }
  for (const file of manifest.privateFiles.files) {
    const bytes = await fs.readFile(path.join(from, 'files', file.key));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error('private file ' + file.key + ' does not match its manifest digest');
    }
  }

  const transport = restoreDatabase(url, sql.toString('utf8'), containerName);

  await fs.mkdir(storage, { recursive: true });
  for (const file of manifest.privateFiles.files) {
    const bytes = await fs.readFile(path.join(from, 'files', file.key));
    const target = path.join(storage, file.key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { mode: 0o600 });
  }

  return { transport, files: manifest.privateFiles.count, takenAt: manifest.takenAt };
}

if (import.meta.url === 'file://' + process.argv[1]?.replace(/\\/g, '/')) {
  if (snapshot === '' || databaseUrl === '') {
    console.error('Usage: node tools/restore.mjs --from <snapshot dir> --database-url postgres://...');
    process.exit(1);
  }
  const result = await runRestore({
    from: snapshot,
    url: databaseUrl,
    storage: storageDir,
    containerName: container,
  });
  console.log('Restored the snapshot of ' + result.takenAt + ' via ' + result.transport);
  console.log('  private files restored: ' + result.files);
  console.log('Run `npm run db:migrate` afterwards if the code is newer than the snapshot.');
}
