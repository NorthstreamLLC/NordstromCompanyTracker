import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs'; import path from 'node:path';

export const MIG = new URL('../migrations/', import.meta.url).pathname;

export async function freshDb() {
  const db = await PGlite.create({ extensions: { pgcrypto, citext, pg_trgm, btree_gist } });
  // Mirror the parts of Supabase's auth schema the migrations rely on,
  // including the grants Supabase applies out of the box.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(),
                             email text unique, created_at timestamptz default now());
    create or replace function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
    create role anon; create role authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select on auth.users to authenticated;
  `);
  for (const f of fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  return db;
}

export function makeCtx(db) {
  return {
    async asAdmin(sql, params = []) {
      await db.exec('reset role');
      return db.query(sql, params);
    },
    async as(uid, sql, params = []) {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [String(uid)]);
      await db.exec('set role authenticated');
      try { return await db.query(sql, params); }
      finally { await db.exec('reset role'); }
    },
  };
}

export function reporter() {
  let pass = 0, fail = 0;
  return {
    check(name, cond, detail = '') {
      if (cond) { pass++; console.log(`  ✓ ${name}`); }
      else { fail++; console.log(`  ✗ ${name} ${detail}`); }
    },
    async denied(name, fn) {
      try { await fn(); this.check(name, false, '(was ALLOWED)'); }
      catch { this.check(name, true); }
    },
    done() { console.log(`\n  ${pass} passed, ${fail} failed`); return fail; },
  };
}
