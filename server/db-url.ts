// This file handles proper encoding of the database URL
let dbUrl = process.env.DATABASE_URL;

if (dbUrl && dbUrl.includes('postgresql://')) {
  // Extract components from the URL
  const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (urlParts) {
    const [_, username, password, host, port, database] = urlParts;
    
    // Encode the password properly
    const encodedPassword = encodeURIComponent(password);
    
    // Reconstruct the URL
    dbUrl = `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  }
}

export const DATABASE_URL = dbUrl;