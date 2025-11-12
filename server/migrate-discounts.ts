import { readFileSync } from 'fs';
import { getDb } from './db';
import { discounts } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function migrateDiscounts() {
  console.log('💰 Starting discounts migration...');
  
  try {
    const db = await getDb();

    const discountsData = JSON.parse(readFileSync('data/discounts.json', 'utf-8'));
    console.log(`💰 Found ${discountsData.length} discounts to migrate`);

    for (const discount of discountsData) {
      const { id, ...discountWithoutId } = discount;
      const existingDiscount = await db.select().from(discounts).where(eq(discounts.id, id));
      
      if (existingDiscount.length === 0) {
        await db.insert(discounts).values({
          id,
          ...discountWithoutId,
          validFrom: discount.validFrom || null,
          validUntil: discount.validUntil || null,
          applicableToClasses: discount.applicableToClasses || [],
          applicableToCategories: discount.applicableToCategories || [],
          applicableToGradeLevels: discount.applicableToGradeLevels || [],
          createdAt: new Date(discount.createdAt),
          updatedAt: new Date(discount.updatedAt)
        });
        console.log(`✅ Migrated discount ${id}: ${discount.name}`);
      } else {
        console.log(`⏭️  Discount ${id} already exists, skipping`);
      }
    }

    console.log('✨ Discounts migration completed successfully!');
  } catch (error) {
    console.error('❌ Discounts migration failed:', error);
    process.exit(1);
  }
}

migrateDiscounts();
