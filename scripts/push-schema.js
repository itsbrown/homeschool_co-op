// This script pushes our schema to the Replit-provisioned PostgreSQL database
import { DATABASE_URL } from '../server/db-url.ts';
import { db } from '../server/db.ts';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import * as schema from '../shared/schema.ts';
import { sql } from 'drizzle-orm';

async function main() {
  console.log("Pushing schema to database...");
  
  try {
    // Create schema
    console.log("Creating schema using SQL...");
    
    // Create users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        role VARCHAR(20) NOT NULL DEFAULT 'learner',
        avatar TEXT,
        subscription VARCHAR(20) NOT NULL DEFAULT 'free',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created users table");
    
    // Create curricula table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS curricula (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100) NOT NULL,
        grade_level VARCHAR(50) NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        is_published BOOLEAN NOT NULL DEFAULT false,
        is_public BOOLEAN NOT NULL DEFAULT false,
        price NUMERIC(10, 2) NOT NULL DEFAULT 0,
        learning_styles TEXT[] NOT NULL,
        content JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created curricula table");
    
    // Create lessons table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100) NOT NULL,
        grade_level VARCHAR(50) NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        curriculum_id INTEGER REFERENCES curricula(id),
        is_published BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        content JSONB NOT NULL,
        duration INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created lessons table");
    
    // Create events table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        organizer_id INTEGER NOT NULL REFERENCES users(id),
        start_date TIMESTAMP WITH TIME ZONE NOT NULL,
        end_date TIMESTAMP WITH TIME ZONE NOT NULL,
        location TEXT,
        event_type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created events table");
    
    // Create marketplace_items table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS marketplace_items (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        seller_id INTEGER NOT NULL REFERENCES users(id),
        price NUMERIC(10, 2) NOT NULL,
        sales INTEGER NOT NULL DEFAULT 0,
        revenue NUMERIC(10, 2) NOT NULL DEFAULT 0,
        item_type VARCHAR(20) NOT NULL,
        content_id INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created marketplace_items table");
    
    console.log("Schema creation completed successfully!");
  } catch (error) {
    console.error("Error creating schema:", error);
    process.exit(1);
  }
}

main();