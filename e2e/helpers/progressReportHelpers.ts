import type { APIRequestContext } from "@playwright/test";
import { buildFullSkillChecksForBand } from "../../server/tests/helpers/quarterlyReportTestHelpers";
import { resolveProgressReportBand } from "../../server/lib/resolve-progress-report-band";
import { bearerAuthHeaders } from "./parentCheckoutHelpers";

export function currentSchoolYearLabel(): string {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Fills district checklist marks via API (SEL grid not in wizard UI yet). */
export async function completeQuarterlyRubricViaApi(
  request: APIRequestContext,
  token: string,
  childId: number,
  opts: {
    schoolYear: string;
    quarter: string;
    gradeLevel: string;
    approvedNarrative: string;
    asaCoopHours: number;
    homeInstructionHours: number;
    phonogramCount: number;
    quarterLabel?: string;
  },
): Promise<{ ok: boolean; status: number }> {
  const band = resolveProgressReportBand(opts.gradeLevel);
  const skillChecks = buildFullSkillChecksForBand(band);
  const response = await request.put(`/api/progress/quarterly-rubric/${childId}`, {
    headers: {
      ...bearerAuthHeaders(token),
      "Content-Type": "application/json",
    },
    data: {
      schoolYear: opts.schoolYear,
      quarter: opts.quarter,
      quarterLabel: opts.quarterLabel ?? `Fall ${opts.schoolYear}`,
      asaCoopHours: opts.asaCoopHours,
      homeInstructionHours: opts.homeInstructionHours,
      phonogramCount: opts.phonogramCount,
      approvedNarrative: opts.approvedNarrative,
      skillChecks,
    },
  });
  return { ok: response.ok(), status: response.status() };
}
