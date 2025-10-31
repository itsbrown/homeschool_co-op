import { readFileSync } from 'fs';
import { getDb } from './db';
import { locations, userLocations } from '../shared/schema';

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
      const existingLocation = await db.select().from(locations).where({ id });
      
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

    // Insert user locations
    for (const userLocation of userLocationsData) {
      const { id, ...userLocationWithoutId } = userLocation;
      const existingUserLocation = await db.select().from(userLocations).where({ id });
      
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

    console.log('✨ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateLocationsAndUserLocations();
