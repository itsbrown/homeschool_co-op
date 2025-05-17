// This file handles the database URL from Replit-provisioned PostgreSQL
// We construct the URL from individual environment variables to avoid encoding issues
export const DATABASE_URL = process.env.PGHOST 
  ? `postgresql://${process.env.PGUSER}:${encodeURIComponent(process.env.PGPASSWORD as string)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`
  : process.env.DATABASE_URL;

console.log("Using database URL:", DATABASE_URL ? DATABASE_URL.replace(/:[^:@]+@/, ':****@') : 'Not set');