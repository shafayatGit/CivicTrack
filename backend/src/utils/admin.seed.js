import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import mysql from 'mysql2/promise';

const seedAdmin = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('Connected to MySQL');

  try {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!name || !email || !password) {
      throw new Error('Admin credentials are missing in the environment');
    }

    const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      console.log('Admin already exists, skipping seed');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await conn.query(
      'INSERT INTO users (id, name, email, password, role, nid) VALUES (?, ?, ?, ?, ?, ?)',
      // Migration 018 made users.nid NOT NULL, backfilling pre-existing rows as
      // LEGACY-1, LEGACY-2, ... A bootstrap admin has no real National ID to supply,
      // so it gets a placeholder on the same convention. Without one, db:seed:admin
      // fails with a NOT NULL violation on any database that is migrated but not yet
      // seeded. The random suffix is not decoration: nid carries a UNIQUE index, and
      // the seed is idempotent by email rather than by role, so pointing ADMIN_EMAIL at
      // a different address and re-running must not collide with the first admin.
      [
        randomUUID(),
        name,
        email,
        hashedPassword,
        'admin',
        `LEGACY-${randomUUID().slice(0, 8).toUpperCase()}`,
      ],
    );

    console.log(`Admin seeded: ${name} (${email})`);
  } finally {
    await conn.end();
  }
};

seedAdmin().catch((err) => {
  console.error('Admin seed failed:', err.message);
  process.exit(1);
});