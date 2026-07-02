import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

export type StoreSignupRow = {
  id: string;
  kind: "program" | "product";
  enrollmentId: number | null;
  storeOrderId: number | null;
  orderNumber: string | null;
  orderStatus: string | null;
  signedUpAt: string;
  programName: string;
  programType: "class" | "session" | "product" | null;
  childName: string | null;
  childBirthdate: string | null;
  childGrade: string | null;
  parentName: string | null;
  parentEmail: string;
  parentPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  enrollmentStatus: string | null;
  waitlistPosition: number | null;
  totalCostCents: number;
  totalPaidCents: number;
  quantity: number | null;
  referralUserId: number | null;
  referralName: string | null;
  referralEmail: string | null;
};

type StatusFilter = "all" | "enrolled" | "waitlist" | "pending_payment" | "product";

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(row: StoreSignupRow) {
  if (row.kind === "product") {
    return <Badge variant="secondary">Product</Badge>;
  }
  if (row.enrollmentStatus === "waitlist") {
    return (
      <Badge variant="outline" className="text-amber-800 border-amber-300">
        Waitlist{row.waitlistPosition ? ` #${row.waitlistPosition}` : ""}
      </Badge>
    );
  }
  if (row.enrollmentStatus === "enrolled") {
    return <Badge className="bg-green-700">Enrolled</Badge>;
  }
  if (row.enrollmentStatus === "pending_payment") {
    return <Badge variant="outline">Pending payment</Badge>;
  }
  return <Badge variant="secondary">{row.enrollmentStatus ?? "—"}</Badge>;
}

function exportSignupsCsv(rows: StoreSignupRow[], filenamePrefix: string) {
  const headers = [
    "Signed up",
    "Type",
    "Program / product",
    "Child name",
    "Child date of birth",
    "Child grade",
    "Parent name",
    "Parent email",
    "Parent phone",
    "Emergency contact",
    "Emergency phone",
    "Emergency relationship",
    "Enrollment status",
    "Waitlist position",
    "Order number",
    "Order status",
    "Total (USD)",
    "Paid (USD)",
    "Quantity",
    "Referral user ID",
    "Referral name",
    "Referral email",
  ];

  const escape = (value: string | number | null | undefined) => {
    const str = value == null ? "" : String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const lines = rows.map((row) => {
    const type =
      row.kind === "product"
        ? "Product"
        : row.programType === "session"
          ? "Session"
          : "Class";
    return [
      escape(new Date(row.signedUpAt).toLocaleString()),
      escape(type),
      escape(row.programName),
      escape(row.childName),
      escape(row.childBirthdate),
      escape(row.childGrade),
      escape(row.parentName),
      escape(row.parentEmail),
      escape(row.parentPhone),
      escape(row.emergencyContactName),
      escape(row.emergencyContactPhone),
      escape(row.emergencyContactRelationship),
      escape(row.enrollmentStatus),
      escape(row.waitlistPosition),
      escape(row.orderNumber),
      escape(row.orderStatus),
      escape((row.totalCostCents / 100).toFixed(2)),
      escape((row.totalPaidCents / 100).toFixed(2)),
      escape(row.quantity),
      escape(row.referralUserId),
      escape(row.referralName),
      escape(row.referralEmail),
    ].join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filenamePrefix}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function StoreSignupsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: signups = [], isLoading } = useQuery<StoreSignupRow[]>({
    queryKey: ["/api/school-admin/public-store/signups"],
  });

  const programOptions = useMemo(() => {
    const names = new Set(signups.map((s) => s.programName).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [signups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return signups.filter((row) => {
      if (programFilter !== "all" && row.programName !== programFilter) return false;
      if (statusFilter === "product" && row.kind !== "product") return false;
      if (statusFilter === "enrolled" && row.enrollmentStatus !== "enrolled") return false;
      if (statusFilter === "waitlist" && row.enrollmentStatus !== "waitlist") return false;
      if (statusFilter === "pending_payment" && row.enrollmentStatus !== "pending_payment") {
        return false;
      }
      if (!q) return true;
      const haystack = [
        row.programName,
        row.childName,
        row.parentName,
        row.parentEmail,
        row.parentPhone,
        row.orderNumber,
        row.emergencyContactName,
        row.referralName,
        row.referralEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [signups, search, programFilter, statusFilter]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Adjust filters or wait for your first public store sign-up.",
        variant: "destructive",
      });
      return;
    }
    exportSignupsCsv(filtered, "store_signups");
    toast({ title: "Export downloaded", description: `${filtered.length} row(s) exported.` });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Sign-ups</CardTitle>
            <CardDescription>
              Families who registered through your public store — programs, waitlist, and merch.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
            data-testid="store-signups-export"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, program…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="store-signups-search"
            />
          </div>
          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="w-full sm:w-[220px]" data-testid="store-signups-program-filter">
              <SelectValue placeholder="All programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programs</SelectItem>
              {programOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="store-signups-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="enrolled">Enrolled</SelectItem>
              <SelectItem value="waitlist">Waitlist</SelectItem>
              <SelectItem value="pending_payment">Pending payment</SelectItem>
              <SelectItem value="product">Products only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading sign-ups…</p>
        ) : signups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sign-ups yet. When families complete checkout on your public store, they will appear
            here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sign-ups match your filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signed up</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Child</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Emergency</TableHead>
                  <TableHead>Referral</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} data-testid="store-signup-row">
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(row.signedUpAt)}
                      {row.orderNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5">#{row.orderNumber}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{row.programName}</p>
                      {row.quantity && row.quantity > 1 && (
                        <p className="text-xs text-muted-foreground">Qty {row.quantity}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.childName ? (
                        <>
                          <p>{row.childName}</p>
                          {(row.childGrade || row.childBirthdate) && (
                            <p className="text-xs text-muted-foreground">
                              {[row.childGrade, row.childBirthdate].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <p>{row.parentName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{row.parentEmail}</p>
                      {row.parentPhone && (
                        <p className="text-xs text-muted-foreground">{row.parentPhone}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.emergencyContactName ? (
                        <>
                          <p>{row.emergencyContactName}</p>
                          {row.emergencyContactPhone && (
                            <p className="text-xs text-muted-foreground">{row.emergencyContactPhone}</p>
                          )}
                          {row.emergencyContactRelationship && (
                            <p className="text-xs text-muted-foreground">
                              {row.emergencyContactRelationship}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.referralUserId ? (
                        <>
                          <p>{row.referralName ?? `User #${row.referralUserId}`}</p>
                          {row.referralEmail && (
                            <p className="text-xs text-muted-foreground">{row.referralEmail}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(row)}</TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {formatMoney(row.totalPaidCents)}
                      {row.totalCostCents > row.totalPaidCents && (
                        <p className="text-xs text-muted-foreground">
                          of {formatMoney(row.totalCostCents)}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {filtered.length} of {signups.length} sign-up{signups.length === 1 ? "" : "s"} shown.
          Program sign-ups also appear under{" "}
          <a href="/school-admin/enrollments" className="text-blue-700 underline">
            Enrollments
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}
