import { readFileSync } from 'fs';
import { getDb } from './db';
import { locations, userLocations } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function migrateLocationsAndUserLocations() {
  console.log('🚀 Starting locations and user_locations migration...');
  
  try {
    const db = await getDb();

    // Read locations.json
    const locationsData = JSON.parse(readFileSync('data/locations.json', 'utf-8'));
    console.log(`📍 Found ${locationsData.length} locations to migrate`);

    // Insert locations
    for (const location of locationsData) {
      const { id, ...locationWithoutId } = location;
      const existingLocation = await db.select().from(locations).where(eq(locations.id, id));
      
      if (existingLocation.length === 0) {
        await db.insert(locations).values({
          id,
          ...locationWithoutId,
          createdAt: new Date(location.createdAt),
          updatedAt: new Date(location.updatedAt)
        });
        console.log(`✅ Migrated location ${id}: ${location.name}`);
      } else {
        console.log(`⏭️  Location ${id} already exists, skipping`);
      }
    }

    // Read user-locations.json
    const userLocationsData = JSON.parse(readFileSync('data/user-locations.json', 'utf-8'));
    console.log(`👤 Found ${userLocationsData.length} user locations to migrate`);

    // Get all valid location IDs from database
    const validLocations = await db.select().from(locations);
    const validLocationIds = new Set(validLocations.map(loc => loc.id));
    console.log(`📍 Valid location IDs in database: ${Array.from(validLocationIds).join(', ')}`);

    // Insert user locations (skip if references invalid location ID)
    let skippedCount = 0;
    for (const userLocation of userLocationsData) {
      const { id, ...userLocationWithoutId } = userLocation;
      
      // Check if location ID exists
      if (!validLocationIds.has(userLocation.locationId)) {
        console.log(`⚠️  Skipping user_location ${id}: references non-existent locationId=${userLocation.locationId}`);
        skippedCount++;
        continue;
      }
      
      const existingUserLocation = await db.select().from(userLocations).where(eq(userLocations.id, id));
      
      if (existingUserLocation.length === 0) {
        await db.insert(userLocations).values({
          id,
          ...userLocationWithoutId,
          assignedAt: new Date(userLocation.assignedAt),
          createdAt: new Date(userLocation.createdAt),
          updatedAt: new Date(userLocation.updatedAt)
        });
        console.log(`✅ Migrated user_location ${id}: userId=${userLocation.userId}, locationId=${userLocation.locationId}`);
      } else {
        console.log(`⏭️  User location ${id} already exists, skipping`);
      }
    }
    
    if (skippedCount > 0) {
      console.log(`⚠️  Skipped ${skippedCount} user_location records with invalid location references`);
    }

    console.log('✨ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateLocationsAndUserLocations();
