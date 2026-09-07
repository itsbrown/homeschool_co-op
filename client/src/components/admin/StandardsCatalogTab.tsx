import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { GRADE_LEVEL_OPTIONS } from "@shared/grade-levels";

export default function StandardsCatalogTab() {
  const [jurisdictionCode, setJurisdictionCode] = useState("");
  const [subject, setSubject] = useState<string>("ela");
  const [grade, setGrade] = useState<string>("");

  const { data: jurisdictionsData } = useQuery<{
    jurisdictions: Array<{
      code: string;
      name: string;
      hasStandardsData: boolean;
    }>;
    resolved: { code: string; name: string };
  }>({
    queryKey: ["/api/education-standards/jurisdictions"],
  });

  const activeJurisdiction =
    jurisdictionCode || jurisdictionsData?.resolved?.code || "US";

  const params = new URLSearchParams({ jurisdictionCode: activeJurisdiction });
  if (subject) params.set("subject", subject);
  if (grade) params.set("grade", grade);

  const { data, isLoading, error } = useQuery<{
    jurisdiction: { code: string; name: string };
    standards: Array<{
      id: number;
      code: string;
      title: string;
      description: string | null;
      gradeLevels: string[];
      subject: string;
      frameworkTitle: string;
    }>;
  }>({
    queryKey: [`/api/education-standards?${params.toString()}`],
  });

  const jurisdictionOptions = (jurisdictionsData?.jurisdictions || []).filter(
    (j) => j.hasStandardsData || j.code === "US" || j.code === "NY",
  );

  return (
    <div className="space-y-6" data-testid="standards-catalog-tab">
      <Card>
        <CardHeader>
          <CardTitle>Education standards catalog</CardTitle>
          <CardDescription>
            Browse curated state and national learning standards. Unseeded states fall back to
            National.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            <div className="space-y-1">
              <Label>Jurisdiction</Label>
              <Select value={activeJurisdiction} onValueChange={setJurisdictionCode}>
                <SelectTrigger data-testid="select-standards-jurisdiction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(jurisdictionOptions.length
                    ? jurisdictionOptions
                    : [
                        { code: "US", name: "National (US)", hasStandardsData: true },
                        { code: "NY", name: "New York", hasStandardsData: true },
                      ]
                  ).map((j) => (
                    <SelectItem key={j.code} value={j.code}>
                      {j.name}
                      {!j.hasStandardsData ? " (National fallback)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger data-testid="select-standards-subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ela">ELA</SelectItem>
                  <SelectItem value="math">Math</SelectItem>
                  <SelectItem value="science">Science</SelectItem>
                  <SelectItem value="social_studies">Social Studies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Grade</Label>
              <Select value={grade || "all"} onValueChange={(v) => setGrade(v === "all" ? "" : v)}>
                <SelectTrigger data-testid="select-standards-grade">
                  <SelectValue placeholder="All grades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All grades</SelectItem>
                  {GRADE_LEVEL_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {data?.jurisdiction && (
            <Badge variant="secondary" data-testid="badge-standards-jurisdiction">
              Showing: {data.jurisdiction.name}
            </Badge>
          )}

          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" data-testid="error-standards-catalog">
              Failed to load standards.
            </p>
          )}

          {!isLoading && !error && (
            <Table data-testid="standards-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Grades</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.standards || []).map((s) => (
                  <TableRow key={s.id} data-testid={`standard-row-${s.id}`}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{s.title}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {s.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {(s.gradeLevels || []).join(", ")}
                    </TableCell>
                    <TableCell className="uppercase text-xs">{s.subject}</TableCell>
                  </TableRow>
                ))}
                {!data?.standards?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No standards for this filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
