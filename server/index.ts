// Load test environment configuration (conditionally based on NODE_ENV)
// MUST be the first import so Stripe keys are set before any service initialises.
import "./test-env-loader";

import express from "express";
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

// Inline log to avoid pulling server/vite.ts (and its Vite dependency) into
// the entry-point bundle, which would add significant parse-time weight.
function log(message: string): void {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [express] ${message}`);
}

// 🔒 PRODUCTION SAFETY: Verify NODE_ENV is set and log startup environment
const currentEnv = process.env.NODE_ENV || 'development';
console.log('🚀 Server starting in environment:', currentEnv);

if (currentEnv === 'production') {
  console.log('✅ Production mode: Database fallbacks disabled, test authentication blocked');
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables in production:', missingVars.join(', '));
    process.exit(1);
  }
} else {
  console.log('⚙️ Development/Test mode: Database fallbacks enabled for testing');
}

// Log database connection source at startup so deployment failures are immediately visible.
// buildPostgresUrl() in db.ts prefers individual PG vars over DATABASE_URL when the latter
// points to the old Supabase pooler (supabase.co). This guard surfaces missing config early.
{
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, DATABASE_URL } = process.env;
  const hasPgVars = !!(PGHOST && PGUSER && PGPASSWORD && PGDATABASE);
  const hasDbUrl = !!DATABASE_URL;
  const dbUrlIsSupabase = hasDbUrl && DATABASE_URL!.includes('supabase.co');

  if (hasPgVars) {
    console.log(`🗄️  DB config: individual PG vars present (PGHOST=${PGHOST})`);
    if (hasDbUrl && !dbUrlIsSupabase) {
      console.log(`🗄️  DB config: DATABASE_URL also present and non-Supabase — will use DATABASE_URL`);
    } else if (dbUrlIsSupabase) {
      console.log(`🗄️  DB config: DATABASE_URL points to supabase.co — will use PG vars instead`);
    }
  } else if (hasDbUrl) {
    console.log(`🗄️  DB config: using DATABASE_URL (no individual PG vars set)`);
    const missingPg = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].filter(k => !process.env[k]);
    console.warn(`⚠️  DB config: missing PG vars: ${missingPg.join(', ')}`);
  } else {
    console.error('❌ DB config: NO database connection info found (no PGHOST/PGUSER/PGPASSWORD/PGDATABASE and no DATABASE_URL)');
    console.error('   Set PGHOST, PGUSER, PGPASSWORD, PGDATABASE in deployment secrets to connect to PostgreSQL');
  }
}

const app = express();

// Lightweight health check — must respond instantly for deployment health probes.
// This is intentionally registered before initializeApp() runs so it is always
// reachable, even during the few seconds the heavy bundle is loading.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// In production: serve the Vite-compiled frontend immediately so that GET /
// responds before initializeApp() finishes loading all API routes (~7s).
// In development, setupVite() (called inside initializeApp) handles this.
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(import.meta.dirname, 'public');
  if (fs.existsSync(publicDir)) {
    // Prevent stale index.html from caching across deployments.
    // Fingerprinted asset chunks are safe to cache forever.
    app.use((req, _res, next) => {
      if (req.path === '/' || (!req.path.startsWith('/api') && !req.path.match(/\.\w+$/))) {
        _res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        _res.setHeader('Pragma', 'no-cache');
        _res.setHeader('Expires', '0');
      }
      next();
    });
    // Serve fingerprinted static assets (JS, CSS, images from dist/public/assets)
    app.use(express.static(publicDir));
    // SPA catch-all: serve index.html for all non-API, non-asset routes.
    // API routes registered later by initializeApp() take precedence because
    // Express matches in registration order — /api/* routes are added to the
    // router by registerRoutes(), but this catch-all only fires for paths that
    // have NOT already been handled. However, since this is a catch-all *use*
    // that only skips /api and file-extension paths, we're safe.
    app.use((req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') ||
        req.path.match(/\.\w+$/)
      ) {
        next();
      } else {
        res.sendFile(path.join(publicDir, 'index.html'));
      }
    });
  }
}

const httpServer = createServer(app);

const port = 5000;
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`serving on port ${port}`);

  // Dynamically import the heavy initialisation bundle so esbuild emits it as a
  // separate chunk (dist/app-init.js). The entry point therefore stays tiny and
  // Node.js binds to port 5000 in milliseconds rather than seconds.
  import('./app-init.js')
    .then(m => m.initializeApp(app, httpServer))
    .catch(err => console.error('❌ initializeApp failed:', err));
});
