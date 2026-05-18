import { sql } from 'drizzle-orm';
import { payments } from '@shared/schema';

/** Ledger payment belongs to this school via school_id or enrollment linkage */
export function schoolScopedLedgerPayments(schoolId: number) {
  return sql`(
    ${payments.schoolId} = ${schoolId}
    OR EXISTS (
      SELECT 1
      FROM program_enrollments pe
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(${payments.enrollmentIds}, '[]'::jsonb)) AS enr(elem)
      WHERE pe.school_id = ${schoolId}
        AND pe.id = (enr.elem)::text::int
    )
  )`;
}
