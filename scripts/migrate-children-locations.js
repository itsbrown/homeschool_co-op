#!/usr/bin/env node

/**
 * Migration script to add location inheritance to existing children
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateChildrenLocations() {
  console.log('🏠 Starting children location inheritance migration...');

  try {
    // Read data files
    const childrenPath = path.join(path.dirname(__dirname), 'data', 'children.json');
    const usersPath = path.join(path.dirname(__dirname), 'data', 'users.json');
    const locationsPath = path.join(path.dirname(__dirname), 'data', 'locations.json');

    if (!fs.existsSync(childrenPath) || !fs.existsSync(usersPath) || !fs.existsSync(locationsPath)) {
      console.error('❌ Required data files not found');
      return;
    }

    const children = JSON.parse(fs.readFileSync(childrenPath, 'utf8'));
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

    console.log(`📊 Found ${children.length} children, ${users.length} users, ${locations.length} locations`);

    // Create lookup maps
    const userMap = new Map();
    users.forEach(user => {
      userMap.set(user.id, user);
    });

    const locationsBySchool = new Map();
    locations.forEach(location => {
      if (!locationsBySchool.has(location.schoolId)) {
        locationsBySchool.set(location.schoolId, []);
      }
      locationsBySchool.get(location.schoolId).push(location);
    });

    let updatedCount = 0;

    // Update each child with parent's location
    children.forEach(child => {
      const parent = userMap.get(child.parentId);
      if (!parent) {
        console.log(`⚠️ Parent not found for child ${child.firstName} ${child.lastName} (parentId: ${child.parentId})`);
        return;
      }

      // Only update if location fields don't exist or are null
      if (child.schoolId === undefined && child.locationId === undefined) {
        child.schoolId = parent.schoolId || null;
        
        // Get primary location for school
        if (parent.schoolId && locationsBySchool.has(parent.schoolId)) {
          const schoolLocations = locationsBySchool.get(parent.schoolId);
          if (schoolLocations.length > 0) {
            // Use first active location as primary
            const primaryLocation = schoolLocations.find(loc => loc.isActive) || schoolLocations[0];
            child.locationId = primaryLocation.id;
          } else {
            child.locationId = null;
          }
        } else {
          child.locationId = null;
        }

        child.updatedAt = new Date().toISOString();
        updatedCount++;

        console.log(`✅ Updated ${child.firstName} ${child.lastName}: schoolId=${child.schoolId}, locationId=${child.locationId}`);
      } else {
        console.log(`⏭️ Skipped ${child.firstName} ${child.lastName}: already has location data`);
      }
    });

    // Backup original file
    const backupPath = `${childrenPath}.backup.${Date.now()}`;
    fs.copyFileSync(childrenPath, backupPath);
    console.log(`📁 Created backup: ${backupPath}`);

    // Write updated children data
    fs.writeFileSync(childrenPath, JSON.stringify(children, null, 2));
    console.log(`✅ Migration completed! Updated ${updatedCount} children with location inheritance`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateChildrenLocations();
}

export { migrateChildrenLocations };