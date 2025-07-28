
import express from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Create school-parent association
router.post("/associate", async (req, res) => {
  try {
    const { parentEmail, schoolId, registrationCode } = req.body;

    if (!parentEmail || (!schoolId && !registrationCode)) {
      return res.status(400).json({ 
        message: "Parent email and school identifier are required" 
      });
    }

    console.log('🔗 Creating school-parent association:', { parentEmail, schoolId, registrationCode });

    try {
      // Try database first - update user with school association
      const [updatedUser] = await db
        .update(users)
        .set({ 
          schoolId: schoolId ? parseInt(schoolId) : null,
          updatedAt: new Date()
        })
        .where(eq(users.email, parentEmail))
        .returning();

      if (updatedUser) {
        console.log('✅ School-parent association created in database');
        return res.json({ 
          success: true, 
          message: "School association created successfully",
          userId: updatedUser.id,
          schoolId: updatedUser.schoolId
        });
      }
    } catch (dbError) {
      console.log('⚠️ Database failed, using file storage fallback:', dbError);
    }

    // Fallback to file storage
    try {
      const DATA_DIR = path.join(process.cwd(), 'data');
      const USERS_FILE = path.join(DATA_DIR, 'users.json');

      if (fs.existsSync(USERS_FILE)) {
        const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
        let users = JSON.parse(fileContent);
        
        const userIndex = users.findIndex((u: any) => u.email === parentEmail);
        if (userIndex !== -1) {
          users[userIndex].schoolId = schoolId ? parseInt(schoolId) : null;
          users[userIndex].updatedAt = new Date().toISOString();
          
          fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
          
          console.log('✅ School-parent association created in file storage');
          return res.json({ 
            success: true, 
            message: "School association created successfully",
            userId: users[userIndex].id,
            schoolId: users[userIndex].schoolId
          });
        }
      }
    } catch (fileError) {
      console.error('File storage also failed:', fileError);
    }

    return res.status(404).json({ message: "Parent not found" });
  } catch (error: any) {
    console.error("Error creating school-parent association:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get school for parent
router.get("/school/:parentEmail", async (req, res) => {
  try {
    const { parentEmail } = req.params;

    try {
      // Try database first
      const user = await db.query.users.findFirst({
        where: eq(users.email, parentEmail)
      });

      if (user && user.schoolId) {
        // Fetch school details
        const schoolResponse = await fetch(`${req.protocol}://${req.get('host')}/api/schools/${user.schoolId}`);
        if (schoolResponse.ok) {
          const school = await schoolResponse.json();
          return res.json({ success: true, school });
        }
      }
    } catch (dbError) {
      console.log('⚠️ Database failed, using file storage fallback:', dbError);
    }

    // Fallback to file storage
    try {
      const DATA_DIR = path.join(process.cwd(), 'data');
      const USERS_FILE = path.join(DATA_DIR, 'users.json');

      if (fs.existsSync(USERS_FILE)) {
        const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
        const users = JSON.parse(fileContent);
        
        const user = users.find((u: any) => u.email === parentEmail);
        if (user && user.schoolId) {
          // Fetch school details
          const schoolResponse = await fetch(`${req.protocol}://${req.get('host')}/api/schools/${user.schoolId}`);
          if (schoolResponse.ok) {
            const school = await schoolResponse.json();
            return res.json({ success: true, school });
          }
        }
      }
    } catch (fileError) {
      console.error('File storage also failed:', fileError);
    }

    return res.json({ success: false, school: null });
  } catch (error: any) {
    console.error("Error fetching parent's school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
