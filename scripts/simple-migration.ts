import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';

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

async function runMigration() {
  try {
    console.log('Starting Supabase migration...');
    
    // Import the database connection
    const { pool } = await import('../server/db');
    
    console.log('Creating database tables...');
    
    // Create basic tables first
    await pool.unsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'learner',
        name TEXT NOT NULL,
        avatar TEXT,
        subscription TEXT NOT NULL DEFAULT 'free',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await pool.unsafe(`
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
    `);

    await pool.unsafe(`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
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
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await pool.unsafe(`
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
    `);

    console.log('Database tables created successfully');

    // Migrate users
    console.log('Migrating users...');
    const jsonUsers: any[] = await loadJsonData('users.json');
    
    for (const user of jsonUsers) {
      try {
        let hashedPassword = user.password;
        if (!user.password.startsWith('$2')) {
          hashedPassword = await bcrypt.hash(user.password, 10);
        }

        await pool.unsafe(`
          INSERT INTO users (username, email, password, role, name, avatar, subscription)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (email) DO NOTHING
        `, [
          user.username,
          user.email,
          hashedPassword,
          user.role || 'learner',
          user.name,
          user.avatar || null,
          user.subscription || 'free'
        ]);

        console.log(`Migrated user: ${user.email}`);
      } catch (error) {
        console.error(`Error migrating user ${user.email}:`, error);
      }
    }

    // Migrate children
    console.log('Migrating children...');
    const jsonChildren: any[] = await loadJsonData('children.json');
    
    for (const child of jsonChildren) {
      try {
        await pool.unsafe(`
          INSERT INTO children (parent_id, first_name, last_name, birthdate, grade_level, school, learning_style, special_needs, interests, allergies, medical_info, profile_image)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT DO NOTHING
        `, [
          child.parentId,
          child.firstName,
          child.lastName,
          child.birthdate,
          child.gradeLevel,
          child.school || null,
          child.learningStyle || null,
          child.specialNeeds || null,
          child.interests || [],
          child.allergies || null,
          child.medicalInfo || null,
          child.profileImage || null
        ]);

        console.log(`Migrated child: ${child.firstName} ${child.lastName}`);
      } catch (error) {
        console.error(`Error migrating child ${child.firstName} ${child.lastName}:`, error);
      }
    }

    // Migrate schools
    console.log('Migrating schools...');
    const jsonSchools: any[] = await loadJsonData('schools.json');
    
    for (const school of jsonSchools) {
      try {
        await pool.unsafe(`
          INSERT INTO schools (name, type, admin_id, address, city, state, zip_code, phone_number, email, website, logo, description, founded_year, accreditation, enrollment_size)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT DO NOTHING
        `, [
          school.name,
          school.type || 'school',
          school.adminId,
          school.address || null,
          school.city,
          school.state,
          school.zipCode,
          school.phoneNumber || null,
          school.email,
          school.website || null,
          school.logo || null,
          school.description || null,
          school.foundedYear || null,
          school.accreditation || null,
          school.enrollmentSize || null
        ]);

        console.log(`Migrated school: ${school.name}`);
      } catch (error) {
        console.error(`Error migrating school ${school.name}:`, error);
      }
    }

    // Migrate classes
    console.log('Migrating classes...');
    const jsonClasses: any[] = await loadJsonData('classes.json');
    
    for (const classData of jsonClasses) {
      try {
        await pool.unsafe(`
          INSERT INTO classes (title, description, subject, grade_level, age_range, price, instructor_name, location, schedule, capacity, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT DO NOTHING
        `, [
          classData.title,
          classData.description || null,
          classData.subject,
          classData.gradeLevel,
          classData.ageRange || null,
          classData.price || null,
          classData.instructorName || null,
          classData.location || null,
          JSON.stringify(classData.schedule || {}),
          classData.capacity || null,
          classData.isActive !== false
        ]);

        console.log(`Migrated class: ${classData.title}`);
      } catch (error) {
        console.error(`Error migrating class ${classData.title}:`, error);
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();