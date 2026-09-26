import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';

const SELECT_COLUMNS = 'id, name, description, default_department_id, created_at';

// fk_categories_default_department is ON DELETE SET NULL, so deleting a department
// leaves its categories intact but unrouted. The count is here to let the API say so
// instead of letting the FK quietly do it.
const assertDepartmentExists = async (departmentId) => {
  const [rows] = await db.query('SELECT id FROM departments WHERE id = ?', [
    departmentId,
  ]);

  if (!rows[0]) {
    throw new ApiError(404, 'Department not found');
  }
};

export const createCategory = async ({ name, description, defaultDepartmentId }) => {
  await ensureNameAvailable(name);

  if (defaultDepartmentId) {
    await assertDepartmentExists(defaultDepartmentId);
  }

  const id = randomUUID();
  await db.query(
    'INSERT INTO categories (id, name, description, default_department_id) VALUES (?, ?, ?, ?)',
    [id, name, description ?? null, defaultDepartmentId ?? null],
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

export const updateCategory = async (id, { name, description, defaultDepartmentId }) => {
  await getCategory(id);
  await ensureNameAvailable(name, id);

  if (defaultDepartmentId) {
    await assertDepartmentExists(defaultDepartmentId);
  }

  // COALESCE would make it impossible to clear the routing hook, so the column is
  // written directly: a submitted null genuinely unroutes the category.
  await db.query(
    'UPDATE categories SET name = ?, description = ?, default_department_id = ? WHERE id = ?',
    [name, description ?? null, defaultDepartmentId ?? null, id],
  );

  return findById(id);
};

export const deleteCategory = async (id) => {
  await getCategory(id);

  // fk_issues_category is ON DELETE RESTRICT, so deleting a category that is still
  // in use fails at the database with a raw ER_ROW_IS_REFERENCED_2. The department
  // and ward services both pre-empt that with a message naming the blocker, and the
  // admin UI surfaces this message verbatim, so the count is worth one indexed
  // lookup here.
  const [issueRows] = await db.query(
    'SELECT COUNT(*) AS total FROM issues WHERE category_id = ?',
    [id],
  );
  if (issueRows[0].total > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${issueRows[0].total} issue(s) are filed under this category`,
    );
  }

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
  const [rows] = await db.query('SELECT id FROM categories WHERE name = ?', [name]);
  return rows[0];
};

const ensureNameAvailable = async (name, exceptId = null) => {
  const existing = await findByName(name);
  if (existing && existing.id !== exceptId) {
    throw new ApiError(409, 'Category name already exists');
  }
};
