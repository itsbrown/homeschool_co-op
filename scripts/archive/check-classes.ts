import { getDb } from './server/db.js';
import { classes } from './shared/schema.js';
import fs from 'fs';
import path from 'path';

async function checkClasses() {
  try {
    // Check database
    const db = await getDb();
    const dbClasses = await db.select().from(classes);
    
    console.log(`\n📊 Database: ${dbClasses.length} classes`);
    if (dbClasses.length > 0) {
      dbClasses.forEach(c => {
        console.log(`   - ID: ${c.id}, Title: ${c.title}`);
      });
    }
    
    // Check JSON file
    const CLASSES_FILE = path.join(process.cwd(), 'data', 'classes.json');
    if (fs.existsSync(CLASSES_FILE)) {
      const fileClasses = JSON.parse(fs.readFileSync(CLASSES_FILE, 'utf-8'));
      console.log(`\n📄 JSON file: ${fileClasses.length} classes`);
      if (fileClasses.length > 0) {
        fileClasses.forEach((c: any) => {
          console.log(`   - ID: ${c.id}, Title: ${c.title}`);
        });
      }
    } else {
      console.log('\n📄 No classes.json file found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkClasses();
