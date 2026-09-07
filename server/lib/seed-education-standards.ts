import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import {
  educationJurisdictions,
  educationStandardFrameworks,
  educationStandards,
  educationKpiThresholds,
} from "../../shared/schema";
import {
  US_ELA_STANDARDS,
  US_MATH_STANDARDS,
  US_LEXILE_KPI,
  NY_ELA_STANDARDS,
  NY_MATH_STANDARDS,
  NY_LEXILE_KPI,
  type SeedStandard,
  type SeedKpi,
} from "../data/education-standards/seed-data";

async function upsertJurisdiction(code: string, name: string, kind: "national" | "state", reportTemplateKey: string | null) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(educationJurisdictions)
    .where(eq(educationJurisdictions.code, code))
    .limit(1);

  if (existing) {
    await db
      .update(educationJurisdictions)
      .set({
        name,
        kind,
        isActive: true,
        reportTemplateKey,
        updatedAt: new Date(),
      })
      .where(eq(educationJurisdictions.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(educationJurisdictions)
    .values({ code, name, kind, isActive: true, reportTemplateKey })
    .returning({ id: educationJurisdictions.id });
  return row.id;
}

async function upsertFramework(
  jurisdictionId: number,
  subject: "ela" | "math",
  title: string,
  version: string,
  sourceLabel: string,
  effectiveYear: number,
) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(educationStandardFrameworks)
    .where(
      and(
        eq(educationStandardFrameworks.jurisdictionId, jurisdictionId),
        eq(educationStandardFrameworks.subject, subject),
        eq(educationStandardFrameworks.version, version),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(educationStandardFrameworks)
      .set({ title, sourceLabel, effectiveYear })
      .where(eq(educationStandardFrameworks.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(educationStandardFrameworks)
    .values({
      jurisdictionId,
      subject,
      title,
      version,
      sourceLabel,
      effectiveYear,
    })
    .returning({ id: educationStandardFrameworks.id });
  return row.id;
}

async function upsertStandards(frameworkId: number, standards: SeedStandard[]) {
  const db = await getDb();
  for (const s of standards) {
    const [existing] = await db
      .select({ id: educationStandards.id })
      .from(educationStandards)
      .where(and(eq(educationStandards.frameworkId, frameworkId), eq(educationStandards.code, s.code)))
      .limit(1);

    if (existing) {
      await db
        .update(educationStandards)
        .set({
          title: s.title,
          description: s.description,
          gradeLevels: s.gradeLevels,
          sortOrder: s.sortOrder,
        })
        .where(eq(educationStandards.id, existing.id));
    } else {
      await db.insert(educationStandards).values({
        frameworkId,
        code: s.code,
        title: s.title,
        description: s.description,
        gradeLevels: s.gradeLevels,
        sortOrder: s.sortOrder,
      });
    }
  }
}

async function upsertKpiThresholds(jurisdictionId: number, rows: SeedKpi[]) {
  const db = await getDb();
  for (const row of rows) {
    const [existing] = await db
      .select({ id: educationKpiThresholds.id })
      .from(educationKpiThresholds)
      .where(
        and(
          eq(educationKpiThresholds.jurisdictionId, jurisdictionId),
          eq(educationKpiThresholds.subject, "ela"),
          eq(educationKpiThresholds.metric, "lexile"),
          eq(educationKpiThresholds.gradeLevel, row.gradeLevel),
        ),
      )
      .limit(1);

    const values = {
      jurisdictionId,
      subject: "ela" as const,
      metric: "lexile" as const,
      gradeLevel: row.gradeLevel,
      belowMax: row.belowMax,
      atMin: row.atMin,
      atMax: row.atMax,
      aboveMin: row.aboveMin,
      sourceNote: row.sourceNote,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(educationKpiThresholds).set(values).where(eq(educationKpiThresholds.id, existing.id));
    } else {
      await db.insert(educationKpiThresholds).values(values);
    }
  }
}

/** Idempotent seed of US National + NY frameworks, standards, and Lexile KPI thresholds. */
export async function seedEducationStandards(): Promise<void> {
  const usId = await upsertJurisdiction("US", "National (US)", "national", null);
  const nyId = await upsertJurisdiction("NY", "New York", "state", "ny-ihip-quarterly");

  const usElaFw = await upsertFramework(
    usId,
    "ela",
    "Common Core ELA (ASA curated anchors)",
    "ccss-asa-v1",
    "CCSS ELA — curated for ASA analytics",
    2026,
  );
  const usMathFw = await upsertFramework(
    usId,
    "math",
    "Common Core Math (ASA curated anchors)",
    "ccss-asa-v1",
    "CCSS Math — curated for ASA analytics",
    2026,
  );
  await upsertStandards(usElaFw, US_ELA_STANDARDS);
  await upsertStandards(usMathFw, US_MATH_STANDARDS);
  await upsertKpiThresholds(usId, US_LEXILE_KPI);

  const nyElaFw = await upsertFramework(
    nyId,
    "ela",
    "NY Next Generation ELA (ASA curated anchors)",
    "ny-ngls-asa-v1",
    "NYSED Next Generation ELA — curated for ASA",
    2026,
  );
  const nyMathFw = await upsertFramework(
    nyId,
    "math",
    "NY Next Generation Math (ASA curated anchors)",
    "ny-ngls-asa-v1",
    "NYSED Next Generation Math — curated for ASA",
    2026,
  );
  await upsertStandards(nyElaFw, NY_ELA_STANDARDS);
  await upsertStandards(nyMathFw, NY_MATH_STANDARDS);
  await upsertKpiThresholds(nyId, NY_LEXILE_KPI);
}
