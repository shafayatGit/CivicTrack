import db from "../../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import ApiError from "../../utils/ApiError.js";

const table = "users";

export const createUser = async ({ name, email, password }) => {
  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  if (existing.length > 0) {
    throw new ApiError(409, "Email already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    `INSERT INTO ${table} (name, email, password) VALUES (?, ?, ?)`,
    [name, email, hashedPassword],
  );

  return { id: result.insertId, name, email };
};

export const loginUser = async ({ email, password }) => {
  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  const user = rows[0];

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
};
