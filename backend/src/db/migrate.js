import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const connect = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

const getMigrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

const runMigration = async (conn, file) => {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
  console.log(`Running: ${file}`);
  await conn.query(sql);
  console.log(`Done: ${file}`);
};

const migrate = async () => {
  const conn = await connect();
  console.log('Connected to MySQL');

  try {
    for (const file of getMigrationFiles()) {
      await runMigration(conn, file);
    }
    console.log('All migrations completed');
  } finally {
    await conn.end();
  }
};

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});