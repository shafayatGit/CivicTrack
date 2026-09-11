import db from '../../config/db.js';

export const findByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

export const findById = async (id) => {
  const [rows] = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [id]);
  return rows[0];
};