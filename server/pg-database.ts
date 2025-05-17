import { Pool } from 'pg';

// Create connection to PostgreSQL database with components to handle special characters
let pool: Pool;

const connectWithRetry = async (maxRetries = 5, retryDelay = 5000) => {
  let retries = maxRetries;
  
  while (retries > 0) {
    try {
      if (!process.env.DATABASE_URL) {
        console.log('No DATABASE_URL provided, using default or file-based storage');
        return;
      }
      
      // Parse URL manually without using URL constructor
      let connectionString = process.env.DATABASE_URL;
      
      // Handle connection string directly, bypassing URL parsing
      // For PostgreSQL URL with special characters, extract components directly
      try {
        // Extract the protocol, username, password, host, port, and database
        if (connectionString && connectionString.startsWith('postgresql://')) {
          // Remove protocol
          const withoutProtocol = connectionString.replace('postgresql://', '');
          
          // Split by @ to separate credentials from host
          const atIndex = withoutProtocol.indexOf('@');
          if (atIndex !== -1) {
            const credentials = withoutProtocol.substring(0, atIndex);
            const hostPart = withoutProtocol.substring(atIndex + 1);
            
            // Get username and password
            const colonIndex = credentials.indexOf(':');
            if (colonIndex !== -1) {
              const username = credentials.substring(0, colonIndex);
              const password = credentials.substring(colonIndex + 1);
              
              // Create a proper connection config directly
              const newPool = new Pool({
                user: username,
                password: password,
                host: hostPart.split(':')[0],
                port: parseInt(hostPart.split(':')[1].split('/')[0], 10),
                database: hostPart.split('/')[1],
                ssl: {
                  rejectUnauthorized: false
                }
              });
              
              console.log("Using direct connection configuration");
              return newPool;
            }
          }
        }
        
        // Fallback to standard connection string if parsing fails
        console.log("Using standard connection string");
        return new Pool({
          connectionString,
          ssl: {
            rejectUnauthorized: false
          }
        });
      } catch (parseError) {
        console.error('Error parsing database URL:', parseError);
        return new Pool({
          connectionString,
          ssl: {
            rejectUnauthorized: false
          }
        });
      }
      
      // Test connection
      const res = await newPool.query('SELECT NOW()');
      console.log('Database connected successfully at:', res.rows[0].now);
      
      // Assign the working pool
      pool = newPool;
      return;
    } catch (err) {
      console.error(`Database connection attempt failed (${maxRetries - retries + 1}/${maxRetries}):`, err);
      retries--;
      
      if (retries === 0) {
        console.error('All connection attempts failed, falling back to file-based storage');
        // Initialize empty pool for type compatibility
        pool = {} as Pool;
        return;
      }
      
      console.log(`Retrying in ${retryDelay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

// Initialize pool
connectWithRetry().catch(err => {
  console.error('Error in connection retry logic:', err);
  pool = {} as Pool;
});

export { pool };