import { getDb } from '../db';
import { customForms, customFormFields, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const TEMPLATE_FORMS = [
  {
    title: 'Candle Order Form',
    description: 'Pre-built template for selling handmade candles with scents, sizes, and quantities',
    formType: 'product_order',
    slug: 'candle-order-template',
    isTemplate: true,
    isActive: false,
    accessLevel: 'members',
    platformFeeType: 'percentage',
    platformFeeAmount: 1000,
    isAllLocations: true,
    fields: [
      {
        fieldType: 'product',
        label: 'Vanilla Bean Candle',
        order: 1,
        isRequired: false,
        fieldConfig: {
          price: 1500,
          description: 'Hand-poured vanilla scented candle',
          variants: [
            { name: 'Small (8oz)', price: 1500 },
            { name: 'Medium (12oz)', price: 2200 },
            { name: 'Large (16oz)', price: 2800 }
          ],
          maxQuantity: 10,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Lavender Dreams Candle',
        order: 2,
        isRequired: false,
        fieldConfig: {
          price: 1500,
          description: 'Calming lavender scented candle',
          variants: [
            { name: 'Small (8oz)', price: 1500 },
            { name: 'Medium (12oz)', price: 2200 },
            { name: 'Large (16oz)', price: 2800 }
          ],
          maxQuantity: 10,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Cinnamon Spice Candle',
        order: 3,
        isRequired: false,
        fieldConfig: {
          price: 1500,
          description: 'Warm cinnamon and spice blend',
          variants: [
            { name: 'Small (8oz)', price: 1500 },
            { name: 'Medium (12oz)', price: 2200 },
            { name: 'Large (16oz)', price: 2800 }
          ],
          maxQuantity: 10,
          imageUrl: ''
        }
      },
      {
        fieldType: 'textarea',
        label: 'Special Instructions',
        placeholder: 'Any special requests or notes?',
        order: 4,
        isRequired: false,
        fieldConfig: {}
      }
    ]
  },
  {
    title: 'Farm Fresh Products',
    description: 'Template for selling eggs, milk, and other dairy products',
    formType: 'product_order',
    slug: 'farm-fresh-template',
    isTemplate: true,
    isActive: false,
    accessLevel: 'members',
    platformFeeType: 'flat_per_item',
    platformFeeAmount: 50,
    isAllLocations: true,
    fields: [
      {
        fieldType: 'product',
        label: 'Farm Fresh Eggs',
        order: 1,
        isRequired: false,
        fieldConfig: {
          price: 600,
          description: 'Free-range chicken eggs (1 dozen)',
          variants: [
            { name: 'Regular Eggs (1 dozen)', price: 600 },
            { name: 'Organic Eggs (1 dozen)', price: 850 }
          ],
          maxQuantity: 5,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Fresh Whole Milk',
        order: 2,
        isRequired: false,
        fieldConfig: {
          price: 750,
          description: 'Raw whole milk from grass-fed cows',
          variants: [
            { name: 'Half Gallon', price: 750 },
            { name: 'Full Gallon', price: 1200 }
          ],
          maxQuantity: 4,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Artisan Butter',
        order: 3,
        isRequired: false,
        fieldConfig: {
          price: 900,
          description: 'Handcrafted butter from fresh cream',
          variants: [
            { name: 'Salted (1 lb)', price: 900 },
            { name: 'Unsalted (1 lb)', price: 900 }
          ],
          maxQuantity: 3,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Fresh Cheese',
        order: 4,
        isRequired: false,
        fieldConfig: {
          price: 1100,
          description: 'Locally made cheese varieties',
          variants: [
            { name: 'Cheddar (8oz)', price: 1100 },
            { name: 'Mozzarella (8oz)', price: 1200 },
            { name: 'Goat Cheese (6oz)', price: 1400 }
          ],
          maxQuantity: 3,
          imageUrl: ''
        }
      }
    ]
  },
  {
    title: 'Bakery Order Form',
    description: 'Template for selling fresh bread and baked goods',
    formType: 'product_order',
    slug: 'bakery-order-template',
    isTemplate: true,
    isActive: false,
    accessLevel: 'members',
    platformFeeType: 'percentage',
    platformFeeAmount: 800,
    isAllLocations: true,
    fields: [
      {
        fieldType: 'product',
        label: 'Sourdough Bread',
        order: 1,
        isRequired: false,
        fieldConfig: {
          price: 800,
          description: 'Traditional sourdough loaf',
          variants: [
            { name: 'Standard Loaf', price: 800 },
            { name: 'Large Loaf', price: 1200 }
          ],
          maxQuantity: 5,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Whole Wheat Bread',
        order: 2,
        isRequired: false,
        fieldConfig: {
          price: 700,
          description: '100% whole wheat bread',
          variants: [
            { name: 'Standard Loaf', price: 700 }
          ],
          maxQuantity: 5,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Cinnamon Rolls',
        order: 3,
        isRequired: false,
        fieldConfig: {
          price: 1200,
          description: 'Fresh baked cinnamon rolls',
          variants: [
            { name: '6-pack', price: 1200 },
            { name: '12-pack', price: 2200 }
          ],
          maxQuantity: 3,
          imageUrl: ''
        }
      },
      {
        fieldType: 'product',
        label: 'Chocolate Chip Cookies',
        order: 4,
        isRequired: false,
        fieldConfig: {
          price: 800,
          description: 'Homemade chocolate chip cookies',
          variants: [
            { name: 'Half Dozen', price: 800 },
            { name: 'Full Dozen', price: 1400 }
          ],
          maxQuantity: 5,
          imageUrl: ''
        }
      },
      {
        fieldType: 'date',
        label: 'Preferred Pickup Date',
        order: 5,
        isRequired: true,
        fieldConfig: {}
      }
    ]
  },
  {
    title: 'General Product Order',
    description: 'Blank product order template - add your own products',
    formType: 'product_order',
    slug: 'general-product-template',
    isTemplate: true,
    isActive: false,
    accessLevel: 'members',
    platformFeeType: 'none',
    platformFeeAmount: 0,
    isAllLocations: true,
    fields: [
      {
        fieldType: 'text',
        label: 'Customer Name',
        placeholder: 'Enter your full name',
        order: 1,
        isRequired: true,
        fieldConfig: {}
      },
      {
        fieldType: 'email',
        label: 'Email Address',
        placeholder: 'your@email.com',
        order: 2,
        isRequired: true,
        fieldConfig: {}
      },
      {
        fieldType: 'phone',
        label: 'Phone Number',
        placeholder: '(555) 123-4567',
        order: 3,
        isRequired: true,
        fieldConfig: {}
      }
    ]
  }
];

async function seedFormTemplates() {
  try {
    const db = await getDb();
    
    console.log('Starting form template seeding...');
    
    // Find the first admin user to be the creator
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`role IN ('superAdmin', 'admin', 'schoolAdmin')`)
      .limit(1);
    
    if (adminUsers.length === 0) {
      console.error('No admin user found. Please create an admin user first.');
      process.exit(1);
    }
    
    const adminUserId = adminUsers[0].id;
    
    console.log(`Using user ID ${adminUserId} as template creator`);
    
    for (const template of TEMPLATE_FORMS) {
      // Check if template already exists
      const existing = await db
        .select()
        .from(customForms)
        .where(and(
          eq(customForms.slug, template.slug),
          eq(customForms.isTemplate, true)
        ));
      
      if (existing.length > 0) {
        console.log(`Template "${template.title}" already exists, skipping...`);
        continue;
      }
      
      // Create the form
      const [newForm] = await db
        .insert(customForms)
        .values({
          title: template.title,
          description: template.description,
          formType: template.formType,
          slug: template.slug,
          isTemplate: template.isTemplate,
          isActive: template.isActive,
          accessLevel: template.accessLevel,
          platformFeeType: template.platformFeeType,
          platformFeeAmount: template.platformFeeAmount,
          isAllLocations: template.isAllLocations,
          allowedLocationIds: null,
          schoolId: 1, // Templates are school 1 by default, can be cloned to other schools
          createdBy: adminUserId,
          settings: {
            requireAuth: true,
            allowMultipleSubmissions: false,
            showProgressBar: true,
            confirmationMessage: "Thank you for your order! You will receive a confirmation email shortly.",
            redirectUrl: null,
            notifyOnSubmission: true,
            notificationEmails: [],
          },
          conditionalLogic: [],
        })
        .returning();
      
      console.log(`Created template form: ${template.title} (ID: ${newForm.id})`);
      
      // Create the fields
      for (const field of template.fields) {
        await db
          .insert(customFormFields)
          .values({
            formId: newForm.id,
            fieldType: field.fieldType as any,
            label: field.label,
            placeholder: 'placeholder' in field ? field.placeholder : null,
            helpText: null,
            order: field.order,
            isRequired: field.isRequired,
            fieldConfig: field.fieldConfig,
            validationRules: {},
          });
      }
      
      console.log(`  Added ${template.fields.length} fields`);
    }
    
    console.log('\nForm template seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding form templates:', error);
    process.exit(1);
  }
}

seedFormTemplates();
