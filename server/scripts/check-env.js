// Prints (without secrets) how the server will be configured. Run: npm run check:env
import { envReport, validateRequiredEnv, describeMongoUri } from '../src/config/env.js';
import { getGeminiModel } from '../src/services/geminiService.js';

const mongo = describeMongoUri(process.env.MONGODB_URI);
const present = (name) => (process.env[name] ? 'set' : 'MISSING');

console.log('Server folder :', envReport.serverRoot);
console.log('Working dir   :', envReport.cwd);
console.log('.env file     :', envReport.envFile, envReport.envFileFound ? '(found)' : '(NOT FOUND)');
console.log('GEMINI_MODEL  :', getGeminiModel(), `(source: ${envReport.sources.GEMINI_MODEL})`);
console.log('MongoDB       :', `${mongo.scheme}://${mongo.host}`, '| database in URI:', mongo.dbInUri || 'none (driver default: "test")');
console.log('MONGODB_DB_NAME:', process.env.MONGODB_DB_NAME || '(not set)');
for (const name of ['JWT_SECRET', 'GEMINI_API_KEY', 'ASSEMBLYAI_API_KEY', 'MURF_API_KEY']) console.log(`${name.padEnd(19)}:`, present(name));
if (envReport.shadowed.length) {
  console.log(`\nWARNING: these variables also exist in your OS/shell environment with a DIFFERENT value: ${envReport.shadowed.join(', ')}`);
  console.log('server/.env takes precedence outside production. Remove the stale OS variable to avoid confusion (see README).');
}
const problems = validateRequiredEnv();
if (problems.length) { console.log('\nProblems:\n - ' + problems.join('\n - ')); process.exitCode = 1; }
else console.log('\nRequired settings present.');
