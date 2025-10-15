import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://postgres.zhewzxqclhtpcaxdytiw:IKRtd1h0epg7YgjQ@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
});

async function createUsersTable() {
  const client = await pool.connect();
  try {
    console.log('🔧 Creating role enum...');
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "role" AS ENUM ('student', 'parent', 'teacher', 'schoolAdmin', 'admin', 'superAdmin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Role enum created');
    
    console.log('🔧 Creating users table...');
    await client.query(`
      CREATE TABLE "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "auth0_id" varchar(255),
        "supabase_id" text,
        "username" text NOT NULL,
        "email" text NOT NULL,
        "password" text NOT NULL,
        "role" "role" DEFAULT 'student' NOT NULL,
        "name" text NOT NULL,
        "avatar" text,
        "subscription" text DEFAULT 'free' NOT NULL,
        "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "school_id" integer,
        "phone" text,
        "emergency_contact_first_name" text,
        "emergency_contact_last_name" text,
        "emergency_contact_phone" text,
        "emergency_contact_relationship" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "last_login" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_auth0_id_unique" UNIQUE("auth0_id"),
        CONSTRAINT "users_supabase_id_unique" UNIQUE("supabase_id"),
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_email_unique" UNIQUE("email")
      );
    `);
    console.log('✅ Users table created');
    
    console.log('🎉 Production database setup complete!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createUsersTable().catch(console.error);
