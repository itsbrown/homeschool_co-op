import { useQuery } from "@tanstack/react-query";
import { formatClassSchedule } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, MapPin, Building2 } from "lucide-react";
import { UserLookup, type UserResult } from "@/components/ui/user-lookup";

export type TargetType = "individual" | "role" | "location" | "class" | "all";

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
  targetType: TargetType;
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
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: schoolClassesData } = useQuery<{ items: ClassInfo[]; total: number }>({
    queryKey: ["/api/school-admin/classes"],
  });
  const classes = schoolClassesData?.items || [];

  const { data: staffPositions = [] } = useQuery<StaffPosition[]>({
    queryKey: ["/api/school-admin/staff-positions"],
  });

  const roles = staffPositions.map((p) => p.title.toLowerCase());

  const update = (partial: Partial<TargetingState>) => {
    onChange({ ...value, ...partial });
  };

  const handleTargetTypeChange = (newType: string) => {
    onChange({
      ...value,
      targetType: newType as TargetType,
      selectedUsers: [],
      selectedRoles: [],
      selectedLocations: [],
      selectedClasses: [],
    });
  };

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
        <Tabs value={value.targetType} onValueChange={handleTargetTypeChange}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="role">By Role</TabsTrigger>
            <TabsTrigger value="location">By Location</TabsTrigger>
            <TabsTrigger value="class">By Class</TabsTrigger>
            <TabsTrigger value="all">Everyone</TabsTrigger>
          </TabsList>

          <TabsContent value="individual" className="space-y-4">
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
              {(value.deliveryType === "sms" || value.deliveryType === "all") &&
                value.selectedUsers.length > 0 &&
                (() => {
                  const missingPhone = value.selectedUsers.filter((u) => !u.phone);
                  if (missingPhone.length === 0) return null;
                  return (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Missing phone numbers:</strong> The following selected recipients
                        have no phone number on file and will not receive SMS messages:{" "}
                        {missingPhone
                          .map((u) => u.name || u.email)
                          .join(", ")}
                        .
                      </AlertDescription>
                    </Alert>
                  );
                })()}
            </div>
          </TabsContent>

          <TabsContent value="role" className="space-y-4">
            {(value.deliveryType === "sms" || value.deliveryType === "all") && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Recipients without a valid phone number on file will be skipped when
                  sending SMS.
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
                      {role}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Filter by Locations (Optional)</Label>
              <div className="grid grid-cols-1 gap-2">
                {locations.map((location) => (
                  <div key={location.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-location-${location.id}`}
                      checked={value.selectedLocations.includes(location.id)}
                      onCheckedChange={(checked) => {
                        update({
                          selectedLocations: checked
                            ? [...value.selectedLocations, location.id]
                            : value.selectedLocations.filter((l) => l !== location.id),
                        });
                      }}
                    />
                    <Label htmlFor={`role-location-${location.id}`}>
                      {location.name} ({location.code})
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Leave blank to notify selected roles at all locations
              </p>
            </div>
          </TabsContent>

          <TabsContent value="location" className="space-y-4">
            {(value.deliveryType === "sms" || value.deliveryType === "all") && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Recipients without a valid phone number on file will be skipped when
                  sending SMS.
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
                        Add locations in School Settings to enable location-based
                        notifications.
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
            <div className="grid gap-2">
              <Label>Filter by Roles (Optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`location-role-${role}`}
                      checked={value.selectedRoles.includes(role)}
                      onCheckedChange={(checked) => {
                        update({
                          selectedRoles: checked
                            ? [...value.selectedRoles, role]
                            : value.selectedRoles.filter((r) => r !== role),
                        });
                      }}
                    />
                    <Label htmlFor={`location-role-${role}`} className="capitalize">
                      {role}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Leave blank to notify everyone at selected locations
              </p>
            </div>
          </TabsContent>

          <TabsContent value="class" className="space-y-4">
            {(value.deliveryType === "sms" || value.deliveryType === "all") && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Recipients without a valid phone number on file will be skipped when
                  sending SMS.
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
                        Create classes in Class Management to enable class-based
                        notifications.
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
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {(value.deliveryType === "sms" || value.deliveryType === "all") && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Recipients without a valid phone number on file will be skipped when
                  sending SMS.
                </AlertDescription>
              </Alert>
            )}
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                <div>
                  <h4 className="font-medium text-orange-800">Broadcast to Everyone</h4>
                  <p className="text-sm text-orange-700">
                    This will send the notification to all staff and students across all
                    locations. Use this feature carefully for important announcements only.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function defaultTargetingState(): TargetingState {
  return {
    targetType: "individual",
    selectedUsers: [],
    selectedRoles: [],
    selectedLocations: [],
    selectedClasses: [],
    deliveryType: "both",
    priority: "normal",
  };
}
