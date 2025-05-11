import { db } from "../server/db";
import { storage } from "../server/storage";
import * as bcrypt from "bcryptjs";

async function createTestUsers() {
  try {
    console.log("Creating test users for different roles...");

    // Test user for learner role
    const learnerData = {
      username: "learner",
      email: "learner@example.com",
      password: await bcrypt.hash("password", 10),
      name: "Test Learner",
      role: "learner" as const,
      subscription: "free" as const,
      avatar: null
    };
    
    // Test user for parent role
    const parentData = {
      username: "parent",
      email: "parent@example.com",
      password: await bcrypt.hash("password", 10),
      name: "Test Parent",
      role: "parent" as const,
      subscription: "family" as const,
      avatar: null
    };
    
    // Test user for educator role
    const educatorData = {
      username: "educator",
      email: "educator@example.com",
      password: await bcrypt.hash("password", 10),
      name: "Test Educator",
      role: "educator" as const,
      subscription: "educator" as const,
      avatar: null
    };

    // Create the users
    try {
      const learner = await storage.createUser(learnerData);
      console.log(`Created learner user: ${learner.username} (ID: ${learner.id})`);
    } catch (error) {
      console.log(`Error creating learner user: ${error.message}`);
    }

    try {
      const parent = await storage.createUser(parentData);
      console.log(`Created parent user: ${parent.username} (ID: ${parent.id})`);
    } catch (error) {
      console.log(`Error creating parent user: ${error.message}`);
    }

    try {
      const educator = await storage.createUser(educatorData);
      console.log(`Created educator user: ${educator.username} (ID: ${educator.id})`);
    } catch (error) {
      console.log(`Error creating educator user: ${error.message}`);
    }

    console.log("User creation process completed");
  } catch (error) {
    console.error("Error creating test users:", error);
  } finally {
    // Close database connection
    await db.end();
  }
}

createTestUsers();