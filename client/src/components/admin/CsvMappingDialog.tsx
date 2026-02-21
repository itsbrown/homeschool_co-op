import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, AlertTriangle, FileSpreadsheet } from "lucide-react";

interface CsvColumn {
  name: string;
  sample: string;
}

interface MappingField {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

interface CsvMappingDialogProps {
  isOpen: boolean;
  columns: CsvColumn[];
  sampleData: any[];
  onClose: () => void;
  onConfirm: (mapping: Record<string, string>) => void;
}

const CLASS_FIELDS: MappingField[] = [
  { key: "title", label: "Class Name", required: true, description: "The name of the class" },
  { key: "description", label: "Description", required: false, description: "Detailed description of the class" },
  { key: "category", label: "Category", required: false, description: "Category key (e.g., academic, arts)" },
  { key: "categoryName", label: "Category Name / Program", required: false, description: "Program label (e.g., SPRING 2025 PROGRAM)" },
  { key: "price", label: "Price ($)", required: false, description: "Price in dollars (e.g., 150.00)" },
  { key: "capacity", label: "Max Students", required: false, description: "Maximum enrollment capacity" },
  { key: "startDate", label: "Start Date", required: false, description: "When the class starts (MM/DD/YYYY)" },
  { key: "endDate", label: "End Date", required: false, description: "When the class ends (MM/DD/YYYY)" },
  { key: "gradeLevels", label: "Grade Levels", required: false, description: "Grade range (e.g., K-5, 6-8)" },
  { key: "sessionDays", label: "Session Days", required: false, description: "Days of the week (e.g., Monday,Wednesday)" },
  { key: "durationWeeks", label: "Duration (weeks)", required: false, description: "How many weeks the class runs" },
  { key: "sessionsPerWeek", label: "Sessions Per Week", required: false, description: "Number of sessions each week" },
  { key: "sessionLengthMinutes", label: "Session Length (min)", required: false, description: "Duration of each session in minutes" },
  { key: "startTime", label: "Start Time", required: false, description: "Class start time (e.g., 09:00)" },
  { key: "endTime", label: "End Time", required: false, description: "Class end time (e.g., 12:00)" },
  { key: "instructorName", label: "Instructor", required: false, description: "Name of the instructor" },
  { key: "location", label: "Location", required: false, description: "Where the class is held" },
  { key: "subjects", label: "Subjects", required: false, description: "Topics covered" },
  { key: "learningObjectives", label: "Learning Objectives", required: false, description: "What students will learn" },
  { key: "materials", label: "Materials", required: false, description: "Required materials" },
];

function autoDetectMapping(columns: CsvColumn[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of CLASS_FIELDS) {
    const key = field.key.toLowerCase();
    const label = field.label.toLowerCase();

    const exactMatch = columns.find(
      (c) =>
        !used.has(c.name) &&
        (c.name.toLowerCase().trim() === key ||
          c.name.toLowerCase().trim() === label ||
          c.name.toLowerCase().trim().replace(/\s+/g, '') === key)
    );

    if (exactMatch) {
      mapping[field.key] = exactMatch.name;
      used.add(exactMatch.name);
      continue;
    }

    const partialMatch = columns.find((c) => {
      if (used.has(c.name)) return false;
      const cn = c.name.toLowerCase().trim();
      if (key === "title") return cn.includes("name") || cn.includes("title") || cn === "class";
      if (key === "price") return cn.includes("price") || cn.includes("cost") || cn.includes("fee") || cn.includes("tuition");
      if (key === "capacity") return cn.includes("capacity") || cn.includes("max") || cn.includes("size");
      if (key === "startdate") return cn.includes("start") && cn.includes("date");
      if (key === "enddate") return cn.includes("end") && cn.includes("date");
      if (key === "gradelevels") return cn.includes("grade") || cn.includes("level") || cn.includes("age");
      if (key === "instructorname") return cn.includes("instructor") || cn.includes("teacher");
      if (key === "sessiondays") return cn.includes("day") && !cn.includes("start") && !cn.includes("end");
      if (key === "description") return cn.includes("description") || cn.includes("detail");
      if (key === "category") return cn.includes("category") || cn.includes("type");
      if (key === "categoryname") return cn.includes("program") || cn.includes("term");
      if (key === "location") return cn.includes("location") || cn.includes("venue");
      if (key === "durationweeks") return cn.includes("duration") || cn.includes("weeks");
      if (key === "subjects") return cn.includes("subject") || cn.includes("topic");
      if (key === "starttime") return cn.includes("start") && cn.includes("time");
      if (key === "endtime") return cn.includes("end") && cn.includes("time");
      return false;
    });

    if (partialMatch) {
      mapping[field.key] = partialMatch.name;
      used.add(partialMatch.name);
    }
  }

  return mapping;
}

export function CsvMappingDialog({
  isOpen,
  columns,
  sampleData,
  onClose,
  onConfirm,
}: CsvMappingDialogProps) {
  const autoMapping = useMemo(() => autoDetectMapping(columns), [columns]);
  const [mapping, setMapping] = useState<Record<string, string>>(autoMapping);

  useEffect(() => {
    if (isOpen) {
      setMapping(autoDetectMapping(columns));
    }
  }, [isOpen, columns]);

  const handleChange = (field: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value === "__none__" ? "" : value,
    }));
  };

  const titleMapped = !!mapping.title;
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  const mappedFields = CLASS_FIELDS.filter((f) => mapping[f.key]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Map CSV Columns
          </DialogTitle>
          <DialogDescription>
            Match your CSV columns to class fields. We auto-detected{" "}
            <Badge variant="secondary" className="mx-1">{mappedCount}</Badge> matches.
            Only "Class Name" is required.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-6 pr-4">
            <div className="space-y-3">
              {CLASS_FIELDS.map((field) => (
                <div key={field.key} className="flex items-start gap-3">
                  <div className="w-44 shrink-0 pt-2">
                    <Label htmlFor={`field-${field.key}`} className="font-medium text-sm">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  </div>
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(val) => handleChange(field.key, val)}
                  >
                    <SelectTrigger id={`field-${field.key}`} className="flex-1">
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Skip --</SelectItem>
                      {columns.map((col) => (
                        <SelectItem key={col.name} value={col.name}>
                          {col.name}
                          {col.sample && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              ({col.sample.substring(0, 25)}{col.sample.length > 25 ? "..." : ""})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {sampleData.length > 0 && mappedFields.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Preview (first {Math.min(sampleData.length, 3)} rows, mapped fields only)
                </h4>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        {mappedFields.map((field) => (
                          <TableHead key={field.key} className="min-w-[100px] whitespace-nowrap text-xs">
                            {field.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sampleData.slice(0, 3).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          {mappedFields.map((field) => (
                            <TableCell key={field.key} className="text-xs max-w-[150px] truncate">
                              {row[mapping[field.key]] || (
                                <span className="text-muted-foreground italic">empty</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center gap-3 pt-4 border-t">
          {!titleMapped ? (
            <div className="flex items-center gap-2 text-amber-600 mr-auto">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Class Name must be mapped</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600 mr-auto">
              <Check className="h-4 w-4" />
              <span className="text-sm">{mappedCount} fields mapped</span>
            </div>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(mapping)} disabled={!titleMapped}>
            Import {sampleData.length > 0 ? `(${sampleData.length} rows)` : "Classes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
