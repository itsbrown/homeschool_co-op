// Load test environment configuration (conditionally based on NODE_ENV)
// MUST be the first import so Stripe keys are set before any service initialises.
import "./test-env-loader";

import express from "express";
import { createServer } from 'http';

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

const app = express();

// Lightweight health check — must respond instantly for deployment health probes.
// This is intentionally registered before initializeApp() runs so it is always
// reachable, even during the few seconds the heavy bundle is loading.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
