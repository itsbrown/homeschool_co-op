// This file handles the database URL from Replit-provisioned PostgreSQL
// We use the provided DATABASE_URL directly to ensure compatibility with Neon database
export const DATABASE_URL = process.env.DATABASE_URL as string;

// Don't log the full URL for security reasons
console.log("Database connection configured:", DATABASE_URL ? "Yes" : "No");