import { pool } from "../server/db";
import * as bcrypt from "bcryptjs";
import { users } from "../shared/schema";

async function createTestUsers() {
  try {
    console.log("Creating test users for different roles...");

    // Hash the password once for all users
    const hashedPassword = await bcrypt.hash("password", 10);

    // Test users data
    const testUsers = [
      {
        username: "admin",
        email: "admin@example.com",
        password: hashedPassword,
        name: "Administrator",
        role: "admin",
        subscription: "premium",
        avatar: null
      },
      {
        username: "learner",
        email: "learner@example.com",
        password: hashedPassword,
        name: "Test Learner",
        role: "learner",
        subscription: "free",
        avatar: null
      },
      {
        username: "parent",
        email: "parent@example.com",
        password: hashedPassword,
        name: "Test Parent",
        role: "parent", 
        subscription: "family",
        avatar: null
      },
      {
        username: "educator",
        email: "educator@example.com",
        password: hashedPassword,
        name: "Test Educator",
        role: "educator",
        subscription: "educator",
        avatar: null
      }
    ];

    // Create the users using direct SQL for maximum reliability
    for (const userData of testUsers) {
      try {
        // Check if user already exists
        const checkResult = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [userData.username]
        );

        if (checkResult.rows.length > 0) {
          console.log(`User ${userData.username} already exists, skipping`);
          continue;
        }

        // Insert the user
        const result = await pool.query(
          `INSERT INTO users 
          (username, email, password, name, role, subscription, avatar) 
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [
            userData.username,
            userData.email,
            userData.password,
            userData.name,
            userData.role,
            userData.subscription,
            userData.avatar
          ]
        );

        console.log(`Created ${userData.role} user: ${userData.username} (ID: ${result.rows[0].id})`);
      } catch (error) {
        console.log(`Error creating ${userData.role} user:`, error.message);
      }
    }

    console.log("User creation process completed");
  } catch (error) {
    console.error("Error creating test users:", error);
  } finally {
    // Close database pool
    await pool.end();
  }
}

createTestUsers();