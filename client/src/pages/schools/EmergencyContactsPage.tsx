import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { AlertTriangle, Download, Phone, Printer, Search, Users } from "lucide-react";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { EmergencyContactTable } from "@/components/admin/EmergencyContactTable";
import { downloadEmergencyContactCsv } from "@/lib/emergency-contact-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type EmergencyContactListsPayload } from "@shared/emergency-contact-resolve";

function matchesQuery(
  row: EmergencyContactListsPayload["schoolList"][number],
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [
    row.firstName,
    row.lastName,
    row.parentName,
    row.parentPhone,
    row.parentEmail,
    row.emergencyContactName,
    row.emergencyContactPhone,
    row.gradeLevel,
    ...row.classes.map((c) => c.title),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default function EmergencyContactsPage() {
  const search = useSearch();
  const classIdFromUrl = new URLSearchParams(search).get("classId");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState(classIdFromUrl || "all");
  const [tab, setTab] = useState(classIdFromUrl ? "classes" : "school");

  const { data, isLoading, error } = useQuery<EmergencyContactListsPayload>({
    queryKey: ["/api/school-admin/emergency-contacts"],
  });

  const normalizedQuery = query.trim().toLowerCase();
  const schoolRows = useMemo(() => {
    const rows = data?.schoolList ?? [];
    return rows.filter((row) => {
      if (classFilter !== "all" && !row.classes.some((c) => String(c.id) === classFilter)) {
        return false;
      }
      return matchesQuery(row, normalizedQuery);
    });
  }, [data?.schoolList, classFilter, normalizedQuery]);

  const classLists = useMemo(() => {
    const lists = data?.classes ?? [];
    return lists
      .filter((cls) => classFilter === "all" || String(cls.classId) === classFilter)
      .map((cls) => ({
        ...cls,
        students: cls.students.filter((row) => matchesQuery(row, normalizedQuery)),
      }));
  }, [data?.classes, classFilter, normalizedQuery]);

  const handlePrint = () => window.print();

  return (
    <SchoolAdminLayout pageTitle="Emergency Contacts">
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold">Emergency Contacts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Whole-school list plus a printable sheet for each current class.
              Active seats only (enrolled and pending approval).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!data}
              data-testid="button-print-emergency-contacts"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadEmergencyContactCsv(
                  schoolRows,
                  `${data?.school.name || "school"}_emergency_contacts`,
                )
              }
              disabled={schoolRows.length === 0}
              data-testid="button-export-school-emergency-csv"
            >
              <Download className="mr-2 h-4 w-4" />
              Export school CSV
            </Button>
          </div>
        </div>

        <div className="hidden print:block">
          <h1 className="text-2xl font-bold">
            {data?.school.name || "School"} — Emergency Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            Printed {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : ""}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error || !data ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Could not load emergency contacts.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Students</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="text-2xl font-bold" data-testid="text-emergency-student-count">
                    {data.totals.students}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Classes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-emergency-class-count">
                    {data.totals.classes}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing phones</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <div className="text-2xl font-bold" data-testid="text-emergency-missing-count">
                    {data.totals.missingContacts}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">School</CardTitle>
                </CardHeader>
                <CardContent className="text-sm font-medium truncate">
                  {data.school.name}
                </CardContent>
              </Card>
            </div>

            <Card className="print:hidden">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search student, parent, or phone"
                      className="pl-9"
                      style={{ fontSize: "16px" }}
                      data-testid="input-emergency-contact-search"
                    />
                  </div>
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger data-testid="select-emergency-class-filter" style={{ fontSize: "16px" }}>
                      <SelectValue placeholder="All classes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {data.classes.map((cls) => (
                        <SelectItem key={cls.classId} value={String(cls.classId)}>
                          {cls.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
              <TabsList className="print:hidden">
                <TabsTrigger value="school" data-testid="tab-emergency-school">
                  Whole school
                </TabsTrigger>
                <TabsTrigger value="classes" data-testid="tab-emergency-classes">
                  By class
                </TabsTrigger>
              </TabsList>

              <TabsContent value="school" className="space-y-4">
                <Card className="print:shadow-none print:border-0">
                  <CardHeader className="print:pb-2">
                    <CardTitle>Whole school</CardTitle>
                    <CardDescription>
                      One row per seated student. A child in two classes appears once here.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmergencyContactTable
                      rows={schoolRows}
                      testId="table-school-emergency-contacts"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="classes" className="space-y-6">
                {classLists.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      No current classes match this filter.
                    </CardContent>
                  </Card>
                ) : (
                  classLists.map((cls) => (
                    <Card
                      key={cls.classId}
                      className="print:shadow-none print:border print:break-after-page"
                      data-testid={`card-class-emergency-${cls.classId}`}
                    >
                      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {cls.title}
                            {cls.locationName && (
                              <Badge variant="secondary">{cls.locationName}</Badge>
                            )}
                          </CardTitle>
                          <CardDescription>
                            {cls.studentCount} {cls.studentCount === 1 ? "student" : "students"}
                            {cls.missingContactCount > 0
                              ? ` · ${cls.missingContactCount} missing emergency phone`
                              : ""}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2 print:hidden">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              downloadEmergencyContactCsv(
                                cls.students,
                                `${cls.title}_emergency_contacts`,
                                { includeClassColumn: false },
                              )
                            }
                            disabled={cls.students.length === 0}
                            data-testid={`button-export-class-emergency-csv-${cls.classId}`}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            CSV
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/schools/classes/${cls.classId}`}>
                              Class page
                            </Link>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <EmergencyContactTable
                          rows={cls.students}
                          showClass={false}
                          emptyLabel="No students enrolled in this class."
                          testId={`table-class-emergency-${cls.classId}`}
                        />
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        <p className="hidden print:flex items-center gap-2 text-xs text-muted-foreground pt-4">
          <Phone className="h-3 w-3" />
          Keep this list with attendance folders. Do not post publicly.
        </p>
      </div>
    </SchoolAdminLayout>
  );
}
