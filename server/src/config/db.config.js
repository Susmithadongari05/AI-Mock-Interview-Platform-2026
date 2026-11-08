// ============================================
// db.config.js - MongoDB Connection
// ============================================
// IMPORTANT: MongoDB stores data per DATABASE. If MONGODB_URI has no database
// name (e.g. mongodb+srv://user:pass@cluster/), the driver uses the database
// called "test". A script or another copy of the app that uses a URI with a
// different database name (or a different cluster) will therefore see different
// users. This file logs which host/database is in use (never the credentials)
// and supports MONGODB_DB_NAME to pin the database explicitly.
// ============================================

import mongoose from 'mongoose';
import { describeMongoUri } from './env.js';

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) throw new Error('MONGODB_URI is not defined in server/.env');

  const explicitDb = (process.env.MONGODB_DB_NAME || '').trim();
  const info = describeMongoUri(mongoURI);

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      ...(explicitDb ? { dbName: explicitDb } : {}),
    });

    const dbName = conn.connection.name;
    console.log(`MongoDB connected: host=${conn.connection.host} database="${dbName}"`);
    if (!explicitDb && !info.dbInUri) {
      console.warn(
        `[MongoDB] WARNING: MONGODB_URI contains no database name, so the default database "${dbName}" is used. ` +
        'Any script/app using a URI that names a different database will NOT see the same users. ' +
        'Put the database name in the URI (…mongodb.net/<dbname>?…) or set MONGODB_DB_NAME.'
      );
    }
    return conn;
  } catch (error) {
    let hint = '';
    if (/ENOTFOUND|ECONNREFUSED|querySrv/i.test(error.message)) hint = ' Check the host in MONGODB_URI and your internet connection.';
    else if (/Authentication failed|bad auth/i.test(error.message)) hint = ' Check the database username/password in MONGODB_URI (URL-encode special characters).';
    else if (/Server selection timed out|whitelist|IP/i.test(error.message)) hint = ' For MongoDB Atlas, add your current IP address under Network Access.';
    const wrapped = new Error(`MongoDB connection failed (host ${info.host}): ${error.message}.${hint}`);
    wrapped.cause = error;
    throw wrapped;
  }
};

export default connectDB;
