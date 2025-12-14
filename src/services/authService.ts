
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { Logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
const JWT_EXPIRES_IN = '24h';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string;
}

interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * Register a new user
 */
export async function registerUser(email: string, password: string, fullName?: string): Promise<AuthResult> {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new Error('Email already registered');
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  const id = uuidv4();

  await query(
    'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)',
    [id, email, hash, fullName || null]
  );

  const token = jwt.sign({ userId: id, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: {
      id,
      email,
      name: fullName || null,
    },
  };
}

/**
 * Login a user
 */
export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const result = await query<User>('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.full_name,
    },
  };
}

/**
 * Verify JWT token
 */
export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    return decoded;
  } catch (err) {
    return null;
  }
}
