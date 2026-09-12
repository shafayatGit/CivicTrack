import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';

const SELECT_COLUMNS = 'id, name, description, created_at';

export const createCategory = async ({ name, description }) => {
  await ensureNameAvailable(name);

  const id = randomUUID();
  await db.query(
    'INSERT INTO categories (id, name, description) VALUES (?, ?, ?)',
    [id, name, description],
  );

  return findById(id);
};

export const listCategories = async () => {
  const [rows] = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM categories ORDER BY name`,
  );
  return rows;
};

export const getCategory = async (id) => {
  const category = await findById(id);
  if (!category) {
    throw new ApiError(404, 'Category not found');
  }
  return category;
};

export const updateCategory = async (id, { name, description }) => {
  await getCategory(id);
  await ensureNameAvailable(name, id);

  await db.query(
    'UPDATE categories SET name = ?, description = ? WHERE id = ?',
    [name, description, id],
  );

  return findById(id);
};

export const deleteCategory = async (id) => {
  const [result] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
  if (!result.affectedRows) {
    throw new ApiError(404, 'Category not found');
  }
};

const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM categories WHERE id = ?`,
    [id],
  );
  return rows[0];
};

const findByName = async (name) => {
  const [rows] = await db.query(
    'SELECT id FROM categories WHERE name = ?',
    [name],
  );
  return rows[0];
};

const ensureNameAvailable = async (name, exceptId = null) => {
  const existing = await findByName(name);
  if (existing && existing.id !== exceptId) {
    throw new ApiError(409, 'Category name already exists');
  }
};