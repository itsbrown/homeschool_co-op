import { db } from '../server/db';
import { users } from '../shared/schema';
import bcrypt from 'bcryptjs';

async function createAdminUser() {
  try {
    console.log('Checking if admin user already exists...');
    const existingAdmin = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.username, 'admin')
    });

    if (existingAdmin) {
      console.log('Admin user already exists.');
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('password', 10);

    console.log('Creating admin user...');
    await db.insert(users).values({
      username: 'admin',
      name: 'Admin User',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      avatar: null,
      subscription: 'educator',
      createdAt: new Date()
    });

    console.log('Admin user created successfully.');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    process.exit(0);
  }
}

createAdminUser();