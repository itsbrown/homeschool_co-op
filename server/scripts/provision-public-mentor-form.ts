/**
 * Clone the Mentor / Educator Application template into an active public form per school.
 *
 * Prerequisites:
 *   - Code with file_upload + upload-attachment deployed
 *   - Template present: run `npx tsx server/scripts/seed-form-templates.ts` if missing
 *
 * Usage:
 *   npx tsx server/scripts/provision-public-mentor-form.ts --dry-run
 *   npx tsx server/scripts/provision-public-mentor-form.ts --school-id 2
 *   node scripts/with-prod-env.mjs -- npx tsx server/scripts/provision-public-mentor-form.ts
 */
import { getDb } from '../db';
import { customForms, customFormFields, schools } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const TEMPLATE_SLUG = 'mentor-application-template';
const LIVE_SLUG = 'mentor-application';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  let schoolId: number | undefined;
  const eqIdx = argv.findIndex((a) => a === '--school-id');
  if (eqIdx >= 0 && argv[eqIdx + 1]) {
    schoolId = parseInt(argv[eqIdx + 1], 10);
  }
  const inline = argv.find((a) => a.startsWith('--school-id='));
  if (inline) {
    schoolId = parseInt(inline.split('=')[1]!, 10);
  }
  return { dryRun, schoolId: Number.isFinite(schoolId) ? schoolId : undefined };
}

async function cloneTemplateForSchool(
  db: Awaited<ReturnType<typeof getDb>>,
  templateFormId: number,
  schoolId: number,
  createdBy: number,
  dryRun: boolean,
) {
  const [existing] = await db!
    .select()
    .from(customForms)
    .where(
      and(
        eq(customForms.schoolId, schoolId),
        eq(customForms.slug, LIVE_SLUG),
        eq(customForms.isTemplate, false),
      ),
    );

  if (existing) {
    console.log(
      `  School ${schoolId}: live form already exists (id=${existing.id}, active=${existing.isActive}, access=${existing.accessLevel})`,
    );
    if (!existing.isActive || existing.accessLevel !== 'public') {
      if (dryRun) {
        console.log('    [dry-run] would set isActive=true, accessLevel=public');
      } else {
        await db!
          .update(customForms)
          .set({ isActive: true, accessLevel: 'public', updatedAt: new Date() })
          .where(eq(customForms.id, existing.id));
        console.log('    Updated to active + public');
      }
    }
    return existing.id;
  }

  const [template] = await db!
    .select()
    .from(customForms)
    .where(eq(customForms.id, templateFormId));
  const templateFields = await db!
    .select()
    .from(customFormFields)
    .where(eq(customFormFields.formId, templateFormId))
    .orderBy(customFormFields.order);

  if (dryRun) {
    console.log(
      `  School ${schoolId}: [dry-run] would clone ${templateFields.length} fields → slug ${LIVE_SLUG}`,
    );
    return null;
  }

  const [newForm] = await db!
    .insert(customForms)
    .values({
      schoolId,
      title: template!.title,
      description: template!.description,
      slug: LIVE_SLUG,
      formType: template!.formType,
      isActive: true,
      isTemplate: false,
      accessLevel: 'public',
      allowedRoles: template!.allowedRoles,
      isAllLocations: template!.isAllLocations,
      allowedLocationIds: template!.allowedLocationIds,
      platformFeeType: template!.platformFeeType,
      platformFeeAmount: template!.platformFeeAmount,
      settings: template!.settings,
      conditionalLogic: template!.conditionalLogic,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  for (const field of templateFields) {
    await db!.insert(customFormFields).values({
      formId: newForm.id,
      fieldType: field.fieldType,
      label: field.label,
      placeholder: field.placeholder,
      helpText: field.helpText,
      order: field.order,
      isRequired: field.isRequired,
      fieldConfig: field.fieldConfig,
      validationRules: field.validationRules,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log(`  School ${schoolId}: created public form id=${newForm.id} slug=${LIVE_SLUG}`);
  return newForm.id;
}

async function main() {
  const { dryRun, schoolId: schoolIdFilter } = parseArgs(process.argv.slice(2));
  const db = await getDb();
  if (!db) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const [template] = await db
    .select()
    .from(customForms)
    .where(
      and(eq(customForms.slug, TEMPLATE_SLUG), eq(customForms.isTemplate, true)),
    );

  if (!template) {
    console.error(
      `Template "${TEMPLATE_SLUG}" not found. Run: npx tsx server/scripts/seed-form-templates.ts`,
    );
    process.exit(1);
  }

  let targetSchools: { id: number; name: string; adminId: number | null }[];
  if (schoolIdFilter) {
    const [row] = await db
      .select({ id: schools.id, name: schools.name, adminId: schools.adminId })
      .from(schools)
      .where(eq(schools.id, schoolIdFilter));
    if (!row) {
      console.error(`School id ${schoolIdFilter} not found`);
      process.exit(1);
    }
    targetSchools = [row];
  } else {
    targetSchools = await db
      .select({ id: schools.id, name: schools.name, adminId: schools.adminId })
      .from(schools);
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Provisioning "${LIVE_SLUG}" from template id=${template.id} for ${targetSchools.length} school(s)`,
  );

  for (const school of targetSchools) {
    const createdBy = school.adminId ?? template.createdBy;
    if (!createdBy) {
      console.warn(`  School ${school.id} (${school.name}): no adminId, skipping`);
      continue;
    }
    console.log(`School ${school.id}: ${school.name}`);
    await cloneTemplateForSchool(db, template.id, school.id, createdBy, dryRun);
  }

  if (!dryRun) {
    console.log('\nPublic URL pattern: /forms/mentor-application');
    console.log('Verify upload-attachment and submit after deploy.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
