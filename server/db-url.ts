// DATABASE_URL is the single source of truth for the application's
// PostgreSQL connection. SSL is handled by getDbSslConfig() in
// ./lib/database-url.ts (enabled in production, disabled otherwise so
// the local Helium dev database can connect). The URL is also normalized
// so passwords containing URL-reserved characters (e.g. `+`, `?`, `)`)
// are percent-encoded before any client tries to parse them.
import { getNormalizedDatabaseUrl } from './lib/database-url';

export const DATABASE_URL = (getNormalizedDatabaseUrl() ?? '') as string;

// Don't log the full URL for security reasons
console.log("Database connection configured:", DATABASE_URL ? "Yes" : "No");
