import {
  buildEmergencyContactCsv,
  type EmergencyContactListRow,
} from "@shared/emergency-contact-resolve";

export function downloadEmergencyContactCsv(
  rows: EmergencyContactListRow[],
  filenamePrefix: string,
  options?: { includeClassColumn?: boolean },
) {
  const csv = buildEmergencyContactCsv(rows, options);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().split("T")[0];
  const safe = filenamePrefix.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  link.href = url;
  link.download = `${safe || "emergency_contacts"}_${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
