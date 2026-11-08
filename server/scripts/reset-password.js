// Sets a NEW password for an EXISTING user, using exactly the same env/DB configuration as the server.
//   npm run user:reset-password -- you@example.com
// The new password is read from the NEW_PASSWORD environment variable or prompted (hidden).
// This script never creates, deletes or overwrites any user other than updating that one password hash.
// If the email is not found, it tells you which database it looked in and searches the other databases on the cluster.
import readline from 'node:readline';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import '../src/config/env.js';
import { describeMongoUri } from '../src/config/env.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('Usage: npm run user:reset-password -- <email>'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set in server/.env'); process.exit(1); }

const askHidden = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
  rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const info = describeMongoUri(process.env.MONGODB_URI);

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, ...(process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {}) });
  const db = mongoose.connection.db;
  console.log(`Using host ${info.host}, database "${db.databaseName}" (the same one the server uses).`);

  const users = db.collection('users');
  const user = await users.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });

  if (!user) {
    console.error(`\nNo user with email ${email} exists in database "${db.databaseName}" (${await users.countDocuments()} user(s) there).`);
    try {
      const { databases } = await db.admin().listDatabases();
      const found = [];
      for (const { name } of databases) {
        if (['admin', 'local', 'config'].includes(name) || name === db.databaseName) continue;
        const hit = await mongoose.connection.client.db(name).collection('users').findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
        if (hit) found.push(name);
      }
      if (found.length) console.error(`That email DOES exist in other database(s) on this cluster: ${found.join(', ')}.\nPut the right database name into MONGODB_URI (or MONGODB_DB_NAME) in server/.env, then run this again.`);
      else console.error('It was not found in any other database on this cluster either. If you saw the record in a different cluster/project, MONGODB_URI points to the wrong cluster.');
    } catch (error) {
      console.error(`Could not search other databases: ${error.message}`);
    }
    process.exitCode = 1;
  } else {
    const password = process.env.NEW_PASSWORD || await askHidden('New password (min 6 chars): ');
    if (String(password).length < 6) throw new Error('Password must be at least 6 characters.');
    const hash = await bcrypt.hash(String(password), 10);
    const result = await users.updateOne({ _id: user._id }, { $set: { password: hash, email: email, updatedAt: new Date() } });
    console.log(`Password updated for ${email} (matched ${result.matchedCount}, modified ${result.modifiedCount}). No other data was touched.`);
  }
} catch (error) {
  console.error('Failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
