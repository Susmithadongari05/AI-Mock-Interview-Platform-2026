// Shows which MongoDB host/database the app uses and what it contains (no secrets, emails masked).
//   npm run db:info          -> the database the server itself would use
//   npm run db:scan          -> also checks EVERY database on the cluster for a "users" collection
// Read-only: this script never writes or deletes anything.
import mongoose from 'mongoose';
import '../src/config/env.js';
import { describeMongoUri } from '../src/config/env.js';

const mask = (email = '') => email.replace(/^(.).*(@.*)$/, '$1***$2');
const scan = process.argv.includes('--scan');

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set in server/.env'); process.exit(1); }

const info = describeMongoUri(uri);
console.log(`Host: ${info.host} | database named in URI: ${info.dbInUri || 'none (driver default: "test")'}`);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, ...(process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {}) });
  const db = mongoose.connection.db;
  console.log(`Connected. Active database: "${db.databaseName}"`);
  for (const { name } of await db.listCollections().toArray()) {
    console.log(`  - ${name}: ${await db.collection(name).countDocuments()} document(s)`);
  }
  const users = await db.collection('users').find({}, { projection: { email: 1 } }).limit(20).toArray();
  if (users.length) console.log('Users (masked):', users.map((u) => mask(u.email)).join(', '));

  if (scan) {
    console.log('\nScanning every database on this cluster for a "users" collection…');
    try {
      const { databases } = await db.admin().listDatabases();
      for (const { name } of databases) {
        if (['admin', 'local', 'config'].includes(name)) continue;
        const other = mongoose.connection.client.db(name);
        const has = (await other.listCollections({ name: 'users' }).toArray()).length > 0;
        if (has) {
          const sample = await other.collection('users').find({}, { projection: { email: 1 } }).limit(20).toArray();
          console.log(`  ${name}.users: ${await other.collection('users').countDocuments()} user(s): ${sample.map((u) => mask(u.email)).join(', ')}`);
        }
      }
    } catch (error) {
      console.log(`Could not list databases (this database user may lack permission): ${error.message}`);
    }
  }
} catch (error) {
  console.error('Connection failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
