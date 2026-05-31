import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatClassSchedule } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, MapPin, Building2, ChevronDown, ChevronRight, Users } from "lucide-react";
import { UserLookup, type UserResult } from "@/components/ui/user-lookup";

interface Location {
  id: number;
  name: string;
  code: string;
}

interface ScheduleVariant {
  id: string;
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  price: number;
}

interface ClassInfo {
  id: number;
  title: string;
  schedule?: string | { variants: ScheduleVariant[] };
  enrollmentCount?: number;
}

interface StaffPosition {
  id: number;
  title: string;
  description?: string;
  isDefault: boolean;
  schoolId?: number;
}

export interface TargetingState {
  includeAll: boolean;
  selectedUsers: UserResult[];
  selectedRoles: string[];
  selectedLocations: number[];
  selectedClasses: number[];
  deliveryType: string;
  priority: string;
}

interface NotificationTargetingPanelProps {
  value: TargetingState;
  onChange: (state: TargetingState) => void;
  showDeliveryOptions?: boolean;
  showPriorityOption?: boolean;
}

export function NotificationTargetingPanel({
  value,
  onChange,
  showDeliveryOptions = true,
  showPriorityOption = true,
}: NotificationTargetingPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    individual: true,
    role: false,
    location: false,
    class: false,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: schoolClassesData } = useQuery<{ items: ClassInfo[]; total: number }>({
    queryKey: ["/api/school-admin/classes"],
  });
  const classes = schoolClassesData?.items || [];

  const { data: labelOptions } = useQuery<{ system: string[]; custom: string[] }>({
    queryKey: ["/api/school-admin/users/label-options"],
  });

  const { data: staffPositions = [] } = useQuery<StaffPosition[]>({
    queryKey: ["/api/school-admin/staff-positions"],
  });

  const systemRoles = labelOptions?.system ?? [
    "parent",
    "educator",
    "teacher",
    "director",
    "schoolAdmin",
  ];
  const customRoles =
    labelOptions?.custom?.length
      ? labelOptions.custom
      : staffPositions.map((p) => p.title);
  const roles = [...systemRoles, ...customRoles];

  const update = (partial: Partial<TargetingState>) => {
    onChange({ ...value, ...partial });
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleIncludeAllChange = (checked: boolean) => {
    if (checked) {
      update({
        includeAll: true,
        selectedUsers: [],
        selectedRoles: [],
        selectedLocations: [],
        selectedClasses: [],
      });
      setOpenSections({ individual: false, role: false, location: false, class: false });
    } else {
      update({ includeAll: false });
    }
  };

  const smsMissing = value.selectedUsers.filter((u) => !u.phone);

  const showSmsWarning = value.deliveryType === "sms" || value.deliveryType === "all";

  const activeBadges: { label: string; count: number }[] = [];
  if (value.selectedUsers.length > 0)
    activeBadges.push({ label: "individual", count: value.selectedUsers.length });
  if (value.selectedRoles.length > 0)
    activeBadges.push({ label: "role", count: value.selectedRoles.length });
  if (value.selectedLocations.length > 0)
    activeBadges.push({ label: "location", count: value.selectedLocations.length });
  if (value.selectedClasses.length > 0)
    activeBadges.push({ label: "class", count: value.selectedClasses.length });

  const totalUniqueGroups = activeBadges.length;

  const SectionHeader = ({
    id,
    label,
    badgeCount,
  }: {
    id: string;
    label: string;
    badgeCount?: number;
  }) => (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
      onClick={() => toggleSection(id)}
    >
      <span className="flex items-center gap-2">
        {label}
        {badgeCount !== undefined && badgeCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {badgeCount} selected
          </Badge>
        )}
      </span>
      {openSections[id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="grid gap-4">
      {showDeliveryOptions && (
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Delivery Method</Label>
            <Select
              value={value.deliveryType}
              onValueChange={(v) => update({ deliveryType: v })}
            >
              <SelectTrigger style={{ fontSize: "16px" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">In-App Only</SelectItem>
                <SelectItem value="email">Email Only</SelectItem>
                <SelectItem value="sms">SMS Only</SelectItem>
                <SelectItem value="both">Email + In-App</SelectItem>
                <SelectItem value="all">All (Email + SMS + In-App)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showPriorityOption && (
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select
                value={value.priority}
                onValueChange={(v) => update({ priority: v })}
              >
                <SelectTrigger style={{ fontSize: "16px" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <Label>Target Recipients</Label>

        {/* Broadcast control stays here (not only inside a collapsible) so it is not missed. */}
        <div className="rounded-md border border-orange-200 bg-orange-50/90 p-3 space-y-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="include-all-primary"
              className="mt-0.5"
              checked={value.includeAll}
              onCheckedChange={(checked) => handleIncludeAllChange(checked === true)}
            />
            <div className="space-y-1 min-w-0">
              <Label htmlFor="include-all-primary" className="text-sm font-semibold text-orange-900 cursor-pointer">
                Send to everyone (broadcast)
              </Label>
              <p className="text-xs text-orange-900/85 leading-relaxed">
                Delivers to all users in the system for this deployment. Clears other targeting when checked.
                For smaller groups, leave this off and use Individuals, Roles, Locations, or Classes below.
              </p>
            </div>
          </div>
        </div>

        {/* Active selection summary */}
        {!value.includeAll && activeBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <span className="text-sm font-medium text-blue-800 w-full mb-1 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Active targeting ({totalUniqueGroups} group{totalUniqueGroups !== 1 ? "s" : ""}):
            </span>
            {activeBadges.map(({ label, count }) => (
              <Badge key={label} variant="default" className="capitalize">
                {count} {label}{count !== 1 ? (label === "class" ? "es" : "s") : ""}
              </Badge>
            ))}
          </div>
        )}
        {value.includeAll && (
          <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <Badge variant="destructive">Everyone</Badge>
            <span className="text-sm text-orange-800">Broadcasting to all users</span>
          </div>
        )}

        <div className="grid gap-2">
          {/* Individual Section */}
          <div className="border rounded-md overflow-hidden">
            <SectionHeader
              id="individual"
              label="Individual Users"
              badgeCount={value.selectedUsers.length}
            />
            {openSections.individual && !value.includeAll && (
              <div className="p-3 space-y-3 border-t">
                <div className="grid gap-2">
                  <Label>Select Recipients</Label>
                  <UserLookup
                    value={value.selectedUsers}
                    onChange={(users) => update({ selectedUsers: users })}
                    placeholder="Search for users by name or email..."
                    multiSelect={true}
                    modalTitle="Select Notification Recipients"
                  />
                  {value.selectedUsers.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {value.selectedUsers.length} recipient
                      {value.selectedUsers.length !== 1 ? "s" : ""} selected
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Search and select specific users to notify
                    </p>
                  )}
                  {showSmsWarning &&
                    value.selectedUsers.length > 0 &&
                    smsMissing.length > 0 && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Missing phone numbers:</strong> The following selected recipients have no
                          phone number on file and will not receive SMS messages:{" "}
                          {smsMissing.map((u) => u.name || u.email).join(", ")}.
                        </AlertDescription>
                      </Alert>
                    )}
                </div>
              </div>
            )}
            {openSections.individual && value.includeAll && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Disabled while "Everyone" is selected. Uncheck Everyone to target individuals.
                </p>
              </div>
            )}
          </div>

          {/* By Role Section */}
          <div className="border rounded-md overflow-hidden">
            <SectionHeader
              id="role"
              label="By Role"
              badgeCount={value.selectedRoles.length}
            />
            {openSections.role && !value.includeAll && (
              <div className="p-3 space-y-3 border-t">
                {showSmsWarning && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      Recipients without a valid phone number on file will be skipped when sending SMS.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2">
                  <Label>Select Roles</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((role) => (
                      <div key={role} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role}`}
                          checked={value.selectedRoles.includes(role)}
                          onCheckedChange={(checked) => {
                            update({
                              selectedRoles: checked
                                ? [...value.selectedRoles, role]
                                : value.selectedRoles.filter((r) => r !== role),
                            });
                          }}
                        />
                        <Label htmlFor={`role-${role}`} className="capitalize">
                          {role.replace(/([A-Z])/g, " $1").trim()}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {openSections.role && value.includeAll && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Disabled while "Everyone" is selected.
                </p>
              </div>
            )}
          </div>

          {/* By Location Section */}
          <div className="border rounded-md overflow-hidden">
            <SectionHeader
              id="location"
              label="By Location"
              badgeCount={value.selectedLocations.length}
            />
            {openSections.location && !value.includeAll && (
              <div className="p-3 space-y-3 border-t">
                {showSmsWarning && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      Recipients without a valid phone number on file will be skipped when sending SMS.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2">
                  <Label>Select Locations</Label>
                  {locations.length === 0 ? (
                    <div className="p-4 bg-muted rounded-lg border border-dashed">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <MapPin className="h-5 w-5" />
                        <div>
                          <p className="font-medium">No locations configured</p>
                          <p className="text-sm">
                            Add locations in School Settings to enable location-based notifications.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {locations.map((location) => (
                        <div key={location.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`location-${location.id}`}
                            checked={value.selectedLocations.includes(location.id)}
                            onCheckedChange={(checked) => {
                              update({
                                selectedLocations: checked
                                  ? [...value.selectedLocations, location.id]
                                  : value.selectedLocations.filter((l) => l !== location.id),
                              });
                            }}
                          />
                          <Label htmlFor={`location-${location.id}`}>
                            {location.name} ({location.code})
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {openSections.location && value.includeAll && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Disabled while "Everyone" is selected.
                </p>
              </div>
            )}
          </div>

          {/* By Class Section */}
          <div className="border rounded-md overflow-hidden">
            <SectionHeader
              id="class"
              label="By Class"
              badgeCount={value.selectedClasses.length}
            />
            {openSections.class && !value.includeAll && (
              <div className="p-3 space-y-3 border-t">
                {showSmsWarning && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      Recipients without a valid phone number on file will be skipped when sending SMS.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2">
                  <Label>Select Classes</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify parents of students enrolled in selected classes
                  </p>
                  {classes.length === 0 ? (
                    <div className="p-4 bg-muted rounded-lg border border-dashed">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Building2 className="h-5 w-5" />
                        <div>
                          <p className="font-medium">No classes available</p>
                          <p className="text-sm">
                            Create classes in Class Management to enable class-based notifications.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                      {classes.map((cls) => (
                        <div key={cls.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`class-${cls.id}`}
                            checked={value.selectedClasses.includes(cls.id)}
                            onCheckedChange={(checked) => {
                              update({
                                selectedClasses: checked
                                  ? [...value.selectedClasses, cls.id]
                                  : value.selectedClasses.filter((c) => c !== cls.id),
                              });
                            }}
                          />
                          <Label htmlFor={`class-${cls.id}`} className="flex-1">
                            <span className="font-medium">{cls.title}</span>
                            {formatClassSchedule(cls.schedule) && (
                              <span className="text-sm text-muted-foreground ml-2">
                                ({formatClassSchedule(cls.schedule)})
                              </span>
                            )}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {value.selectedClasses.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {value.selectedClasses.length} class
                      {value.selectedClasses.length !== 1 ? "es" : ""} selected
                    </p>
                  )}
                </div>
              </div>
            )}
            {openSections.class && value.includeAll && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Disabled while "Everyone" is selected.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function defaultTargetingState(): TargetingState {
  return {
    includeAll: false,
    selectedUsers: [],
    selectedRoles: [],
    selectedLocations: [],
    selectedClasses: [],
    deliveryType: "both",
    priority: "normal",
  };
}
