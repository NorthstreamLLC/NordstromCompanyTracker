#!/usr/bin/env node
// Applies migrations in order against DATABASE_URL, tracking what has run in
// schema_migrations. Safe to re-run: applied files are skipped.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }

const dir = new URL('../migrations/', import.meta.url).pathname;
const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);

const applied = new Map(
  (await client.query('select filename, checksum from schema_migrations')).rows.map(r => [r.filename, r.checksum])
);

const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
let ran = 0;

for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  const sum = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);

  if (applied.has(f)) {
    // A changed migration that has already run means the database and the repo
    // have diverged. Fail loudly rather than silently skipping.
    if (applied.get(f) !== sum) {
      console.error(`\n  ${f} has changed since it was applied.`);
      console.error(`  Write a new migration instead of editing an applied one.`);
      process.exit(1);
    }
    continue;
  }

  process.stdout.write(`  applying ${f} ... `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations(filename, checksum) values ($1,$2)', [f, sum]);
    await client.query('commit');
    console.log('ok');
    ran++;
  } catch (e) {
    await client.query('rollback');
    console.log('FAILED');
    console.error(`\n  ${e.message}\n`);
    process.exit(1);
  }
}

console.log(ran ? `\n  ${ran} migration(s) applied.` : '\n  Already up to date.');
await client.end();
