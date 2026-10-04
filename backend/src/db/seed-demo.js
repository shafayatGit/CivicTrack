// Demo data for CivicTrack, scoped to the Badda / Dhaka area.
//
// This is seed data, not a migration. It is idempotent by *construction*: every row's
// primary key is derived deterministically from a stable business key (a category name, a
// ward number, an issue slug) via uuidFor() below, so re-running refreshes the same rows
// instead of duplicating them. That is the same reason db:seed:admin skips on an
// existing email, and it matters here because a half-seeded database is worse than an
// unseeded one.
//
// Nothing in src/modules/ is imported. The point of seeding is to populate tables that
// the application reads; calling the services instead would route every write through
// validation, actor attribution and the status machine, and a seed that depends on those
// rules cannot express "an issue that was reported 40 days ago and resolved 12 hours
// later".
//
// Status history and staff.issue_count are NOT written by hand. Issues are inserted as
// 'Reported' and then walked through the legal transition chain
// (Reported -> Acknowledged -> In Progress -> Resolved) with UPDATE statements, so the
// 015/020/022 triggers produce the audit trail and the denormalised workload counters
// exactly as they would in production. Writing those columns directly would leave the
// database internally inconsistent with its own triggers.

import 'dotenv/config';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

// Deterministic UUIDv5-shaped id from a stable key, so re-running this script targets the
// same rows. Version/variant bits are set so the value is a well-formed RFC 4122 UUID
// rather than just 32 hex characters.
const uuidFor = (key) => {
  const bytes = Buffer.from(createHash('sha256').update(`civictrack:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const daysAgo = (d) => new Date(Date.now() - d * DAY);
// Formats from LOCAL date parts. toISOString() would return the UTC date, and this project
// runs in UTC+6 — so a window ending on the 31st would be written as the 30th, silently
// excluding the final day. That is the same class of off-by-one as the BETWEEN bug this
// project's own performance work exists to avoid.
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoursAfter = (from, h) => new Date(from.getTime() + h * HOUR);

// Stable pseudo-random number in [0, 1) derived from a string. Used to scatter seeded
// coordinates and vote counts deterministically, so re-running the seed does not reshuffle
// the map points or renumber votes. Determinism matters more than realism here: a seed
// that moved every issue on each run would be impossible to eyeball for changes.
const offsetFor = (key) => {
  const digest = createHash('sha256').update(`civictrack:${key}`).digest();
  return digest.readUInt32BE(0) / 2 ** 32;
};

// 10-digit NID for the generated staff accounts. users.nid is NOT NULL (migration 018) and
// carries a UNIQUE index, so it has to be derived from the account rather than hardcoded:
// two seed accounts sharing a literal NID would collide on the second run.
const hashToInt = (key) => createHash('sha256').update(`nid:${key}`).digest().readUInt32BE(0);

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
// Five, not six. "Pothole" and "Road Damage" are both the carriageway's problem and a
// Pothole Repair is a separate wing from Road Maintenance, and is deliberately a separate
// row. A city corporation's roads wing really does split them: potholes are a reactive,
// high-priority, short-SLA defect, whereas general road damage (sunken carriageway, failed
// patch lines, worn markings) is planned resurfacing work on a much longer clock. Folding
// them into one department would force a single SLA onto two genuinely different service
// levels, and the shorter one would either make Road Maintenance look permanently overdue
// or make the pothole SLA a lie. The two targets (48h vs 72h) are what make that visible.
//
// Note the category→department mapping is many-to-one in general even now: Road Damage
// points at 'roads', and issues.department_id still falls back to
// categories.default_department_id via COALESCE in the service, so routing stays exercised.
//
// resolution_target_hours is the per-department SLA that makes overdue_count computable
// (migration 024). Parks is deliberately NULL: a department that has not agreed a target
// must report overdue as "unmeasured", never as 0. Leaving one real row in that state
// keeps that distinction visible in the admin report instead of only in the test harness.
const DEPARTMENTS = [
  {
    key: 'pothole',
    name: 'Pothole Repair Division',
    email: 'pothole.repair@dncc.gov.bd',
    target: 48,
  },
  {
    key: 'roads',
    name: 'Road Maintenance Division',
    email: 'road.maintenance@dncc.gov.bd',
    target: 72,
  },
  {
    key: 'lighting',
    name: 'Street Lighting Division',
    email: 'street.lighting@dncc.gov.bd',
    target: 120,
  },
  {
    key: 'waste',
    name: 'Conservancy and Waste Management Division',
    email: 'conservancy@dscc.gov.bd',
    target: 48,
  },
  {
    key: 'wasa',
    name: 'Dhaka Water Supply Authority',
    email: 'complaint@dwasa.gov.bd',
    target: 24,
  },
  {
    key: 'parks',
    name: 'Parks and Gardens Division',
    email: 'parks.gardens@dncc.gov.bd',
    target: null,
  },
];

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { key: 'pothole', name: 'Pothole', dept: 'pothole', description: 'Holes and depressions in the road surface caused by wear or failed patching.' },
  { key: 'streetlight', name: 'Streetlight', dept: 'lighting', description: 'Street lamps that are out, flickering, or damaged.' },
  { key: 'garbage', name: 'Garbage', dept: 'waste', description: 'Uncollected waste, overflowing bins, or dumping in the open.' },
  { key: 'water', name: 'Water Leakage', dept: 'wasa', description: 'Leaking or burst mains, leaking valves, and road seepage from the water line.' },
  { key: 'road-damage', name: 'Road Damage', dept: 'roads', description: 'Cracked, sunken or collapsed road surface, and damaged road markings.' },
  { key: 'fallen-tree', name: 'Fallen Tree', dept: 'parks', description: 'Trees or large branches down on the road or footpath after a storm.' },
];

// ---------------------------------------------------------------------------
// Wards
// ---------------------------------------------------------------------------
// Localities inside Badda Thana, Dhaka District (postal code 1212). The centres are real
// places; Badda Thana itself is at 23.7717 N, 90.4267 E. Ward numbers 17 and 21 are the
// Dhaka North City Corporation wards that Wikipedia records as covering Badda; the rest
// are illustrative numbering for the surrounding localities and are not a claim about the
// official ward map.
//
// Each ward gets a bounding box around its centre. lib/geo.js distinguishes "this ward has
// no bounds" from "the point is outside them", so seeding real bounds means the map's
// out-of-ward path is reachable rather than dead.
const WARDS = [
  { key: 'badda-bazar', name: 'Badda Bazar', number: '21', lat: 23.7805, lng: 90.4267 },
  { key: 'merul-badda', name: 'Merul Badda', number: '17', lat: 23.7935, lng: 90.4424 },
  { key: 'banani', name: 'Banani', number: '18', lat: 23.7937, lng: 90.4066 },
  { key: 'hatir-jheel', name: 'Hatir Jheel', number: '19', lat: 23.79, lng: 90.44 },
  { key: 'satarkul', name: 'Satarkul', number: '20', lat: 23.7875, lng: 90.4458 },
  { key: 'aftabnagar', name: 'Aftabnagar', number: '22', lat: 23.788, lng: 90.41 },
  { key: 'banasree', name: 'Banasree', number: '23', lat: 23.777, lng: 90.44 },
  { key: 'khilkhet', name: 'Khilkhet', number: '24', lat: 23.805, lng: 90.435 },
];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
// Reporters are the three citizen accounts already in the database. Staff are the three
// existing staff accounts plus two new ones, spread across the five departments so that
// every department can actually be assigned work — issue.assigned_staff_id is FK-checked
// against the same department elsewhere, so a department with no staff member is a
// department whose queue nobody can pick up.
const CITIZENS = [
  { key: 'citizen1@gmail.com', name: 'Rakibul Islam' },
  { key: 'citizen2@gmail.com', name: 'Sumaiya Akter' },
  { key: 'citizen@gmail.com', name: 'Tanvir Ahmed Chowdhury' },
];

const STAFF = [
  { key: 'shafayathossain.drmc@gmail.com', name: 'Md Shafayat Hossain Patowary', dept: 'roads' },
  { key: 'staff@gmail.com', name: 'New Staff', dept: 'lighting' },
  { key: 'staffemail@gmaill.com', name: 'staff new', dept: 'waste' },
  { key: 'seed.wasa@dncc.gov.bd', name: 'Nusrat Jahan', dept: 'wasa', create: true },
  { key: 'seed.parks@dncc.gov.bd', name: 'Abdul Karim', dept: 'parks', create: true },
  { key: 'seed.pothole@dncc.gov.bd', name: 'Rafiqul Islam', dept: 'pothole', create: true },
];

const SEED_PASSWORD = 'Seed@12345';

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------
// status: the state the issue should end up in. When it is 'Resolved', resolutionHours
// says how long it took, so the report has a real distribution behind it — several
// resolved inside their department's target and a few outside it, rather than every
// resolved issue looking identical.
//
// createdDaysAgo is deliberately spread over ~10 weeks. Department performance is cohorted
// by issues.created_at, so a single month of data would leave most reporting windows
// empty and the report would have nothing to show.
const ISSUES = [
  // --- Pothole -> Road Maintenance Division (72h target) ---
  { slug: 'pothole-badda-bazar-road', cat: 'pothole', ward: 'badda-bazar', status: 'Reported', created: 2,
    title: 'Deep pothole on Badda Bazar Road',
    description: 'There is a deep pothole about two metres wide right where cars slow down for the Badda Bazar junction. Two-wheelers swerve into oncoming traffic to avoid it and there have already been close calls.',
    landmark: 'Badda Bazar junction, near the pharmacy' },
  { slug: 'pothole-badda-foot-overbridge', cat: 'pothole', ward: 'badda-bazar', status: 'Resolved', created: 26, resolution: 30,
    title: 'Pothole in front of Badda foot overbridge',
    description: 'The ramp down from the foot overbridge meets a badly broken road surface. Commuters walking down the ramp step straight into a hole.',
    landmark: 'West end of the Badda foot overbridge' },
  { slug: 'pothole-kuril-badda-road', cat: 'pothole', ward: 'merul-badda', status: 'Resolved', created: 44, resolution: 96,
    title: 'Multiple potholes along Kuril Badda Road',
    description: 'A run of potholes the length of about fifty metres. Bus drivers swerve into the opposite lane to get past, which is dangerous at this speed.',
    landmark: 'Kuril Badda Road, near the Merul Badda turn' },
  { slug: 'pothole-banani-road-11', cat: 'pothole', ward: 'banani', status: 'Resolved', created: 62, resolution: 54,
    title: 'Pothole at the Banani Road 11 junction',
    description: 'A pothole opened up at the junction after the last rainfall. Water collects in it and it is now deep enough to hide a wheel rim.',
    landmark: 'Banani Road 11 and Road 4 junction' },
  { slug: 'pothole-rampura-road-hatir-jheel', cat: 'pothole', ward: 'hatir-jheel', status: 'In Progress', created: 9,
    title: 'Pothole widening after rain on Rampura Road',
    description: 'This started as a small patch and has widened noticeably over the last week of rain. It needs cutting out rather than patching again.',
    landmark: 'Rampura Road, opposite Hatir Jheel market' },

  // --- Road Damage -> Road Maintenance Division (same department as Pothole) ---
  { slug: 'road-damage-badda-link', cat: 'road-damage', ward: 'badda-bazar', status: 'In Progress', created: 15,
    title: 'Cracked road surface on Badda Link Road',
    description: 'The road surface has cracked into a long line across the carriageway. Vehicles crossing it hear a bang and it looks like it could sink.',
    landmark: 'Badda Link Road, near the flyover approach' },
  { slug: 'road-damage-satarkul-edge', cat: 'road-damage', ward: 'satarkul', status: 'Resolved', created: 51, resolution: 120,
    title: 'Road edge collapsed near the Satarkul junction',
    description: 'The shoulder has broken away and dropped about half a metre. A scooter rider went over the edge here last week.',
    landmark: 'Satarkul junction, south side' },
  { slug: 'road-damage-progoti-marking', cat: 'road-damage', ward: 'aftabnagar', status: 'Acknowledged', created: 21,
    title: 'Broken road marking on Progoti Avenue',
    description: 'The centre line and the pedestrian crossing markings have been worn away. At night it is very hard to tell which side of the road to be on.',
    landmark: 'Progoti Avenue, near the Aftabnagar crossing' },
  { slug: 'road-damage-khilkhet-approach', cat: 'road-damage', ward: 'khilkhet', status: 'Resolved', created: 71, resolution: 40,
    title: 'Sunken road patch near the Khilkhet approach road',
    description: 'A patch of road has sunk below the surrounding surface next to the approach road. Water now stands in it after any rain.',
    landmark: 'Khilkhet approach road, near the bridge' },

  // --- Streetlight -> Street Lighting Division (120h target) ---
  { slug: 'light-rampura-road-dark', cat: 'streetlight', ward: 'badda-bazar', status: 'Reported', created: 4,
    title: 'Three streetlights out on Rampura Road',
    description: 'Three consecutive streetlights are not coming on at night. This stretch is very dark and people walk along it to reach the buses.',
    landmark: 'Rampura Road, Badda side' },
  { slug: 'light-banani-road-11-flicker', cat: 'streetlight', ward: 'banani', status: 'In Progress', created: 17,
    title: 'Streetlight flickering on Banani Road 11',
    description: 'The lamp flickers on and off all night instead of lighting properly. It is also audible, a distinct buzzing from the pole.',
    landmark: 'Banani Road 11, outside the block' },
  { slug: 'light-hatir-jheel-dead', cat: 'streetlight', ward: 'hatir-jheel', status: 'Acknowledged', created: 28,
    title: 'Entire streetlight pole dead in Hatir Jheel',
    description: 'The whole pole is dark, not just one lamp. It looks like the supply to that column has been cut.',
    landmark: 'Hatir Jheel, near the mosque' },
  { slug: 'light-banasree-out-week', cat: 'streetlight', ward: 'banasree', status: 'Reported', created: 12,
    title: 'Streetlight out on Banasree Road for a week',
    description: 'Out for a week now. There is a school crossing about fifty metres ahead with no light at all.',
    landmark: 'Banasree Road, near the school crossing' },

  // --- Garbage -> Conservancy and Waste Management Division (48h target) ---
  { slug: 'garbage-badda-bazar-footpath', cat: 'garbage', ward: 'badda-bazar', status: 'Reported', created: 1,
    title: 'Garbage pile blocking the Badda Bazar footpath',
    description: 'A pile of household waste has completely blocked the footpath. People are walking out into the road to get past it.',
    landmark: 'Badda Bazar footpath, near the market entrance' },
  { slug: 'garbage-merul-badda-bin', cat: 'garbage', ward: 'merul-badda', status: 'In Progress', created: 8,
    title: 'Overflowing bin at the Merul Badda junction',
    description: 'The bin has not been emptied for several days and has overflowed onto the pavement. Flies and smell are a real problem.',
    landmark: 'Merul Badda junction, beside the corner shop' },
  { slug: 'garbage-aftabnagar-drain', cat: 'garbage', ward: 'aftabnagar', status: 'Acknowledged', created: 24,
    title: 'Household waste dumped on the Aftabnagar drain',
    description: 'Someone has been dumping household waste along the open drain. It will block the drain entirely when the next heavy rain comes.',
    landmark: 'Aftabnagar, along the open drain' },
  { slug: 'garbage-khilkhet-no-collection', cat: 'garbage', ward: 'khilkhet', status: 'Reported', created: 5,
    title: 'Garbage not collected in Khilkhet for four days',
    description: 'Four days without a collection and the bags are stacking up. There is a dengue risk in this area as it stands.',
    landmark: 'Khilkhet, near the main road' },
  { slug: 'garbage-satarkul-debris', cat: 'garbage', ward: 'satarkul', status: 'Resolved', created: 58, resolution: 44,
    title: 'Construction debris dumped near the Satarkul road',
    description: 'A pile of sand and rubble dumped on the roadside, blocking half the footpath.',
    landmark: 'Satarkul road, near the construction site' },

  // --- Water Leakage -> Dhaka Water Supply Authority (24h target) ---
  { slug: 'water-badda-link-main', cat: 'water', ward: 'badda-bazar', status: 'In Progress', created: 6,
    title: 'Continuous water leak from the main on Badda Link Road',
    description: 'A steady stream of water has been running into the road and across the footpath since yesterday. It has made the whole stretch slippery.',
    landmark: 'Badda Link Road, near the flyover approach' },
  { slug: 'water-merul-badda-burst', cat: 'water', ward: 'merul-badda', status: 'Acknowledged', created: 11,
    title: 'Burst pipe flooding the footpath near Merul Badda',
    description: 'The pipe has burst and water is covering the footpath and reaching the kerb. Motorcycles are stalling in it.',
    landmark: 'Merul Badda, near the main gate' },
  { slug: 'water-banani-valve', cat: 'water', ward: 'banani', status: 'Resolved', created: 33, resolution: 38,
    title: 'Water leaking from a valve near the Banani flyover',
    description: 'A valve was leaking steadily onto the road below. The area was constantly wet.',
    landmark: 'Banani, under the flyover' },
  { slug: 'water-khilkhet-seepage', cat: 'water', ward: 'khilkhet', status: 'Resolved', created: 49, resolution: 19,
    title: 'Road seepage from a broken water line in Khilkhet',
    description: 'A patch of road was permanently wet with no rain, which turned out to be a leaking water line under the surface.',
    landmark: 'Khilkhet, near the bridge approach' },

  // --- Fallen Tree -> Parks and Gardens Division (no target set) ---
  { slug: 'tree-hatir-jheel-blocking', cat: 'fallen-tree', ward: 'hatir-jheel', status: 'Reported', created: 2,
    title: 'Fallen tree blocking the road in Hatir Jheel',
    description: 'A large tree came down in the storm and is blocking one side of the road completely. Cars are squeezing past on the wrong side.',
    landmark: 'Hatir Jheel, near the mosque' },
  { slug: 'tree-banasree-branch', cat: 'fallen-tree', ward: 'banasree', status: 'Acknowledged', created: 13,
    title: 'Large branch fallen across the Banasree Road footpath',
    description: 'A heavy branch came down across the footpath and there is no way past on foot.',
    landmark: 'Banasree Road, near the school' },
  { slug: 'tree-khilkhet-storm', cat: 'fallen-tree', ward: 'khilkhet', status: 'Resolved', created: 66, resolution: 60,
    title: 'Fallen tree after the storm in Khilkhet',
    description: 'A tree fell across the road after the storm and was blocking the only route through.',
    landmark: 'Khilkhet, near the mosque' },
];

const seed = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const created = { departments: 0, categories: 0, wards: 0, users: 0, staff: 0, issues: 0, history: 0 };
  // Declared out here because the finally block closes it, and on an early throw the
  // import that assigns it never runs.
  let pool = null;

  try {
    // Leftover rows from older ad-hoc harness runs. They are not part of this seed and
    // they point departments at rows that no longer mean anything, so removing them keeps
    // the report numbers honest. Scoped by name/email so nothing real can match.
    const [harnessUsers] = await conn.query("SELECT id FROM users WHERE name LIKE 'Harness %'");
    for (const { id } of harnessUsers) {
      await conn.query('DELETE FROM staff WHERE user_id = ?', [id]);
      await conn.query('DELETE FROM users WHERE id = ?', [id]);
    }
    if (harnessUsers.length) {
      console.log(`Removed ${harnessUsers.length} leftover harness user(s)`);
    }

    // --- departments ---
    const deptId = {};
    for (const dept of DEPARTMENTS) {
      const id = uuidFor(`department:${dept.key}`);
      deptId[dept.key] = id;
      await conn.query(
        `INSERT INTO departments (id, name, contact_email, resolution_target_hours)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           contact_email = VALUES(contact_email),
           resolution_target_hours = VALUES(resolution_target_hours)`,
        [id, dept.name, dept.email, dept.target],
      );
      created.departments += 1;
    }

    // --- categories ---
    // The dependent insert comes after departments because default_department_id is an FK
    // into them; inserting categories first would fail on a fresh database.
    const catId = {};
    for (const category of CATEGORIES) {
      const id = uuidFor(`category:${category.key}`);
      catId[category.key] = id;
      await conn.query(
        `INSERT INTO categories (id, name, default_department_id, description)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           default_department_id = VALUES(default_department_id),
           description = VALUES(description)`,
        [id, category.name, deptId[category.dept], category.description],
      );
      created.categories += 1;
    }

    // --- wards ---
    const wardId = {};
    for (const ward of WARDS) {
      const id = uuidFor(`ward:${ward.key}`);
      wardId[ward.key] = id;
      // A half-degree-of-a-degree box, roughly a kilometre across, so the ward is large
      // enough to contain its own issues and small enough that the "outside the bounds"
      // path in lib/geo.js stays reachable.
      const pad = 0.01;
      await conn.query(
        `INSERT INTO wards
           (id, name, ward_number, min_latitude, min_longitude, max_latitude, max_longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           min_latitude = VALUES(min_latitude),
           min_longitude = VALUES(min_longitude),
           max_latitude = VALUES(max_latitude),
           max_longitude = VALUES(max_longitude)`,
        [id, ward.name, ward.number, ward.lat - pad, ward.lng - pad, ward.lat + pad, ward.lng + pad],
      );
      created.wards += 1;
    }

    // --- reporters ---
    const citizenId = {};
    for (const citizen of CITIZENS) {
      const [rows] = await conn.query('SELECT id, name FROM users WHERE email = ?', [citizen.key]);
      if (rows.length === 0) {
        console.log(`  ! no citizen account for ${citizen.key} — skipping`);
        continue;
      }
      citizenId[citizen.key] = rows[0].id;
      // Keep the display name in sync so comments authored by this citizen carry a
      // plausible name. comments.author_name is denormalised from users.name at write
      // time; the seed writes it directly and both should agree.
      if (rows[0].name !== citizen.name) {
        await conn.query('UPDATE users SET name = ? WHERE id = ?', [citizen.name, rows[0].id]);
      }
    }

    // --- staff ---
    const hashed = await bcrypt.hash(SEED_PASSWORD, 10);
    const staffId = {};
    const staffUserId = {};
    for (const member of STAFF) {
      let id;
      let userId;
      const [rows] = await conn.query('SELECT id, user_id FROM staff WHERE user_id = (SELECT id FROM users WHERE email = ?)', [member.key]);

      if (rows.length > 0) {
        id = rows[0].id;
        userId = rows[0].user_id;
        // Re-point at the demo department. The existing staff accounts all sat in a
        // placeholder department; leaving them there would mean five departments with no
        // staff and no way to assign their work.
        await conn.query('UPDATE staff SET department_id = ? WHERE id = ?', [deptId[member.dept], id]);
        const [userRows] = await conn.query('SELECT name FROM users WHERE id = ?', [userId]);
        if (userRows[0] && userRows[0].name !== member.name) {
          await conn.query('UPDATE users SET name = ? WHERE id = ?', [member.name, userId]);
        }
      } else {
        userId = uuidFor(`user:${member.key}`);
        const nid = `9${String(1000000000 + Math.abs(hashToInt(member.key))).slice(0, 9)}`;
        await conn.query(
          `INSERT INTO users (id, name, email, nid, password, role)
           VALUES (?, ?, ?, ?, ?, 'staff')
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [userId, member.name, member.key, nid, hashed],
        );
        id = uuidFor(`staff:${member.key}`);
        await conn.query(
          'INSERT INTO staff (id, user_id, department_id) VALUES (?, ?, ?)',
          [id, userId, deptId[member.dept]],
        );
        created.users += 1;
      }
      staffId[member.dept] = id;
      staffUserId[member.dept] = userId;
      created.staff += 1;
    }

    // --- issues ---
    // Inserted as 'Reported' with no assignee, then walked up the transition chain. This
    // is what populates status_history and staff.issue_count, via the triggers.
    const staffByDept = STAFF.map((s) => ({ dept: s.dept, id: staffId[s.dept], userId: staffUserId[s.dept] }));

    for (const issue of ISSUES) {
      const id = uuidFor(`issue:${issue.slug}`);
      const ward = WARDS.find((w) => w.key === issue.ward);
      const createdAt = daysAgo(issue.created);
      // Scatter the point inside the ward's own box so a point-in-ward check agrees with
      // the ward it was filed under.
      const lat = ward.lat + (offsetFor(issue.slug) - 0.5) * 0.012;
      const lng = ward.lng + (offsetFor(`${issue.slug}:lng`) - 0.5) * 0.012;

      const category = CATEGORIES.find((c) => c.key === issue.cat);

      // Rewind to the starting state before replaying the workflow. Without this, a second
      // run appends to whatever the first run left behind: the trigger only fires when the
      // status actually changes, so re-walking a chain that has already progressed produces
      // a *backward* transition (In Progress -> Acknowledged) and the audit trail ends up
      // claiming the issue bounced when it did not.
      //
      // Order matters: the rewind UPDATE itself fires trg_issues_log_status_change, so the
      // history delete has to come AFTER it, not before. Deleting first would leave the
      // rewind's own (backward) row behind and the trail would still be wrong.
      await conn.query(
        'UPDATE issues SET status = ?, resolved_at = NULL, assigned_staff_id = NULL WHERE id = ?',
        ['Reported', id],
      );
      await conn.query('DELETE FROM status_history WHERE issue_id = ?', [id]);

      await conn.query(
        `INSERT INTO issues
           (id, user_id, category_id, ward_id, department_id, title, description,
            latitude, longitude, landmark, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reported', ?)
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           category_id = VALUES(category_id),
           ward_id = VALUES(ward_id),
           department_id = VALUES(department_id),
           title = VALUES(title),
           description = VALUES(description),
           latitude = VALUES(latitude),
           longitude = VALUES(longitude),
           landmark = VALUES(landmark)`,
        [
          id,
          citizenId[CITIZENS[0].key] ?? citizenId[Object.keys(citizenId)[0]],
          catId[issue.cat],
          wardId[issue.ward],
          // Routing mirrors the application: an explicit department here, and the service's
          // own fallback is COALESCE(department_id, categories.default_department_id).
          deptId[category.dept],
          issue.title,
          issue.description,
          lat,
          lng,
          issue.landmark,
          createdAt,
        ],
      );
      created.issues += 1;

      // The actor the audit trail should credit, and the assignee. These are deliberately
    // different ids: issues.assigned_staff_id is a staff row, while status_history.changed_by
    // is a users row (that is what withActor receives — req.user.id). Setting the actor to
    // the staff id fails the changed_by FK.
    //
    // Set on the same pinned connection, because a session variable belongs to a connection
    // and db.js is a pool — the exact trap documented in AGENTS.md, where a bare SET
    // followed by a separate query silently records changed_by = NULL.
    const assignee = staffByDept.find((s) => s.dept === category.dept)?.id ?? null;
    const actor = staffByDept.find((s) => s.dept === category.dept)?.userId ?? null;
    if (actor) {
      await conn.query('SET @civictrack_actor_id = ?', [actor]);
    }

      const steps = ['Acknowledged', 'In Progress', 'Resolved'];
      const targetIndex = steps.indexOf(issue.status);
      const resolvedAt = issue.resolution ? hoursAfter(createdAt, issue.resolution) : null;

      for (let i = 0; i <= targetIndex; i += 1) {
        const next = steps[i];
        if (i === 0 && assignee) {
          // Assignment happens on the FIRST transition, not on In Progress. An officer
          // picks the report up and accepts it when they acknowledge it; In Progress only
          // means work has started. Assigning later would leave every acknowledged issue
          // sitting in a department queue with nobody's name on it.
          await conn.query(
            'UPDATE issues SET assigned_staff_id = ?, status = ? WHERE id = ?',
            [assignee, next, id],
          );
        } else if (next === 'Resolved') {
          // resolved_at is maintained by the service, not by a trigger, because only the
          // app knows which transition is a real resolution and leaving Resolved must
          // write NULL. COALESCE cannot express that, so the seed sets it explicitly.
          await conn.query('UPDATE issues SET status = ?, resolved_at = ? WHERE id = ?', [next, resolvedAt, id]);
        } else {
          await conn.query('UPDATE issues SET status = ? WHERE id = ?', [next, id]);
        }
        created.history += 1;
      }

      // The trigger stamps CURRENT_TIMESTAMP, so every step of the chain lands in the same
      // second and the public status-history endpoint shows three transitions at an
      // identical instant. That reads as fabricated, and the timeline is the part of an
      // issue residents actually look at. Re-stamp each step to a plausible moment in the
      // workflow: picked up within a few hours, work started the next day, resolved at
      // resolved_at.
      //
      // Fixed offsets alone are wrong for a fast fix — a 19-hour repair would get its
      // "work started" step stamped at +26h, i.e. after the thing was already fixed. So
      // each stamp is clamped to the issue's own resolution window, and an issue that is
      // still open has no window to clamp against and just uses the fixed offsets.
      if (targetIndex >= 0) {
        const spanMs = resolvedAt ? resolvedAt.getTime() - createdAt.getTime() : 0;
        const stamp = (fixedHours, fraction) =>
          hoursAfter(createdAt, Math.min(fixedHours, Math.max(0.25, spanMs * fraction) / HOUR));

        await conn.query(
          `UPDATE status_history SET changed_at = ?
           WHERE issue_id = ? AND new_status = 'Acknowledged'`,
          [stamp(4, 0.15), id],
        );
        if (targetIndex >= 1) {
          await conn.query(
            `UPDATE status_history SET changed_at = ?
             WHERE issue_id = ? AND new_status = 'In Progress'`,
            [stamp(26, 0.55), id],
          );
        }
        if (targetIndex >= 2 && resolvedAt) {
          await conn.query(
            `UPDATE status_history SET changed_at = ?
             WHERE issue_id = ? AND new_status = 'Resolved'`,
            [resolvedAt, id],
          );
        }
      }
    }

    await conn.query('SET @civictrack_actor_id = NULL');

    // --- votes and a few comments ---
    // Not part of the request, but the issue detail page is public and its vote count and
    // comment thread are the only parts of it that are interesting when empty. Votes are
    // per-user here (user_id set, voter_token NULL); the anonymous cookie path cannot be
    // seeded because the token is a SHA-256 of a browser-held secret.
    const popular = ISSUES.slice(0, 6);
    let votes = 0;
    for (const issue of popular) {
      const id = uuidFor(`issue:${issue.slug}`);
      const count = 1 + Math.floor(offsetFor(`${issue.slug}:votes`) * 3);
      for (let v = 0; v < count; v += 1) {
        const voter = CITIZENS[v % CITIZENS.length].key;
        if (!citizenId[voter]) continue;
        await conn.query(
          'INSERT IGNORE INTO votes (id, issue_id, user_id) VALUES (?, ?, ?)',
          [uuidFor(`vote:${issue.slug}:${voter}`), id, citizenId[voter]],
        );
        votes += 1;
      }
    }

    const COMMENTS = [
      { slug: 'pothole-badda-bazar-road', by: 'citizen2@gmail.com', hoursAfter: 5, text: 'I hit this on my way home last night. It is deeper than it looks in the photos.' },
      { slug: 'pothole-badda-bazar-road', by: 'staff', hoursAfter: 22, text: 'Thank you for reporting. A crew is scheduled to cut this out rather than patch it again, as the edges are already breaking up.' },
      { slug: 'water-badda-link-main', by: 'citizen@gmail.com', hoursAfter: 9, text: 'The water is covering half the footpath now and children are walking through it to get to school.' },
      { slug: 'light-hatir-jheel-dead', by: 'citizen1@gmail.com', hoursAfter: 30, text: 'This has been dark for over a week. The whole stretch up to the mosque is unlit.' },
      { slug: 'garbage-khilkhet-no-collection', by: 'citizen2@gmail.com', hoursAfter: 20, text: 'There is standing water in the bags now. With the mosquitoes this is a dengue risk.' },
    ];

    let comments = 0;
    for (const comment of COMMENTS) {
      const issueId = uuidFor(`issue:${comment.slug}`);
      const issue = ISSUES.find((i) => i.slug === comment.slug);
      if (!issue) continue;

      let authorId = null;
      let authorName;
      if (comment.by === 'staff') {
        // A staff reply must come from the department actually handling the report, and its
        // role is read from users.role by the join — the badge is unforgeable that way.
        const category = CATEGORIES.find((c) => c.key === issue.cat);
        const member = STAFF.find((s) => s.dept === category.dept);
        const [rows] = await conn.query('SELECT id, name FROM users WHERE email = ?', [member.key]);
        authorId = rows[0]?.id ?? null;
        authorName = rows[0]?.name ?? member.name;
      } else {
        authorId = citizenId[comment.by] ?? null;
        authorName = CITIZENS.find((c) => c.key === comment.by)?.name ?? 'Resident';
      }

      await conn.query(
        `INSERT INTO comments (id, issue_id, user_id, author_name, comment_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE comment_text = VALUES(comment_text)`,
        [uuidFor(`comment:${comment.slug}:${comment.by}`), issueId, authorId, authorName, comment.text, hoursAfter(daysAgo(issue.created), comment.hoursAfter)],
      );
      comments += 1;
    }

    // --- performance snapshots ---
    // Generated for the two windows an admin would actually open, so the performance
    // report has numbers on first load instead of an empty table waiting for a click.
    const { buildPerformanceSnapshot } = await import('../modules/department/department.service.js');
    // Importing a service pulls in config/db.js, which opens a pool. Closing this
    // connection is not enough to let the process exit: the pool holds its own sockets and
    // keeps the event loop alive, so the script would finish its work and then hang
    // forever instead of returning an exit code.
    pool = await import('../config/db.js').then((m) => m.default);
    const monthStart = new Date(Date.now());
    const endOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const thisMonth = { periodStart: `${ymd(monthStart).slice(0, 7)}-01`, periodEnd: ymd(endOfMonth) };
    const prevMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const lastMonth = {
      periodStart: `${ymd(prevMonth).slice(0, 7)}-01`,
      periodEnd: ymd(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0)),
    };

    // The service uses the shared pool rather than this connection, which is fine here
    // because nothing in this path depends on the pinned @civictrack_actor_id.
    await buildPerformanceSnapshot(lastMonth);
    await buildPerformanceSnapshot(thisMonth);

    console.log(`\nSeeded:
  ${created.departments} departments
  ${created.categories} categories
  ${created.wards} wards
  ${created.users} new staff users, ${created.staff} staff records
  ${created.issues} issues (${created.history} status transitions)
  ${votes} votes
  ${comments} comments
  performance snapshots for ${lastMonth.periodStart}..${lastMonth.periodEnd} and ${thisMonth.periodStart}..${thisMonth.periodEnd}`);

    if (created.users > 0) {
      console.log(`\nNew staff accounts use the password: ${SEED_PASSWORD}`);
    }
  } finally {
    await conn.end();
    // Closed in the success path only; on a throw the import may never have happened, so
    // pool.end() below the finally would be the thing that throws.
    await pool?.end();
  }
};

seed().catch((err) => {
  console.error('Demo seed failed:', err.message);
  process.exit(1);
});