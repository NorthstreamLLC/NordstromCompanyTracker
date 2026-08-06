import { freshDb, makeCtx, reporter } from './harness.mjs';

/**
 * Ledger invariants.
 *
 * These assert the properties that make double-entry worth having. If any of
 * them fail, the books are not trustworthy and no amount of UI polish fixes it.
 */

const db = await freshDb();
const { as, asAdmin } = makeCtx(db);
const R = reporter();

const owner = (await asAdmin(`insert into auth.users(email) values ('owner@example.com') returning id`)).rows[0].id;
await asAdmin(`insert into user_profiles(id,full_name,country) values ($1,'Owner','US')`, [owner]);
const ws = (await as(owner, `select id from create_workspace('Nordstrom Company','business')`)).rows[0].id;

const acct = async (code) =>
  (await asAdmin(`select id from chart_of_accounts where workspace_id=$1 and code=$2`, [ws, code])).rows[0].id;

const CASH = await acct('1010');
const REVENUE = await acct('4100');
const RENT = await acct('6500');
const AP = await acct('2000');

/** Posts a balanced entry inside one transaction, as the app would. */
async function postEntry(date, memo, lines) {
  await db.exec('begin');
  try {
    const e = (await asAdmin(
      `insert into journal_entries(workspace_id,entry_date,memo,created_by) values ($1,$2,$3,$4) returning id`,
      [ws, date, memo, owner])).rows[0].id;
    for (const [accountId, debit, credit] of lines) {
      await asAdmin(
        `insert into journal_lines(workspace_id,entry_id,account_id,debit,credit,currency)
         values ($1,$2,$3,$4,$5,'USD')`, [ws, e, accountId, debit, credit]);
    }
    await db.exec('commit');
    return e;
  } catch (err) { await db.exec('rollback'); throw err; }
}

console.log('\nCHART OF ACCOUNTS');
const coaCount = (await asAdmin(`select count(*)::int n from chart_of_accounts where workspace_id=$1`, [ws])).rows[0].n;
R.check('Business workspace is seeded with a chart of accounts', coaCount > 30, `(${coaCount} accounts)`);

const personalWs = (await as(owner, `select id from create_workspace('Household','household')`)).rows[0].id;
const personalCoa = (await asAdmin(`select count(*)::int n from chart_of_accounts where workspace_id=$1`, [personalWs])).rows[0].n;
R.check('Household workspace gets NO chart of accounts', personalCoa === 0, `(${personalCoa})`);

const badNormal = await asAdmin(
  `select count(*)::int n from chart_of_accounts
    where workspace_id=$1 and not is_contra
      and ((class in ('asset','expense') and normal_balance <> 'debit')
        or (class in ('liability','equity','income') and normal_balance <> 'credit'))`, [ws]);
R.check('Every seeded account has a normal balance matching its class', badNormal.rows[0].n === 0);

const contra = (await asAdmin(
  `select count(*)::int n from chart_of_accounts where workspace_id=$1 and is_contra`, [ws])).rows[0].n;
R.check('Contra accounts are declared, not misclassified', contra === 3, `(${contra})`);

console.log('\nTHE BALANCING INVARIANT');
const sale = await postEntry('2026-08-05', 'Consulting invoice paid', [
  [CASH, '5000.00', '0'], [REVENUE, '0', '5000.00'],
]);
R.check('A balanced entry posts', !!sale);

await R.denied('An UNBALANCED entry is rejected (5000 debit vs 4000 credit)', () =>
  postEntry('2026-08-06', 'Broken', [[CASH, '5000.00', '0'], [REVENUE, '0', '4000.00']]));

await R.denied('A single-sided entry is rejected', () =>
  postEntry('2026-08-07', 'One line only', [[CASH, '100.00', '0']]));

await R.denied('A line with both debit AND credit is rejected', () =>
  postEntry('2026-08-08', 'Both sides', [[CASH, '50.00', '50.00'], [REVENUE, '0', '50.00']]));

await R.denied('A negative amount is rejected', () =>
  postEntry('2026-08-09', 'Negative', [[CASH, '-100.00', '0'], [REVENUE, '0', '-100.00']]));

// Rounding is where single-entry systems quietly drift.
const thirds = await postEntry('2026-08-10', 'Split three ways', [
  [RENT, '333.34', '0'], [RENT, '333.33', '0'], [RENT, '333.33', '0'],
  [CASH, '0', '1000.00'],
]);
R.check('A multi-line entry summing exactly to 1000.00 posts', !!thirds);

await R.denied('A multi-line entry off by one cent is rejected', () =>
  postEntry('2026-08-11', 'Off by a cent', [
    [RENT, '333.33', '0'], [RENT, '333.33', '0'], [RENT, '333.33', '0'],
    [CASH, '0', '1000.00'],
  ]));

