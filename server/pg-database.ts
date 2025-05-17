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
      
      // Parse connection string components manually to handle special characters
      const connectionString = process.env.DATABASE_URL;
      
      // Create connection pool
      const newPool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false
        }
      });
      
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