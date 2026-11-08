// ============================================
// jwt.utils.js - JWT Token Utilities
// ============================================

import jwt from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw Object.assign(new Error('JWT_SECRET is not configured on the server.'), { statusCode: 500 });
  }
  return secret;
};

export const generateToken = (user) =>
  jwt.sign({ id: String(user._id), email: user.email }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

export const verifyToken = (token) => jwt.verify(token, getSecret());
