import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from '../shared/schema';

// Enable WebSocket support for Neon serverless
neonConfig.webSocketConstructor = ws;

async function main() {
  try {
    console.log('Starting database schema migration...');

    const host = process.env.PGHOST || '';
    const port = process.env.PGPORT || '5432';
    const database = process.env.PGDATABASE || '';
    const user = process.env.PGUSER || '';
    const password = process.env.PGPASSWORD || '';

    if (!host || !port || !database || !user || !password) {
      throw new Error('Database connection environment variables are not set correctly');
    }

    // Construct a proper connection string
    const connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    console.log(`Connecting to database at ${host}:${port}/${database} as ${user}`);

    // Create a connection to the database
    const pool = new Pool({ connectionString });
    const db = drizzle(pool, { schema });

    // Execute create table queries for all the tables defined in the schema
    console.log('Creating tables if they do not exist...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        content JSONB NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT false,
        is_public BOOLEAN NOT NULL DEFAULT false,
        price NUMERIC NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        avg_rating NUMERIC NOT NULL DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_knowledge_bases (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        "knowledgeBaseId" INTEGER NOT NULL REFERENCES knowledge_bases(id),
        "isPurchased" BOOLEAN NOT NULL DEFAULT false,
        "acquiredAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("userId", "knowledgeBaseId")
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base_ratings (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id),
        "knowledgeBaseId" INTEGER NOT NULL REFERENCES knowledge_bases(id),
        rating INTEGER NOT NULL,
        comment TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("userId", "knowledgeBaseId")
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_references (
        id SERIAL PRIMARY KEY,
        "knowledgeBaseId" INTEGER NOT NULL REFERENCES knowledge_bases(id),
        title TEXT NOT NULL,
        "referenceType" TEXT NOT NULL,
        authors TEXT[],
        url TEXT,
        "publishYear" INTEGER,
        publisher TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS curricula (
        id SERIAL PRIMARY KEY, 
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        "gradeLevel" TEXT NOT NULL,
        "authorId" INTEGER NOT NULL REFERENCES users(id),
        content JSONB NOT NULL,
        "isPublished" BOOLEAN NOT NULL DEFAULT false,
        "isPublic" BOOLEAN NOT NULL DEFAULT false,
        price NUMERIC NOT NULL DEFAULT 0,
        "knowledgeBaseId" INTEGER REFERENCES knowledge_bases(id),
        "learningStyles" TEXT[] NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        "gradeLevel" TEXT NOT NULL,
        "authorId" INTEGER NOT NULL REFERENCES users(id),
        "curriculumId" INTEGER REFERENCES curricula(id),
        content JSONB NOT NULL,
        "isPublished" BOOLEAN NOT NULL DEFAULT false,
        "knowledgeBaseId" INTEGER REFERENCES knowledge_bases(id),
        status TEXT NOT NULL DEFAULT 'draft',
        duration INTEGER NOT NULL DEFAULT 60,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        "organizerId" INTEGER NOT NULL REFERENCES users(id),
        "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        location TEXT,
        "eventType" TEXT NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketplace_items (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        "sellerId" INTEGER NOT NULL REFERENCES users(id),
        price NUMERIC NOT NULL,
        "itemType" TEXT NOT NULL,
        "contentId" INTEGER NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        sales INTEGER NOT NULL DEFAULT 0,
        revenue NUMERIC NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Tables created successfully');
    console.log('Creating admin user if it does not exist...');
    
    // Create admin user if it doesn't exist
    await pool.query(`
      INSERT INTO users (username, password, email, role)
      VALUES ('admin', 'password', 'admin@example.com', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `);

    console.log('Admin user created');
    console.log('Migration completed successfully');

    // Clean up
    await pool.end();
  } catch (error) {
    console.error('Error migrating database schema:', error);
    process.exit(1);
  }
}

main();