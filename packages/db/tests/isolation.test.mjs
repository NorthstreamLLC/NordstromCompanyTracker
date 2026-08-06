import { freshDb, makeCtx, reporter } from './harness.mjs';

const db = await freshDb();
const { as, asAdmin } = makeCtx(db);
const R = reporter();

const mkUser = async (email, name) => {
  const id = (await asAdmin(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
  await asAdmin(`insert into user_profiles(id,full_name,country) values ($1,$2,'US')`, [id, name]);
  return id;
};

const alice = await mkUser('alice@example.com', 'Alice');
const bob   = await mkUser('bob@example.com', 'Bob');

const wsA = (await as(alice, `select id from create_workspace('Alice Household','household')`)).rows[0].id;
const wsB = (await as(bob, `select id from create_workspace('Bob Business','business')`)).rows[0].id;

const acctA = (await as(alice, `insert into accounts(workspace_id,name,type,class,currency,created_by)
  values ($1,'Alice Checking','checking','asset','USD',$2) returning id`, [wsA, alice])).rows[0].id;
await as(alice, `insert into transactions(workspace_id,account_id,posted_on,merchant_name,amount,currency,created_by)
  values ($1,$2,'2026-08-01','Secret Vendor',-125.50,'USD',$3)`, [wsA, acctA, alice]);

console.log('\nWORKSPACE ISOLATION');
R.check('Alice reads her own transaction',
  (await as(alice, `select count(*)::int n from transactions`)).rows[0].n === 1);
R.check('Alice was auto-enrolled as owner',
  (await as(alice, `select role from workspace_members where workspace_id=$1`, [wsA])).rows[0].role === 'owner');

const bobTxn = (await as(bob, `select count(*)::int n from transactions`)).rows[0].n;
R.check('Bob CANNOT read Alice transactions', bobTxn === 0, `(saw ${bobTxn})`);
const bobAcct = (await as(bob, `select count(*)::int n from accounts`)).rows[0].n;
R.check('Bob CANNOT read Alice accounts', bobAcct === 0, `(saw ${bobAcct})`);
const bobWs = (await as(bob, `select count(*)::int n from workspaces`)).rows[0].n;
R.check('Bob sees only his own workspace', bobWs === 1, `(saw ${bobWs})`);

await R.denied('Bob CANNOT insert into Alice workspace with a known UUID', () =>
  as(bob, `insert into transactions(workspace_id,account_id,posted_on,amount,currency,created_by)
    values ($1,$2,'2026-08-02',-10,'USD',$3)`, [wsA, acctA, bob]));

console.log('\nROLE ENFORCEMENT');
await asAdmin(`insert into workspace_members(workspace_id,user_id,role) values ($1,$2,'viewer')`, [wsA, bob]);
R.check('Viewer Bob can now READ Alice transactions',
  (await as(bob, `select count(*)::int n from transactions`)).rows[0].n === 1);
await R.denied('Viewer CANNOT write', () =>
  as(bob, `insert into transactions(workspace_id,account_id,posted_on,amount,currency,created_by)
    values ($1,$2,'2026-08-03',-20,'USD',$3)`, [wsA, acctA, bob]));

await asAdmin(`update workspace_members set role='contributor' where workspace_id=$1 and user_id=$2`, [wsA, bob]);
const own = (await as(bob, `insert into transactions(workspace_id,account_id,posted_on,merchant_name,amount,currency,created_by)
  values ($1,$2,'2026-08-04','Bob Entry',-30,'USD',$3) returning id`, [wsA, acctA, bob])).rows[0].id;
R.check('Contributor CAN add a transaction', !!own);
R.check('Contributor CAN edit their own entry',
  (await as(bob, `update transactions set notes='mine' where id=$1 returning id`, [own])).rows.length === 1);
const aliceTxn = (await asAdmin(`select id from transactions where created_by=$1 limit 1`, [alice])).rows[0].id;
R.check('Contributor CANNOT edit someone else\'s entry',
  (await as(bob, `update transactions set notes='hacked' where id=$1 returning id`, [aliceTxn])).rows.length === 0);

console.log('\nPRIVILEGE ESCALATION');
await asAdmin(`update workspace_members set role='admin' where workspace_id=$1 and user_id=$2`, [wsA, bob]);
await R.denied('Admin CANNOT self-promote to owner', () =>
  as(bob, `update workspace_members set role='owner' where workspace_id=$1 and user_id=$2`, [wsA, bob]));
await R.denied('User CANNOT self-grant platform admin', () =>
  as(bob, `update user_profiles set is_platform_admin=true where id=$1`, [bob]));
await R.denied('Encrypted bank tokens NOT selectable by any client role', () =>
  as(alice, `select access_token_encrypted from financial_connections`));
R.check('Safe connection view IS readable',
  Array.isArray((await as(alice, `select * from financial_connections_safe`)).rows));

console.log('\nDATA INTEGRITY');
await R.denied('Unbalanced split is REJECTED', async () => {
  await db.exec('begin');
  try {
    await as(alice, `insert into transaction_splits(workspace_id,transaction_id,amount) values ($1,$2,-50)`, [wsA, aliceTxn]);
    await db.exec('commit');
  } catch (e) { await db.exec('rollback'); throw e; }
});
await R.denied('Last owner CANNOT be removed', () =>
  asAdmin(`delete from workspace_members where workspace_id=$1 and role='owner'`, [wsA]));
await R.denied('Zero-amount transaction is REJECTED', () =>
  as(alice, `insert into transactions(workspace_id,account_id,posted_on,amount,currency,created_by)
    values ($1,$2,'2026-08-05',0,'USD',$3)`, [wsA, acctA, alice]));
await R.denied('Duplicate dedupe_hash on same account is REJECTED', async () => {
  await as(alice, `insert into transactions(workspace_id,account_id,posted_on,amount,currency,dedupe_hash,created_by)
    values ($1,$2,'2026-08-06',-11,'USD','dup1',$3)`, [wsA, acctA, alice]);
  await as(alice, `insert into transactions(workspace_id,account_id,posted_on,amount,currency,dedupe_hash,created_by)
    values ($1,$2,'2026-08-06',-11,'USD','dup1',$3)`, [wsA, acctA, alice]);
});
R.check('direction is derived from amount sign',
  (await asAdmin(`select direction from transactions where amount < 0 limit 1`)).rows[0].direction === 'outflow');

console.log('\nACCOUNT SCOPING');
const acctA2 = (await asAdmin(`insert into accounts(workspace_id,name,type,class,currency,created_by)
  values ($1,'Alice Savings','savings','asset','USD',$2) returning id`, [wsA, alice])).rows[0].id;
await asAdmin(`update workspace_members set account_scope=array[$1::uuid] where workspace_id=$2 and user_id=$3`, [acctA2, wsA, bob]);
const scoped = (await as(bob, `select count(*)::int n from accounts`)).rows[0].n;
R.check('Scoped member sees ONLY their scoped account', scoped === 1, `(saw ${scoped})`);
const scopedTxn = (await as(bob, `select count(*)::int n from transactions`)).rows[0].n;
R.check('Scoped member sees no transactions from out-of-scope accounts', scopedTxn === 0, `(saw ${scopedTxn})`);

process.exit(R.done() ? 1 : 0);
