import { getDb } from '../db';
import { customForms, customFormFields, users, schools } from '@shared/schema';
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
  },
  {
    title: 'Mentor / Educator Application',
    description:
      'Application for prospective mentors and educators. Collects contact info, education background, classroom experience, resume upload, and a brief civic knowledge check.',
    formType: 'custom',
    slug: 'mentor-application-template',
    isTemplate: true,
    isActive: false,
    accessLevel: 'public',
    platformFeeType: 'none',
    platformFeeAmount: 0,
    isAllLocations: true,
    fields: [
      { fieldType: 'text', label: 'First Name', placeholder: 'Jane', order: 1, isRequired: true, fieldConfig: {} },
      { fieldType: 'text', label: 'Last Name', placeholder: 'Smith', order: 2, isRequired: true, fieldConfig: {} },
      { fieldType: 'email', label: 'Email Address', placeholder: 'you@email.com', order: 3, isRequired: true, fieldConfig: {} },
      { fieldType: 'phone', label: 'Phone Number', placeholder: '(555) 123-4567', order: 4, isRequired: true, fieldConfig: {} },
      { fieldType: 'text', label: 'City', placeholder: 'Your city', order: 5, isRequired: true, fieldConfig: {} },
      { fieldType: 'text', label: 'State', placeholder: 'NY', order: 6, isRequired: true, fieldConfig: {} },
      {
        fieldType: 'dropdown',
        label: 'Position applying for',
        order: 7,
        isRequired: true,
        fieldConfig: {
          options: ['Mentor', 'Lead Mentor', 'Classroom Educator', 'Assistant Educator', 'Substitute'],
        },
      },
      {
        fieldType: 'dropdown',
        label: 'Highest level of education completed',
        order: 8,
        isRequired: true,
        fieldConfig: {
          options: [
            'High school diploma / GED',
            'Some college',
            "Associate's degree",
            "Bachelor's degree",
            "Master's degree",
            'Doctorate / professional degree',
          ],
        },
      },
      {
        fieldType: 'text',
        label: 'Degree(s) and field(s) of study',
        placeholder: 'e.g. B.A. History, M.Ed. Elementary Education',
        order: 9,
        isRequired: true,
        fieldConfig: {},
      },
      {
        fieldType: 'multi_checkbox',
        label: 'Teaching certifications or credentials (select all that apply)',
        order: 10,
        isRequired: false,
        fieldConfig: {
          options: [
            'State teaching license',
            'Substitute teaching permit',
            'Homeschool co-op / private school experience',
            'Tutoring certification',
            'None / in progress',
          ],
        },
      },
      {
        fieldType: 'dropdown',
        label: 'Years of classroom teaching experience',
        order: 11,
        isRequired: true,
        fieldConfig: {
          options: ['None', 'Less than 1 year', '1–2 years', '3–5 years', '6–10 years', 'More than 10 years'],
        },
      },
      {
        fieldType: 'multi_checkbox',
        label: 'Grade levels you have taught or mentored (select all that apply)',
        order: 12,
        isRequired: true,
        fieldConfig: {
          options: ['Pre-K / Kindergarten', 'Elementary (1–5)', 'Middle school (6–8)', 'High school (9–12)', 'Mixed ages'],
        },
      },
      {
        fieldType: 'multi_checkbox',
        label: 'Subjects you are comfortable teaching (select all that apply)',
        order: 13,
        isRequired: true,
        fieldConfig: {
          options: [
            'Language arts / literature',
            'Mathematics',
            'Science',
            'History / social studies',
            'Civics / government',
            'Fine arts',
            'Life skills / enrichment',
          ],
        },
      },
      {
        fieldType: 'textarea',
        label: 'Describe your classroom or mentoring experience',
        placeholder:
          'Include settings (co-op, private, public, homeschool), ages taught, and your approach to instruction.',
        order: 14,
        isRequired: true,
        fieldConfig: {},
      },
      {
        fieldType: 'textarea',
        label: 'Why do you want to serve as a mentor/educator with our program?',
        order: 15,
        isRequired: true,
        fieldConfig: {},
      },
      {
        fieldType: 'file_upload',
        label: 'Resume (PDF or Word)',
        order: 16,
        isRequired: true,
        fieldConfig: { accept: '.pdf,.doc,.docx' },
      },
      {
        fieldType: 'radio',
        label: 'Civic knowledge: The U.S. Constitution begins with which phrase?',
        order: 17,
        isRequired: true,
        fieldConfig: {
          options: ['We the People', 'Four score and seven years ago', 'In God We Trust', 'E pluribus unum'],
        },
      },
      {
        fieldType: 'radio',
        label: 'Civic knowledge: How many branches are in the U.S. federal government?',
        order: 18,
        isRequired: true,
        fieldConfig: { options: ['One', 'Two', 'Three', 'Four'] },
      },
      {
        fieldType: 'radio',
        label: 'Civic knowledge: The Declaration of Independence was adopted in which year?',
        order: 19,
        isRequired: true,
        fieldConfig: { options: ['1492', '1776', '1787', '1865'] },
      },
      {
        fieldType: 'radio',
        label: 'Civic knowledge: The First Amendment primarily protects',
        order: 20,
        isRequired: true,
        fieldConfig: {
          options: [
            'The right to bear arms',
            'Freedom of speech, religion, press, assembly, and petition',
            'Voting rights for all citizens at age 16',
            'Presidential term limits',
          ],
        },
      },
      {
        fieldType: 'radio',
        label: 'Civic knowledge: How many stars are on the current U.S. flag?',
        order: 21,
        isRequired: true,
        fieldConfig: { options: ['13', '48', '50', '52'] },
      },
      {
        fieldType: 'checkbox',
        label:
          'I affirm that I support teaching foundational American history, civics, and patriotic principles as part of a well-rounded education.',
        order: 22,
        isRequired: true,
        fieldConfig: {},
      },
      {
        fieldType: 'checkbox',
        label:
          'I certify that the information provided is accurate to the best of my knowledge.',
        order: 23,
        isRequired: true,
        fieldConfig: {},
      },
    ],
  },
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

    const [templateSchool] = await db.select({ id: schools.id }).from(schools).limit(1);
    if (!templateSchool) {
      console.error('No school found. Create a school before seeding templates.');
      process.exit(1);
    }
    const templateSchoolId = templateSchool.id;
    
    console.log(`Using user ID ${adminUserId} as template creator, school ID ${templateSchoolId} for templates`);
    
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
          schoolId: templateSchoolId,
          createdBy: adminUserId,
          settings: template.formType === 'custom'
            ? {
                requireAuth: false,
                allowMultipleSubmissions: false,
                showProgressBar: true,
                confirmationMessage:
                  'Thank you for applying! We have received your mentor/educator application and will be in touch.',
                redirectUrl: null,
                notifyOnSubmission: true,
                notificationEmails: [],
              }
            : {
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
