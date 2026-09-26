import db from "../../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import ApiError from "../../utils/ApiError.js";

const table = "users";

// The name is signed alongside the identity because the client keeps the token in
// localStorage and has no /api/auth/me to fetch a profile from, so the header can
// only show a real name if the token carries one. `id` (not the registered `sub`) is
// the subject claim, and protect exposes this payload verbatim as req.user, so both
// sides read the same keys.
const generateToken = (user) =>
  jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );

export const createUser = async ({ name, email, nid, password }) => {
  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  if (existing.length > 0) {
    throw new ApiError(409, "Email already registered");
  }

  // Checked before the insert rather than by catching uq_users_nid, so a duplicate
  // National ID reports the same 409 shape as a duplicate email and the register
  // form can put the message on the nid field.
  const [nidMatch] = await db.query("SELECT id FROM users WHERE nid = ?", [nid]);
  if (nidMatch.length > 0) {
    throw new ApiError(409, "National ID already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await db.query(
    `INSERT INTO ${table} (id, name, email, nid, password, role) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, email, nid, hashedPassword, "citizen"],
  );

  const user = { id, name, email, role: "citizen" };
  const token = generateToken(user);

  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
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

  const token = generateToken(user);

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
};
