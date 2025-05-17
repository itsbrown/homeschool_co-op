// Script to create the necessary database tables for the application
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

// Create a connection pool using environment variables provided by Replit
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createTables() {
  try {
    // Connect to the database
    const client = await pool.connect();
    console.log('Connected to database.');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'learner',
        name VARCHAR(255) NOT NULL,
        avatar VARCHAR(255),
        subscription VARCHAR(50) DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Users table created or already exists.');

    // Create classes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL,
        category_name VARCHAR(100),
        price INTEGER NOT NULL,
        capacity INTEGER DEFAULT 20,
        location VARCHAR(255),
        instructor_id INTEGER NOT NULL,
        instructor_name VARCHAR(255),
        is_published BOOLEAN DEFAULT FALSE,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        enrollment_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Classes table created or already exists.');

    // Create knowledge_bases table
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        description TEXT,
        author_id INTEGER NOT NULL,
        is_public BOOLEAN DEFAULT FALSE,
        price INTEGER DEFAULT 0,
        content JSONB NOT NULL,
        download_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Knowledge bases table created or already exists.');

    // Create programs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        organizer_id INTEGER NOT NULL,
        price INTEGER DEFAULT 0,
        capacity INTEGER DEFAULT 20,
        location VARCHAR(255),
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Programs table created or already exists.');

    // Create curricula table
    await client.query(`
      CREATE TABLE IF NOT EXISTS curricula (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100) NOT NULL,
        grade_level VARCHAR(50) NOT NULL,
        author_id INTEGER NOT NULL,
        is_published BOOLEAN DEFAULT FALSE,
        is_public BOOLEAN DEFAULT FALSE,
        price INTEGER DEFAULT 0,
        content JSONB NOT NULL,
        learning_styles TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Curricula table created or already exists.');

    console.log('All tables created successfully!');
    client.release();
  } catch (err) {
    console.error('Error creating tables:', err);
  } finally {
    pool.end();
  }
}

createTables();