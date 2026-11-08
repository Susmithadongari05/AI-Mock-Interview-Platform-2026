import bcrypt from 'bcryptjs';
import User from '../models/User.model.js';
import { generateToken } from '../utils/jwt.utils.js';

const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
const createAuthError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const register = async (name, email, password) => {
  const normalizedName = String(name ?? '').trim();
  const normalizedEmail = normalizeEmail(email);
  const plainPassword = String(password ?? '');

  if (!normalizedName || !normalizedEmail || !plainPassword) {
    throw createAuthError('Name, email, and password are required.', 400);
  }
  if (plainPassword.length < 6) {
    throw createAuthError('Password must be at least 6 characters.', 400);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw createAuthError('Email already registered. Please log in.', 409);
  }

  const user = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    password: await bcrypt.hash(plainPassword, 10),
  });

  return {
    token: generateToken(user),
    user: { id: user._id, email: user.email, name: user.name },
  };
};

export const emailLogin = async (email, password) => {
  const normalizedEmail = normalizeEmail(email);
  const plainPassword = String(password ?? '');
  if (!normalizedEmail || !plainPassword) {
    throw createAuthError('Email and password are required.', 400);
  }

  // Exact normalized lookup first, then case-insensitive lookup for legacy records.
  let user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    user = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' },
    });
  }

  if (!user || user.password == null) {
    throw createAuthError('Invalid email or password.', 401);
  }

  const storedPassword = String(user.password);
  let passwordMatches = false;
  let needsHashUpgrade = false;

  try {
    if (/^\$2[aby]\$\d{2}\$/.test(storedPassword)) {
      passwordMatches = await bcrypt.compare(plainPassword, storedPassword);
    } else {
      // Legacy compatibility: if an old record stored the password without hashing,
      // verify it once and immediately replace it with a bcrypt hash.
      passwordMatches = plainPassword === storedPassword;
      needsHashUpgrade = passwordMatches;
    }
  } catch {
    passwordMatches = false;
  }

  if (!passwordMatches) {
    throw createAuthError('Invalid email or password.', 401);
  }

  if (needsHashUpgrade) {
    user.password = await bcrypt.hash(plainPassword, 10);
  }
  user.email = normalizedEmail;
  user.lastLogin = new Date();
  await user.save();

  return {
    token: generateToken(user),
    user: { id: user._id, email: user.email, name: user.name },
  };
};

export const getUserProfile = async userId => {
  const user = await User.findById(userId).select('-__v -password');
  if (!user) throw createAuthError('User not found.', 404);

  return {
    id: user._id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
};
