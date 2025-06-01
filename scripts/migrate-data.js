const fs = require('fs');
const path = require('path');

// Simple migration function that can be called from the server
async function migrateData() {
  try {
    console.log('Starting database migration...');
    
    // Import the database connection
    const { pool } = require('../server/db.ts');
    
    // Create tables
    console.log('Creating database tables...');
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

    console.log('Tables created successfully');

    // Load and migrate users
    const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf8'));
    console.log(`Migrating ${usersData.length} users...`);
    
    for (const user of usersData) {
      await pool.unsafe(`
        INSERT INTO users (username, email, password, role, name, avatar, subscription)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO NOTHING
      `, [
        user.username,
        user.email,
        user.password,
        user.role,
        user.name,
        user.avatar,
        user.subscription || 'free'
      ]);
    }

    // Load and migrate children
    const childrenData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/children.json'), 'utf8'));
    console.log(`Migrating ${childrenData.length} children...`);
    
    for (const child of childrenData) {
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
        child.school,
        child.learningStyle,
        child.specialNeeds,
        child.interests || [],
        child.allergies,
        child.medicalInfo,
        child.profileImage
      ]);
    }

    // Load and migrate schools
    const schoolsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/schools.json'), 'utf8'));
    console.log(`Migrating ${schoolsData.length} schools...`);
    
    for (const school of schoolsData) {
      await pool.unsafe(`
        INSERT INTO schools (name, type, admin_id, address, city, state, zip_code, phone_number, email, website, logo, description, founded_year, accreditation, enrollment_size)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT DO NOTHING
      `, [
        school.name,
        school.type || 'school',
        school.adminId,
        school.address,
        school.city,
        school.state,
        school.zipCode,
        school.phoneNumber,
        school.email,
        school.website,
        school.logo,
        school.description,
        school.foundedYear,
        school.accreditation,
        school.enrollmentSize
      ]);
    }

    console.log('Migration completed successfully!');
    
    // Check results
    const userCount = await pool.unsafe('SELECT COUNT(*) FROM users');
    const childCount = await pool.unsafe('SELECT COUNT(*) FROM children');
    const schoolCount = await pool.unsafe('SELECT COUNT(*) FROM schools');
    
    console.log('Migration results:');
    console.log(`- Users: ${userCount[0].count}`);
    console.log(`- Children: ${childCount[0].count}`);
    console.log(`- Schools: ${schoolCount[0].count}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

module.exports = { migrateData };