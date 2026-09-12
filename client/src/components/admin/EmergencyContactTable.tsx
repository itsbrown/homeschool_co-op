import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { hasEmergencyPhone, type EmergencyContactListRow } from "@shared/emergency-contact-resolve";

export function EmergencyContactTable({
  rows,
  showClass = true,
  emptyLabel = "No students on this list.",
  testId,
}: {
  rows: EmergencyContactListRow[];
  showClass?: boolean;
  emptyLabel?: string;
  testId?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center" data-testid={testId}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Grade</TableHead>
            {showClass && <TableHead>Class</TableHead>}
            <TableHead>Parent / Guardian</TableHead>
            <TableHead>Parent Phone</TableHead>
            <TableHead>Emergency Contact</TableHead>
            <TableHead>Emergency Phone</TableHead>
            <TableHead>Relationship</TableHead>
            <TableHead className="print:hidden">Allergies</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const missing = !hasEmergencyPhone(row);
            return (
              <TableRow
                key={`${row.childId}-${row.classes.map((c) => c.id).join("-")}`}
                data-testid={`emergency-contact-row-${row.childId}`}
              >
                <TableCell className="font-medium">
                  {row.firstName} {row.lastName}
                  {missing && (
                    <Badge
                      variant="outline"
                      className="ml-2 text-[10px] print:hidden"
                      data-testid={`badge-missing-contact-${row.childId}`}
                    >
                      Missing phone
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{row.gradeLevel || "—"}</TableCell>
                {showClass && (
                  <TableCell className="max-w-[200px] text-sm">
                    {row.classes.length > 0
                      ? row.classes.map((c) => c.title).join(", ")
                      : "—"}
                  </TableCell>
                )}
                <TableCell>
                  <div>{row.parentName || "—"}</div>
                  {row.parentEmail && (
                    <div className="text-xs text-muted-foreground print:hidden">
                      {row.parentEmail}
                    </div>
                  )}
                </TableCell>
                <TableCell>{row.parentPhone || "—"}</TableCell>
                <TableCell>{row.emergencyContactName || "—"}</TableCell>
                <TableCell className={missing ? "text-amber-700 font-medium" : undefined}>
                  {row.emergencyContactPhone || "—"}
                </TableCell>
                <TableCell>{row.emergencyContactRelationship || "—"}</TableCell>
                <TableCell className="print:hidden max-w-[180px] text-sm">
                  {row.allergies || "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
