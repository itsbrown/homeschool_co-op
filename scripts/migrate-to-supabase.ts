import { db } from '../server/db';
import { users, children, schools, programs, curricula, knowledgeBases, classes } from '../shared/schema';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';

interface JsonUser {
  id: number;
  username: string;
  email: string;
  password: string;
  role: string;
  name: string;
  avatar?: string;
  subscription?: string;
}

interface JsonChild {
  id: number;
  parentId: number;
  firstName: string;
  lastName: string;
  birthdate: string;
  gradeLevel: string;
  school?: string;
  learningStyle?: string;
  specialNeeds?: string;
  interests?: string[];
  allergies?: string;
  medicalInfo?: string;
  profileImage?: string;
}

interface JsonSchool {
  id: number;
  name: string;
  type: string;
  adminId: number;
  address?: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email: string;
  website?: string;
  logo?: string;
  description?: string;
  foundedYear?: number;
  accreditation?: string;
  enrollmentSize?: number;
}

interface JsonClass {
  id: number;
  title: string;
  description?: string;
  subject: string;
  gradeLevel: string;
  ageRange?: string;
  price?: number;
  instructorName?: string;
  location?: string;
  schedule?: any;
  capacity?: number;
  isActive?: boolean;
}

async function loadJsonData<T>(filename: string): Promise<T[]> {
  try {
    const filePath = path.join(process.cwd(), 'data', filename);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(`No ${filename} found or error reading file:`, error);
    return [];
  }
}

async function createTables() {
  console.log('Creating database tables...');
  
  try {
    // Create tables using raw SQL - this is more reliable than drizzle-kit for complex schemas
    const createTablesSQL = `
      -- Create users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'parent', 'educator', 'admin', 'schoolAdmin')),
        name TEXT NOT NULL,
        avatar TEXT,
        subscription TEXT NOT NULL DEFAULT 'free' CHECK (subscription IN ('free', 'individual', 'family', 'educator', 'institutional')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create children table
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES users(id),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birthdate DATE NOT NULL,
        grade_level TEXT NOT NULL,
        school TEXT,
        learning_style TEXT,
        special_needs TEXT,
        interests TEXT[],
        allergies TEXT,
        medical_info TEXT,
        profile_image TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create schools table
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('school', 'co-op', 'homeschool_group', 'other')),
        admin_id INTEGER NOT NULL REFERENCES users(id),
        address TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        zip_code TEXT NOT NULL,
        phone_number TEXT,
        email TEXT NOT NULL,
        website TEXT,
        logo TEXT,
        description TEXT,
        founded_year INTEGER,
        accreditation TEXT,
        enrollment_size INTEGER,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create classes table (simplified for migration)
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        grade_level TEXT NOT NULL,
        age_range TEXT,
        price INTEGER,
        instructor_name TEXT,
        location TEXT,
        schedule JSONB,
        capacity INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create programs table (simplified for migration)
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        age_range TEXT NOT NULL,
        grade_levels TEXT[],
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        schedule_type TEXT NOT NULL,
        schedule_details JSONB NOT NULL,
        location_name TEXT,
        location_address TEXT,
        is_virtual BOOLEAN DEFAULT FALSE,
        meeting_url TEXT,
        capacity INTEGER NOT NULL,
        price INTEGER NOT NULL,
        instructor_id INTEGER REFERENCES users(id),
        curriculum_id INTEGER,
        cover_image TEXT,
        materials JSONB,
        is_published BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create knowledge_bases table (simplified for migration)
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT,
        grade_level TEXT,
        content JSONB,
        creator_id INTEGER REFERENCES users(id),
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    // Use the connection to execute raw SQL
    const { pool } = await import('../server/db');
    await pool.unsafe(createTablesSQL);
    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

async function migrateUsers() {
  console.log('Migrating users...');
  const jsonUsers: JsonUser[] = await loadJsonData('users.json');
  
  if (jsonUsers.length === 0) {
    console.log('No users to migrate');
    return;
  }

  for (const user of jsonUsers) {
    try {
      // Hash password if it's not already hashed
      let hashedPassword = user.password;
      if (!user.password.startsWith('$2')) {
        hashedPassword = await bcrypt.hash(user.password, 10);
      }

      await db.insert(users).values({
        username: user.username,
        email: user.email,
        password: hashedPassword,
        role: user.role as any,
        name: user.name,
        avatar: user.avatar,
        subscription: (user.subscription as any) || 'free'
      }).onConflictDoNothing();

      console.log(`Migrated user: ${user.email}`);
    } catch (error) {
      console.error(`Error migrating user ${user.email}:`, error);
    }
  }
}

async function migrateChildren() {
  console.log('Migrating children...');
  const jsonChildren: JsonChild[] = await loadJsonData('children.json');
  
  if (jsonChildren.length === 0) {
    console.log('No children to migrate');
    return;
  }

  for (const child of jsonChildren) {
    try {
      await db.insert(children).values({
        parentId: child.parentId,
        firstName: child.firstName,
        lastName: child.lastName,
        birthdate: new Date(child.birthdate),
        gradeLevel: child.gradeLevel,
        school: child.school,
        learningStyle: child.learningStyle,
        specialNeeds: child.specialNeeds,
        interests: child.interests,
        allergies: child.allergies,
        medicalInfo: child.medicalInfo,
        profileImage: child.profileImage
      }).onConflictDoNothing();

      console.log(`Migrated child: ${child.firstName} ${child.lastName}`);
    } catch (error) {
      console.error(`Error migrating child ${child.firstName} ${child.lastName}:`, error);
    }
  }
}

async function migrateSchools() {
  console.log('Migrating schools...');
  const jsonSchools: JsonSchool[] = await loadJsonData('schools.json');
  
  if (jsonSchools.length === 0) {
    console.log('No schools to migrate');
    return;
  }

  for (const school of jsonSchools) {
    try {
      await db.insert(schools).values({
        name: school.name,
        type: school.type as any,
        adminId: school.adminId,
        address: school.address,
        city: school.city,
        state: school.state,
        zipCode: school.zipCode,
        phoneNumber: school.phoneNumber,
        email: school.email,
        website: school.website,
        logo: school.logo,
        description: school.description,
        foundedYear: school.foundedYear,
        accreditation: school.accreditation,
        enrollmentSize: school.enrollmentSize
      }).onConflictDoNothing();

      console.log(`Migrated school: ${school.name}`);
    } catch (error) {
      console.error(`Error migrating school ${school.name}:`, error);
    }
  }
}

async function migrateClasses() {
  console.log('Migrating classes...');
  const jsonClasses: JsonClass[] = await loadJsonData('classes.json');
  
  if (jsonClasses.length === 0) {
    console.log('No classes to migrate');
    return;
  }

  for (const classData of jsonClasses) {
    try {
      await db.insert(classes).values({
        title: classData.title,
        description: classData.description,
        subject: classData.subject,
        gradeLevel: classData.gradeLevel,
        ageRange: classData.ageRange,
        price: classData.price,
        instructorName: classData.instructorName,
        location: classData.location,
        schedule: classData.schedule || {},
        capacity: classData.capacity,
        isActive: classData.isActive !== false
      }).onConflictDoNothing();

      console.log(`Migrated class: ${classData.title}`);
    } catch (error) {
      console.error(`Error migrating class ${classData.title}:`, error);
    }
  }
}

async function runMigration() {
  try {
    console.log('Starting Supabase migration...');
    
    await createTables();
    await migrateUsers();
    await migrateChildren();
    await migrateSchools();
    await migrateClasses();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();

export { runMigration };