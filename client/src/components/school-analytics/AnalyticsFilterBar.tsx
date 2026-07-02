import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AnalyticsFilterValues {
  from: string;
  to: string;
  locationId: string;
  grade: string;
  gender: string;
  ageBand: string;
  teacherId: string;
}

export const defaultAnalyticsFilters = (): AnalyticsFilterValues => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    locationId: "",
    grade: "",
    gender: "",
    ageBand: "",
    teacherId: "",
  };
};

export function buildAnalyticsQuery(filters: AnalyticsFilterValues): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.grade) params.set("grade", filters.grade);
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.ageBand) params.set("ageBand", filters.ageBand);
  if (filters.teacherId) params.set("teacherId", filters.teacherId);
  const q = params.toString();
  return q ? `?${q}` : "";
}

interface AnalyticsFilterBarProps {
  filters: AnalyticsFilterValues;
  onChange: (next: AnalyticsFilterValues) => void;
  locations?: { id: number; name: string }[];
  showSchoolYear?: boolean;
  schoolYear?: string;
  onSchoolYearChange?: (y: string) => void;
}

const AGE_BANDS = [
  { value: "prek_k", label: "PreK–K (4–5)" },
  { value: "grades_1_3", label: "Grades 1–3" },
  { value: "grades_4_8", label: "Grades 4–8" },
  { value: "grades_9_12", label: "Grades 9–12" },
];

export function AnalyticsFilterBar({
  filters,
  onChange,
  locations = [],
  showSchoolYear,
  schoolYear,
  onSchoolYearChange,
}: AnalyticsFilterBarProps) {
  const set = (patch: Partial<AnalyticsFilterValues>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/30">
      {showSchoolYear && (
        <div className="space-y-1">
          <Label>School year</Label>
          <Input
            value={schoolYear || ""}
            onChange={(e) => onSchoolYearChange?.(e.target.value)}
            placeholder="2025-2026"
          />
        </div>
      )}
      <div className="space-y-1">
        <Label>From</Label>
        <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>To</Label>
        <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Select value={filters.locationId || "all"} onValueChange={(v) => set({ locationId: v === "all" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Grade</Label>
        <Input
          value={filters.grade}
          onChange={(e) => set({ grade: e.target.value })}
          placeholder="e.g. 3"
        />
      </div>
      <div className="space-y-1">
        <Label>Gender</Label>
        <Select value={filters.gender || "all"} onValueChange={(v) => set({ gender: v === "all" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Age band</Label>
        <Select value={filters.ageBand || "all"} onValueChange={(v) => set({ ageBand: v === "all" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="All ages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            {AGE_BANDS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
