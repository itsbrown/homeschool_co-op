import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, X, GraduationCap, UserCheck, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface EducatorAssignment {
  id: number;
  educatorId: number;
  classId: number;
  schoolId: number;
  isPrimary: boolean;
  canStartSession: boolean;
  validFrom: string | null;
  validTo: string | null;
  educatorName: string;
  educatorEmail: string;
  role: string;
}

interface StaffMember {
  id: number;
  userId?: number; // Actual user ID from users table (id is role ID from user_roles)
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

interface ClassEducatorAssignmentsProps {
  classId: number | undefined;
  isEditMode: boolean;
  staffMembers: StaffMember[];
  staffLoading: boolean;
}

export function ClassEducatorAssignments({ 
  classId, 
  isEditMode, 
  staffMembers = [],
  staffLoading 
}: ClassEducatorAssignmentsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<EducatorAssignment[]>({
    queryKey: ["/api/admin/educators/class-assignments", classId],
    enabled: !!classId && isEditMode,
  });

  const addAssignmentMutation = useMutation({
    mutationFn: async (data: { educatorId: number; classId: number; isPrimary: boolean }) => {
      return apiRequest('POST', '/api/admin/educators/class-assignments', data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/educators/class-assignments", classId] });
      // Also invalidate classes list if a lead instructor was assigned
      if (variables.isPrimary) {
        queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes"] });
      }
      setSelectedStaffId("");
      setIsPrimary(false);
      toast({
        title: "Educator assigned",
        description: "The educator has been assigned to this class.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign educator",
        variant: "destructive",
      });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return apiRequest('DELETE', `/api/admin/educators/class-assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/educators/class-assignments", classId] });
      // Invalidate classes list in case the lead instructor was removed
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes"] });
      toast({
        title: "Educator removed",
        description: "The educator has been removed from this class.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove educator",
        variant: "destructive",
      });
    },
  });

  const makeLeadMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      return apiRequest('PATCH', `/api/admin/educators/class-assignments/${assignmentId}`, { isPrimary: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/educators/class-assignments", classId] });
      // Invalidate classes list to show updated instructor name
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/classes"] });
      toast({
        title: "Lead instructor updated",
        description: "The lead instructor has been updated for this class.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update lead instructor",
        variant: "destructive",
      });
    },
  });

  const handleAddEducator = () => {
    if (!selectedStaffId || !classId) return;
    
    // Find the staff member to get the actual userId (not the role id)
    const staff = staffMembers.find(s => String(s.id) === selectedStaffId);
    const educatorUserId = staff?.userId || parseInt(selectedStaffId);
    
    addAssignmentMutation.mutate({
      educatorId: educatorUserId,
      classId: classId,
      isPrimary: isPrimary
    });
  };

  const handleRemoveEducator = (assignmentId: number) => {
    removeAssignmentMutation.mutate(assignmentId);
  };

  // Use userId for filtering since assignments use user IDs, not role IDs
  const assignedEducatorIds = assignments.map(a => a.educatorId);
  const availableStaff = staffMembers.filter(s => {
    const userId = s.userId || s.id;
    return !assignedEducatorIds.includes(userId);
  });

  const getStaffDisplayName = (staff: StaffMember) => {
    return staff.name || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Unknown';
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'educator':
      case 'mentor':
        return 'default';
      case 'aide':
      case 'assistant':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (!isEditMode) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Class Instructors & Educators
          </CardTitle>
          <CardDescription>
            Save the class first to assign the lead instructor and other educators
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Class Instructors & Educators
        </CardTitle>
        <CardDescription>
          Assign educators to this class. The "Primary" educator is the main instructor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignmentsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            {assignments.length > 0 && (
              <div className="space-y-2">
                {assignments.map((assignment) => (
                  <div 
                    key={assignment.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    data-testid={`assignment-item-${assignment.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <GraduationCap className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{assignment.educatorName}</p>
                        <p className="text-xs text-muted-foreground">{assignment.educatorEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(assignment.role)}>
                        {assignment.role || 'Staff'}
                      </Badge>
                      {assignment.isPrimary ? (
                        <Badge variant="default" className="bg-green-600">
                          <UserCheck className="h-3 w-3 mr-1" />
                          Lead Instructor
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => makeLeadMutation.mutate(assignment.id)}
                          disabled={makeLeadMutation.isPending}
                          data-testid={`make-lead-${assignment.id}`}
                          className="text-xs h-7"
                        >
                          {makeLeadMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <UserCheck className="h-3 w-3 mr-1" />
                          )}
                          Make Lead
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEducator(assignment.id)}
                        disabled={removeAssignmentMutation.isPending}
                        data-testid={`remove-assignment-${assignment.id}`}
                      >
                        {removeAssignmentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {assignments.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No educators assigned yet
              </div>
            )}

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Add Educator</Label>
              <div className="flex gap-2 flex-wrap">
                <Select 
                  value={selectedStaffId} 
                  onValueChange={setSelectedStaffId}
                  disabled={staffLoading || availableStaff.length === 0}
                >
                  <SelectTrigger className="flex-1 min-w-[200px]" data-testid="select-educator">
                    <SelectValue placeholder={
                      staffLoading ? "Loading staff..." : 
                      availableStaff.length === 0 ? "No available staff" :
                      "Select staff member"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStaff.map((staff) => (
                      <SelectItem key={staff.id} value={String(staff.id)}>
                        {getStaffDisplayName(staff)}
                        {staff.role && ` (${staff.role})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex items-center gap-2">
                  <Switch 
                    id="is-primary" 
                    checked={isPrimary}
                    onCheckedChange={setIsPrimary}
                    data-testid="switch-is-primary"
                  />
                  <Label htmlFor="is-primary" className="text-sm whitespace-nowrap" title="The lead instructor for this class">Lead</Label>
                </div>

                <Button
                  type="button"
                  onClick={handleAddEducator}
                  disabled={!selectedStaffId || addAssignmentMutation.isPending}
                  data-testid="button-add-educator"
                >
                  {addAssignmentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
