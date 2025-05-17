import { Pool } from 'pg';

// Create connection to PostgreSQL database with components to handle special characters
let pool: Pool;

try {
  if (process.env.DATABASE_URL) {
    // Try to parse the URL manually to handle special characters better
    const url = new URL(process.env.DATABASE_URL);
    
    pool = new Pool({
      user: url.username,
      password: decodeURIComponent(url.password),
      host: url.hostname,
      port: parseInt(url.port || '5432'),
      database: url.pathname.split('/')[1],
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    // Test database connection in a non-blocking way
    pool.query('SELECT NOW()')
      .then(res => {
        console.log('Database connected successfully at:', res.rows[0].now);
      })
      .catch(err => {
        console.error('Error connecting to database, falling back to file-based storage:', err.message);
      });
  } else {
    console.log('No DATABASE_URL provided, falling back to file-based storage');
    // Create a dummy pool object for type compatibility
    pool = {} as Pool;
  }
} catch (error) {
  console.error('Error initializing database connection, falling back to file-based storage:', error);
  // Create a dummy pool object for type compatibility
  pool = {} as Pool;
}

export { pool };