// ============================================
// server.js - Entry Point
// ============================================
// The env import MUST come first: it loads server/.env by absolute path before
// any other module reads process.env.
// ============================================

import { envReport, validateRequiredEnv, describeMongoUri } from './src/config/env.js';
import app from './src/app.js';
import connectDB from './src/config/db.config.js';
import { getGeminiModel } from './src/services/geminiService.js';

const PORT = process.env.PORT || 5000;

// Log real stack traces instead of dying silently (the browser would only see ECONNRESET).
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error.stack || error);
});

const logStartupDiagnostics = () => {
  const mongo = describeMongoUri(process.env.MONGODB_URI);
  console.log('--------------------------------------------------');
  console.log(' Server folder : ' + envReport.serverRoot);
  console.log(' Working dir   : ' + envReport.cwd);
  console.log(' .env file     : ' + envReport.envFile + (envReport.envFileFound ? ' (found)' : ' (NOT FOUND)'));
  console.log(` Gemini model  : ${getGeminiModel()}  [GEMINI_MODEL from ${envReport.sources.GEMINI_MODEL}]`);
  console.log(` MongoDB       : ${mongo.scheme}://${mongo.host}  [database in URI: ${mongo.dbInUri || 'none -> default "test"'}]`);
  if (envReport.shadowed.length) {
    console.warn(` NOTE: OS/shell variables ${envReport.shadowed.join(', ')} differed from server/.env.` +
      (process.env.NODE_ENV === 'production' ? ' (production: shell values kept)' : ' The .env values are being used.'));
  }
  console.log('--------------------------------------------------');
};

const startServer = async () => {
  try {
    logStartupDiagnostics();
    const problems = validateRequiredEnv();
    if (problems.length) {
      throw new Error(`Invalid server/.env configuration:\n - ${problems.join('\n - ')}`);
    }
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server is running: http://localhost:${PORT}  (environment: ${process.env.NODE_ENV || 'development'})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