console.log('\nBALANCES AND THE ACCOUNTING EQUATION');
await postEntry('2026-08-12', 'Office rent on credit', [
  [RENT, '2000.00', '0'], [AP, '0', '2000.00'],
]);

const cashBal = (await asAdmin(
  `select balance from account_balances_ledger where account_id=$1`, [CASH])).rows[0].balance;
R.check('Debit-normal cash balance is positive after a receipt', Number(cashBal) === 4000,
  `(got ${cashBal})`);

const revBal = (await asAdmin(
  `select balance from account_balances_ledger where account_id=$1`, [REVENUE])).rows[0].balance;
R.check('Credit-normal revenue reads positive, not negative', Number(revBal) === 5000, `(got ${revBal})`);

const eq = (await asAdmin(`
  select
    coalesce(sum(case when class='asset'     then class_contribution end),0) a,
    coalesce(sum(case when class='liability' then class_contribution end),0) l,
    coalesce(sum(case when class='equity'    then class_contribution end),0) e,
    coalesce(sum(case when class='income'    then class_contribution end),0) i,
    coalesce(sum(case when class='expense'   then class_contribution end),0) x
  from account_balances_ledger where workspace_id=$1`, [ws])).rows[0];
const lhs = Number(eq.a);
const rhs = Number(eq.l) + Number(eq.e) + (Number(eq.i) - Number(eq.x));
R.check('Assets = Liabilities + Equity + (Income − Expenses)', Math.abs(lhs - rhs) < 0.0001,
  `(${lhs} vs ${rhs})`);

const trial = (await asAdmin(
  `select coalesce(sum(debit),0) d, coalesce(sum(credit),0) c from journal_lines where workspace_id=$1`, [ws])).rows[0];
R.check('Trial balance: total debits equal total credits',
  Number(trial.d) === Number(trial.c), `(${trial.d} vs ${trial.c})`);

console.log('\nPERIOD CLOSE');
await asAdmin(`insert into accounting_periods(workspace_id,starts_on,ends_on) values ($1,'2026-07-01','2026-07-31')`, [ws]);
const julyOk = await postEntry('2026-07-15', 'July entry while open', [
  [CASH, '100.00', '0'], [REVENUE, '0', '100.00'],
]);
R.check('Entries post into an OPEN period', !!julyOk);

const periodId = (await asAdmin(
  `select id from accounting_periods where workspace_id=$1 and starts_on='2026-07-01'`, [ws])).rows[0].id;
await as(owner, `select * from close_accounting_period($1)`, [periodId]);
const state = (await asAdmin(`select state from accounting_periods where id=$1`, [periodId])).rows[0].state;
R.check('Owner can close a period', state === 'closed');

await R.denied('Entries CANNOT be posted into a closed period', () =>
  postEntry('2026-07-20', 'Backdated after filing', [
    [CASH, '999.00', '0'], [REVENUE, '0', '999.00'],
  ]));

await R.denied('Existing entries in a closed period cannot be deleted', () =>
  asAdmin(`delete from journal_entries where id=$1`, [julyOk]));

R.check('Entries still post into other open periods',
  !!(await postEntry('2026-08-20', 'August still open', [
    [CASH, '10.00', '0'], [REVENUE, '0', '10.00'],
  ])));

console.log('\nAUDIT AND ISOLATION');
const nos = (await asAdmin(
  `select entry_no from journal_entries where workspace_id=$1 order by entry_no`, [ws])).rows.map(r => Number(r.entry_no));
R.check('Journal entries are numbered sequentially', nos.every((n, i) => n === i + 1), `(${nos.join(',')})`);

const stranger = (await asAdmin(`insert into auth.users(email) values ('stranger@example.com') returning id`)).rows[0].id;
await asAdmin(`insert into user_profiles(id,full_name,country) values ($1,'Stranger','US')`, [stranger]);
const seen = (await as(stranger, `select count(*)::int n from journal_lines`)).rows[0].n;
R.check('A non-member CANNOT read another workspace ledger', seen === 0, `(saw ${seen})`);
const seenCoa = (await as(stranger, `select count(*)::int n from chart_of_accounts`)).rows[0].n;
R.check('A non-member CANNOT read another chart of accounts', seenCoa === 0, `(saw ${seenCoa})`);

const closeLogged = (await asAdmin(
  `select count(*)::int n from audit_logs where workspace_id=$1 and action='period.closed'`, [ws])).rows[0].n;
R.check('Closing a period is written to the audit log', closeLogged === 1);

process.exit(R.done() ? 1 : 0);
