// DATABASE_URL is the single source of truth for the application's
// PostgreSQL connection. SSL is handled by getDbSslConfig() in
// ./lib/database-url.ts (enabled in production, disabled otherwise so
// the local Helium dev database can connect).
export const DATABASE_URL = process.env.DATABASE_URL as string;

// Don't log the full URL for security reasons
console.log("Database connection configured:", DATABASE_URL ? "Yes" : "No");
