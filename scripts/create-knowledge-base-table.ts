import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function createKnowledgeBaseTable() {
  console.log('Creating knowledge_bases table...');
  
  try {
    // Create the knowledge_bases table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        difficulty TEXT NOT NULL, 
        author_id INTEGER NOT NULL REFERENCES users(id),
        price INTEGER NOT NULL DEFAULT 0,
        files JSONB NOT NULL,
        metadata JSONB NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT false,
        download_count INTEGER NOT NULL DEFAULT 0,
        purchased_by JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Successfully created knowledge_bases table!');
  } catch (error) {
    console.error('Error creating knowledge_bases table:', error);
  }
}

createKnowledgeBaseTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });