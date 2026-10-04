// Throwaway verification harness for the department performance snapshot.
//
// Not part of the app and not committed as a fixture: it builds a dataset whose answers
// are known by hand, then asserts the snapshot produces them. Run with:
//
//   node --input-type=module -e "$(cat src/db/verify-performance.js)"
//
// Everything it creates is prefixed PERFTEST so it can be removed in one sweep.
import 'dotenv/config';
import { randomUUID } from 'crypto';
import db from '../config/db.js';
import * as dept from '../modules/department/department.service.js';

const P = 'PERFTEST';
let failures = 0;

// Per-run token so a second run cannot collide with the first on any unique key
// (users.nid, wards.ward_number). A harness that only works once is not a harness.
const RUN = String(Date.now()).slice(-6);

const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) {
    failures += 1;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        expected ${e}\n        actual   ${a}`);
};

// A fixed "now" so overdue is deterministic: the harness shifts timestamps relative to
// the real clock but asserts against a target expressed in hours.
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);

// Every window this harness asks buildPerformanceSnapshot to generate. The generator
  // writes a row for EVERY department, not just the fixtures, so without this the runs
  // below would refresh the database's real departments for test-only windows. Tracked
  // explicitly so cleanup removes exactly what was created — a real admin snapshot for
  // the current month must survive a run of this harness.
const generatedWindows = new Set();

const snapshot = async (window) => {
  generatedWindows.add(`${window.periodStart}|${window.periodEnd}`);
  return dept.buildPerformanceSnapshot(window);
};

// Sub-selects identifying this harness's own rows. Hoisted to module scope because the
// boundary test deletes performance rows outside wipe() too, and the earlier version
// declared these inside wipe() only — so that delete threw a ReferenceError and left
// test windows behind for real departments.
const deptIds = `(SELECT id FROM departments WHERE name LIKE '${P}%')`;
const issueIds = `(SELECT id FROM issues WHERE title LIKE '${P}%')`;

const wipe = async () => {
  // Order matters: children before parents, because the FKs are RESTRICT. Every table
  // that can reference a PERFTEST row is cleared here — an earlier version only handled
  // issues and departments, which made the harness leave residue and then fail on the
  // *next* run with an FK error that looked like a schema problem.
  await db.query('DELETE FROM department_performance WHERE department_id IN ' + deptIds);
  await db.query('DELETE FROM status_history WHERE issue_id IN ' + issueIds);
  await db.query('DELETE FROM votes WHERE issue_id IN ' + issueIds);
  await db.query('DELETE FROM comments WHERE issue_id IN ' + issueIds);
  await db.query('DELETE FROM issue_photos WHERE issue_id IN ' + issueIds);
  await db.query('DELETE FROM false_reports WHERE issue_id IN ' + issueIds);
  await db.query('DELETE FROM issues WHERE title LIKE ?', [`${P}%`]);
  // staff.department_id is RESTRICT, so a staff row on a test department blocks the
  // department delete below. Only ever rows this harness created.
  await db.query('DELETE FROM staff WHERE department_id IN ' + deptIds);
  await db.query('DELETE FROM departments WHERE name LIKE ?', [`${P}%`]);
  await db.query('DELETE FROM categories WHERE name LIKE ?', [`${P}%`]);
  await db.query('DELETE FROM wards WHERE name LIKE ?', [`${P}%`]);
  await db.query('DELETE FROM users WHERE email LIKE ?', [`${P.toLowerCase()}%`]);
};

const seed = async () => {
  await wipe();

  const mk = async (table, cols, values) => {
    const id = randomUUID();
    const all = [id, ...values];
    if (all.length !== cols.length + 1) {
      throw new Error(
        `seed mismatch: ${table} has ${cols.length} cols + id but got ${values.length} values`,
      );
    }
    await db.query(
      `INSERT INTO ${table} (id, ${cols.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`,
      all,
    );
    return id;
  };

  const userId = await mk('users', ['name', 'email', 'nid', 'password', 'role'], [
    `${P} Reporter`,
    `${P.toLowerCase()}-${RUN}@example.com`,
    `9${RUN}`.padEnd(10, '0').slice(0, 10),
    'x',
    'citizen',
  ]);
  const categoryId = await mk('categories', ['name', 'default_department_id'], [
    `${P} Category`,
    null,
  ]);
  const wardId = await mk('wards', ['ward_number', 'name'], [RUN, `${P} Ward`]);

  // Roads has a 24h target; Lighting has NO target at all (the unmeasured case).
  const roads = await mk(
    'departments',
    ['name', 'contact_email', 'resolution_target_hours'],
    [`${P} Roads`, 'r@e.com', 24],
  );
  const lighting = await mk(
    'departments',
    ['name', 'contact_email', 'resolution_target_hours'],
    [`${P} Lighting`, 'l@e.com', null],
  );

  // issues: [department, createdHoursAgo, resolvedHoursAgo|null, isInvalid]
  // Each entry is [department, createdHoursAgo, resolvedHoursAgo|null, isInvalid].
  // resolvedHoursAgo of null means the issue is still open, which is what makes it a
  // candidate for the overdue count.
  //
  // Roads, target 24h. Valid issues: 6.
  const plan = [
    [roads, 100, 92, false], // resolved after 8h  -> inside target
    [roads, 100, 70, false], // resolved after 30h -> slower than target, but CLOSED
    [roads, 60, null, false], // open, 60h old -> past the 24h target, OVERDUE
    [roads, 50, null, false], // open, 50h old -> past the 24h target, OVERDUE
    [roads, 3, null, false], // open, 3h old -> inside target
    [roads, 1, null, false], // open, 1h old -> inside target
    // Invalid: must be excluded from every count, including overdue. If is_invalid were
    // not filtered, this 80h-old open issue would push overdue to 3.
    [roads, 80, null, true],
    // Lighting, no target: overdue must come back NULL however old these get.
    [lighting, 200, null, false],
    [lighting, 150, 140, false],
  ];

  for (const [deptId, createdH, resolvedH, isInvalid] of plan) {
    const id = randomUUID();
    const created = hoursAgo(createdH);
    await db.query(
      `INSERT INTO issues (id, user_id, category_id, ward_id, department_id, title,
        description, latitude, longitude, status, is_invalid, created_at,
        resolved_at, updated_at)
       VALUES (?,?,?,?,?,?, 'probe', 0, 0, ?, ?, ?, ?, ?)`,
      [
        id, userId, categoryId, wardId, deptId, `${P} issue ${createdH}h`,
        resolvedH === null ? 'Reported' : 'Resolved',
        isInvalid,
        created,
        resolvedH === null ? null : hoursAgo(resolvedH),
        resolvedH === null ? created : hoursAgo(resolvedH),
      ],
    );
  }

  return { roads, lighting };
};

const main = async () => {
  const { roads, lighting } = await seed();

  // A window that contains all of it: 200 days back to today.
  const [m] = await db.query(
    "SELECT DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 200 DAY), '%Y-%m-%d') AS s, DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS e",
  );
  const period = { periodStart: m[0].s, periodEnd: m[0].e };

  const rows = await snapshot(period);
  const byName = Object.fromEntries(rows.map((r) => [r.department_name, r]));

  const roadsRow = byName[`${P} Roads`];
  const lightingRow = byName[`${P} Lighting`];

  console.log('\n--- window', period, '\n');

  // Roads: 6 valid issues created in window (the 7th is invalid and excluded).
  check('Roads resolved_count (2 slow+fast resolved)', Number(roadsRow.resolved_count), 2);
  check('Roads open_count (4 open, invalid excluded)', Number(roadsRow.open_count), 4);
  check('Roads overdue_count (2 open past 24h target)', Number(roadsRow.overdue_count), 2);
  // (8h + 30h) / 2 = 19h
  check('Roads avg_resolution_hours', Math.round(Number(roadsRow.avg_resolution_hours)), 19);

  // Lighting has no target: overdue must be NULL, not 0.
  check('Lighting overdue_count is NULL when no target', lightingRow.overdue_count, null);
  check('Lighting resolved_count', Number(lightingRow.resolved_count), 1);
  check('Lighting open_count', Number(lightingRow.open_count), 1);

  // Idempotency: same window again must update, not duplicate.
  const [[before]] = await db.query(
    'SELECT COUNT(*) AS n FROM department_performance WHERE department_id = ?',
    [roads],
  );
  await snapshot(period);
  const [[after]] = await db.query(
    'SELECT COUNT(*) AS n FROM department_performance WHERE department_id = ?',
    [roads],
  );
  check('re-running the same window does not duplicate rows', Number(after.n), Number(before.n));
  check('exactly one row per department per window', Number(after.n), 1);

  // Half-open bounds: an issue created exactly on period_end must be included.
  const [edge] = await db.query(
    `SELECT COUNT(*) AS n FROM department_performance
     WHERE department_id = ? AND period_start = ? AND period_end = ?`,
    [roads, period.periodStart, period.periodEnd],
  );
  check('snapshot row keyed on the exact window', Number(edge[0].n), 1);

  // A closed historical window must be stable: re-running it much later cannot change
  // overdue, because overdue is judged at the window's end, not NOW().
  const [hist] = await db.query(
    "SELECT DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 200 DAY), '%Y-%m-%d') AS s, DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 100 DAY), '%Y-%m-%d') AS e",
  );
  const histPeriod = { periodStart: hist[0].s, periodEnd: hist[0].e };
  const first = await snapshot(histPeriod);
  const firstBy = Object.fromEntries(first.map((r) => [r.department_name, r.overdue_count]));
  const second = await snapshot(histPeriod);
  const secondBy = Object.fromEntries(second.map((r) => [r.department_name, r.overdue_count]));
  check(
    'closed historical window is stable across re-runs',
    secondBy[`${P} Roads`],
    firstBy[`${P} Roads`],
  );

  // Window sanity guards.
  try {
    dept.assertWindowIsSane({ periodStart: '2026-03-01', periodEnd: '2026-01-01' });
    check('inverted window rejected', 'no throw', '400');
  } catch (e) {
    check('inverted window rejected', e.statusCode, 400);
  }
  try {
    dept.assertWindowIsSane({ periodStart: '2020-01-01', periodEnd: '2026-01-01' });
    check('over-wide window rejected', 'no throw', '400');
  } catch (e) {
    check('over-wide window rejected', e.statusCode, 400);
  }

  // The half-open date bound. ERD 3.3 writes `created_at BETWEEN :start AND :end`,
  // which against a DATETIME column drops anything filed after midnight on the final
  // day. This is the most consequential deviation from the ERD's example query, so it
  // gets its own test rather than being folded into a count assertion.
  await db.query('DELETE FROM issues WHERE title LIKE ?', [`${P}%`]);
  // Scoped to the fixtures. A bare DELETE here would silently destroy real snapshots.
  await db.query('DELETE FROM department_performance WHERE department_id IN ' + deptIds);

  // Filed at 14:30 on the final day of its window.
  const lastDay = '2026-06-15';
  await db.query(
    `INSERT INTO issues (id, user_id, category_id, ward_id, department_id, title,
      description, latitude, longitude, status, created_at)
     SELECT ?, u.id, c.id, w.id, ?, 'PERFTEST final-day issue', 'probe', 0, 0,
       'Reported', TIMESTAMP(?, '14:30:00')
     FROM users u, categories c, wards w
     WHERE u.email LIKE ? AND c.name LIKE ? AND w.name LIKE ?
     LIMIT 1`,
    [randomUUID(), roads, lastDay, `${P.toLowerCase()}%`, `${P}%`, `${P}%`],
  );

  const [[seeded]] = await db.query(
    "SELECT COUNT(*) AS n FROM issues WHERE title = 'PERFTEST final-day issue'",
  );
  check('the final-day issue was actually seeded', Number(seeded.n), 1);

  const [[eraBetween]] = await db.query(
    `SELECT COUNT(*) AS n FROM issues
     WHERE title = 'PERFTEST final-day issue'
       AND created_at BETWEEN '2026-06-01' AND '2026-06-15'`,
  );
  check(
    "ERD 3.3's BETWEEN would have missed it (documents the bug it fixes)",
    Number(eraBetween.n),
    0,
  );

  const edgeSnapshots = await snapshot({
    periodStart: '2026-06-01',
    periodEnd: lastDay,
  });
  const edgeRoads = edgeSnapshots.find((r) => r.department_name === `${P} Roads`);
  check(
    'half-open bound keeps the final day (resolved + open == 1)',
    Number(edgeRoads.resolved_count) + Number(edgeRoads.open_count),
    1,
  );

  // Back to the primary dataset and window, to prove the boundary test left nothing
  // behind that would mask a regression in the main assertions. Re-seeded rather than
  // just re-snapshotted, because the boundary test deleted the original issues.
  await seed();
  const recheck = await snapshot(period);
  const recheckRoads = recheck.find((r) => r.department_name === `${P} Roads`);
  check('primary window intact after the boundary test', Number(recheckRoads.open_count), 4);
  check('overdue still correct after the boundary test', Number(recheckRoads.overdue_count), 2);

  await wipe();

  // Clean up only the windows this run generated, and only for departments that are not
  // the fixtures. Scoped by window on purpose: an admin's real snapshot for the current
  // month must survive a harness run.
  for (const key of generatedWindows) {
    const [start, end] = key.split('|');
    await db.query(
      `DELETE FROM department_performance
       WHERE period_start = ? AND period_end = ?
         AND department_id NOT IN (SELECT id FROM departments WHERE name LIKE ?)`,
      [start, end, `${P}%`],
    );
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (error) => {
  console.error('harness error:', error);
  await wipe().catch(() => {});
  process.exit(1);
});