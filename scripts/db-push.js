// This script encodes the DATABASE_URL properly and runs drizzle-kit push

import { execSync } from 'child_process';

// Get the original DATABASE_URL
let dbUrl = process.env.DATABASE_URL;

if (dbUrl && dbUrl.includes('postgresql://')) {
  try {
    // Extract components from the URL
    const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    
    if (urlParts) {
      const [_, username, password, host, port, database] = urlParts;
      
      // Encode the password properly
      const encodedPassword = encodeURIComponent(password);
      
      // Reconstruct the URL
      const encodedDbUrl = `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
      
      console.log("Running drizzle-kit push with encoded DATABASE_URL...");
      
      // Set the encoded URL and run the command
      process.env.DATABASE_URL = encodedDbUrl;
      execSync('npx drizzle-kit push', { stdio: 'inherit' });
      
      console.log("Database schema push completed.");
    } else {
      console.error("Could not parse DATABASE_URL");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error during database schema push:", error);
    process.exit(1);
  }
} else {
  console.error("DATABASE_URL is not set or not in the expected format");
  process.exit(1);
}