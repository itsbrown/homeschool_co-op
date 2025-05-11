import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChildForm } from "./ChildForm";
import { EnrollmentList } from "./EnrollmentList";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Edit, 
  Trash,
  Plus,
  Users,
  AlertTriangle,
  Calendar,
  School
} from "lucide-react";

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  gradeLevel: string;
  specialNeeds: string | null;
  allergies: string | null;
  healthNotes: string | null;
  profileImage: string | null;
}

export function ChildrenManagement() {
  const [addChildDialogOpen, setAddChildDialogOpen] = useState(false);
  const [editChildDialogOpen, setEditChildDialogOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch children data
  const { data: children, isLoading } = useQuery({
    queryKey: ["/api/children"],
  });

  // Get selected child data for editing
  const selectedChild = selectedChildId && Array.isArray(children)
    ? children.find((child: Child) => child.id === selectedChildId) 
    : null;

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Handle adding a new child
  const handleAddChildSuccess = () => {
    setAddChildDialogOpen(false);
    toast({
      title: "Success",
      description: "Child added successfully",
    });
  };

  // Handle editing a child
  const handleEditChildSuccess = () => {
    setEditChildDialogOpen(false);
    setSelectedChildId(null);
    toast({
      title: "Success",
      description: "Child updated successfully",
    });
  };

  // Handle deleting a child
  const handleDeleteChild = async () => {
    if (!selectedChildId) return;

    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/children/${selectedChildId}`);
      
      toast({
        title: "Success",
        description: "Child deleted successfully",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
      
      setDeleteDialogOpen(false);
      setSelectedChildId(null);
    } catch (error) {
      console.error("Failed to delete child:", error);
      toast({
        title: "Error",
        description: "Failed to delete child. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Show loading state if data is still loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Children</h2>
          <p className="text-muted-foreground">
            Manage your children's profiles and program enrollments
          </p>
        </div>
        
        <Dialog open={addChildDialogOpen} onOpenChange={setAddChildDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Child
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a Child</DialogTitle>
              <DialogDescription>
                Enter your child's information to register them with our program
              </DialogDescription>
            </DialogHeader>
            <ChildForm onSuccess={handleAddChildSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {!children || (Array.isArray(children) && children.length === 0) ? (
        <Card>
          <CardHeader>
            <CardTitle>No Children Registered</CardTitle>
            <CardDescription>
              You haven't registered any children yet
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-center text-muted-foreground">
              Add your first child to get started
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={() => setAddChildDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add a Child
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.isArray(children) && children.map((child: Child) => (
            <Card key={child.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle>{child.firstName} {child.lastName}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedChildId(child.id);
                        setEditChildDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedChildId(child.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete {child.firstName}'s profile and cannot be undone.
                            This will also cancel all program enrollments for this child.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleDeleteChild}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <CardDescription>Grade: {child.gradeLevel}</CardDescription>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 opacity-70" />
                    <span className="text-sm">Born: {formatDate(child.birthDate)}</span>
                  </div>
                  
                  {child.allergies && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 opacity-70 mt-0.5" />
                      <div>
                        <span className="text-sm font-medium">Allergies:</span>
                        <p className="text-xs text-muted-foreground">{child.allergies}</p>
                      </div>
                    </div>
                  )}
                  
                  {child.specialNeeds && (
                    <div className="flex items-start gap-2">
                      <School className="h-4 w-4 opacity-70 mt-0.5" />
                      <div>
                        <span className="text-sm font-medium">Special Needs:</span>
                        <p className="text-xs text-muted-foreground">{child.specialNeeds}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <Tabs defaultValue="enrollments" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="enrollments" className="py-4">
                    <EnrollmentList childId={child.id} />
                  </TabsContent>
                  <TabsContent value="details">
                    <div className="space-y-2 py-4">
                      {child.healthNotes && (
                        <div>
                          <h4 className="text-sm font-medium">Health Notes:</h4>
                          <p className="text-sm text-muted-foreground">{child.healthNotes}</p>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `/programs?childId=${child.id}`}
                        >
                          Find Programs
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Child Dialog */}
      <Dialog open={editChildDialogOpen} onOpenChange={setEditChildDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Child Information</DialogTitle>
            <DialogDescription>
              Update your child's information
            </DialogDescription>
          </DialogHeader>
          {selectedChild && (
            <ChildForm 
              defaultValues={{
                firstName: selectedChild.firstName,
                lastName: selectedChild.lastName,
                birthDate: new Date(selectedChild.birthDate).toISOString().split('T')[0],
                gradeLevel: selectedChild.gradeLevel,
                specialNeeds: selectedChild.specialNeeds || "",
                allergies: selectedChild.allergies || "",
                healthNotes: selectedChild.healthNotes || "",
              }}
              onSuccess={handleEditChildSuccess}
              childId={selectedChild.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}