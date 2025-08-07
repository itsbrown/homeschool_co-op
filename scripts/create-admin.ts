
import { db } from '../server/db';
import { users } from '../shared/schema';
import bcrypt from 'bcryptjs';

async function createAdminUser() {
  try {
    console.log('Checking if super admin user already exists...');
    const existingAdmin = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, 'corey@americanseekersacademy.com')
    });

    if (existingAdmin) {
      console.log('Super admin user already exists.');
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('I4mlnrC30!', 10);

    console.log('Creating super admin user...');
    await db.insert(users).values({
      username: 'superadmin',
      name: 'Super Administrator',
      email: 'corey@americanseekersacademy.com',
      password: hashedPassword,
      role: 'superAdmin',
      avatar: null,
      subscription: 'educator',
      createdAt: new Date()
    });

    console.log('Super admin user created successfully.');
  } catch (error) {
    console.error('Error creating super admin user:', error);
  } finally {
    process.exit(0);
  }
}

createAdminUser();
