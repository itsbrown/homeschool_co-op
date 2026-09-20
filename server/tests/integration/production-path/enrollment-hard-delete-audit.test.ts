import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";

/**
 * Jennifer Brew Fall #790/#791 were hard-deleted with no audit_logs row.
 * Parent cart-remove / cart-clear must snapshot before delete.
 */
describe("production-path: parent enrollment hard-delete audit", () => {
  const enrollmentsSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../api/enrollments.ts"),
    "utf8",
  );
  const adminSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../api/admin-enrollment-payment.ts"),
    "utf8",
  );

  it("parent unenroll and cart-clear write audit after a successful delete", () => {
    expect(enrollmentsSrc).toContain("logEnrollmentHardDelete");
    expect(enrollmentsSrc).toContain('"parent_unenroll"');
    expect(enrollmentsSrc).toContain('"parent_cancel_multiple"');
    expect(enrollmentsSrc).toContain('"parent_legacy_delete"');
  });

  it("admin enrollment delete also writes an audit snapshot", () => {
    expect(adminSrc).toContain("logEnrollmentHardDelete");
    expect(adminSrc).toContain("source: 'admin_delete'");
  });
});
