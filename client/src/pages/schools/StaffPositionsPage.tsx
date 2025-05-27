import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Edit, Trash2, Check, X, ArrowLeft } from "lucide-react";

import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Define the position type
interface Position {
  id: number;
  title: string;
  description: string;
  isDefault: boolean;
}

// Sample staff positions (will be replaced with API data)
const initialPositions: Position[] = [
  {
    id: 1,
    title: "Teacher",
    description: "Responsible for classroom instruction and student assessment",
    isDefault: true
  },
  {
    id: 2,
    title: "Department Head",
    description: "Oversees curriculum and teachers in a specific subject area",
    isDefault: true
  },
  {
    id: 3,
    title: "Administrator",
    description: "Handles administrative duties and school operations",
    isDefault: true
  },
  {
    id: 4,
    title: "Teacher Assistant",
    description: "Supports teachers in classroom management and instruction",
    isDefault: false
  },
  {
    id: 5,
    title: "Guidance Counselor",
    description: "Provides academic and personal counseling to students",
    isDefault: false
  }
];

// Form schema for creating/editing positions
const positionFormSchema = z.object({
  title: z.string().min(1, "Position title is required"),
  description: z.string().default(""),
  isDefault: z.boolean().default(false)
});

type PositionFormValues = z.infer<typeof positionFormSchema>;

export default function StaffPositionsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPosition, setEditingPosition] = useState<null | number>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletePosition, setDeletePosition] = useState<null | number>(null);
  
  // For inline editing
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsDefault, setEditIsDefault] = useState(false);

  // State to manage staff positions locally
  const [staffPositions, setStaffPositions] = useState<Position[]>(initialPositions);
  
  // Get staff positions from API
  const { data: positions, isLoading } = useQuery({
    queryKey: ['/api/school-admin/staff-positions'],
    queryFn: async () => {
      const response = await fetch('/api/school-admin/staff-positions', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch staff positions');
      }
      return response.json();
    },
    enabled: true,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
  });

  // Form for adding new position
  const addForm = useForm<PositionFormValues>({
    resolver: zodResolver(positionFormSchema),
    defaultValues: {
      title: "",
      description: "",
      isDefault: false
    }
  });

  // Setup mutation for updating positions
  const updatePositionMutation = useMutation({
    mutationFn: async (data: Position) => {
      console.log("🔄 Frontend: Updating position:", data);
      console.log("🌐 Frontend: Making PATCH request to:", `/api/school-admin/staff-positions/${data.id}`);
      
      const response = await fetch(`/api/school-admin/staff-positions/${data.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      console.log("📡 Frontend: Response status:", response.status);
      console.log("📡 Frontend: Response ok:", response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Frontend: Update failed with error:", errorText);
        throw new Error(`Failed to update position: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      console.log("✅ Frontend: Update successful, received:", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff-positions'] });
      toast({
        title: "Position updated",
        description: "The staff position has been updated successfully."
      });
      setEditingPosition(null);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "There was an error updating the position. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Setup mutation for adding positions
  const addPositionMutation = useMutation({
    mutationFn: (data: PositionFormValues) => {
      const newPosition: Position = { 
        id: Date.now(), 
        title: data.title,
        description: data.description || "",
        isDefault: data.isDefault 
      };
      
      // Add to local state directly
      setStaffPositions(current => [...current, newPosition]);
      return Promise.resolve(newPosition);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff-positions'] });
      toast({
        title: "Position added",
        description: "The new staff position has been added successfully."
      });
      setShowAddDialog(false);
      addForm.reset();
    },
    onError: () => {
      toast({
        title: "Add failed",
        description: "There was an error adding the position. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Setup mutation for deleting positions
  const deletePositionMutation = useMutation({
    mutationFn: (id: number) => {
      console.log("Deleting position:", id);
      // Remove from local state directly
      setStaffPositions(current => current.filter(pos => pos.id !== id));
      return Promise.resolve(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/staff-positions'] });
      toast({
        title: "Position deleted",
        description: "The staff position has been deleted successfully."
      });
      setDeletePosition(null);
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "There was an error deleting the position. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Handle edit button click
  const handleEditClick = (position: Position) => {
    setEditTitle(position.title);
    setEditDescription(position.description || "");
    setEditIsDefault(position.isDefault);
    setEditingPosition(position.id);
  };

  // Handle saving edited position
  const handleSaveEdit = (id: number) => {
    if (editTitle.trim() === "") {
      toast({
        title: "Validation error",
        description: "Position title is required",
        variant: "destructive"
      });
      return;
    }
    
    const updatedPosition: Position = {
      id,
      title: editTitle,
      description: editDescription || "",
      isDefault: editIsDefault
    };
    
    updatePositionMutation.mutate(updatedPosition);
  };

  // Handle adding a new position
  const handleAddPosition = (data: PositionFormValues) => {
    addPositionMutation.mutate(data);
  };

  // Handle deleting a position
  const handleDeleteClick = (id: number) => {
    setDeletePosition(id);
  };

  const confirmDelete = () => {
    if (deletePosition) {
      deletePositionMutation.mutate(deletePosition);
    }
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Staff Positions">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading staff positions...</span>
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Staff Positions">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col space-y-6">
          {/* Header and back button */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/schools/staff')} 
                className="mr-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Staff
              </Button>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold">Staff Positions</h1>
                <p className="text-muted-foreground">Manage the staff positions for your school</p>
              </div>
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Position
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Staff Position</DialogTitle>
                    <DialogDescription>
                      Create a new position type for your school staff.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Form {...addForm}>
                    <form onSubmit={addForm.handleSubmit(handleAddPosition)} className="space-y-4">
                      <FormField
                        control={addForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Position Title*</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Science Coordinator" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={addForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Brief description of responsibilities"
                              />
                            </FormControl>
                            <FormDescription>
                              Optional: Provide a short description of this position's duties
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={addForm.control}
                        name="isDefault"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Default Position</FormLabel>
                              <FormDescription>
                                Make this a default position that cannot be deleted
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button 
                          type="submit" 
                          disabled={addPositionMutation.isPending}
                        >
                          {addPositionMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Add Position
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
            <Separator className="my-4" />
          </div>
          
          {/* Information callout */}
          <Alert>
            <AlertTitle>About Staff Positions</AlertTitle>
            <AlertDescription>
              Staff positions define the roles that staff members can have in your school. 
              You can customize the position titles to match your school's structure. 
              Default positions cannot be deleted but can be renamed.
            </AlertDescription>
          </Alert>
          
          {/* Positions table */}
          <Card>
            <CardHeader>
              <CardTitle>Staff Positions</CardTitle>
              <CardDescription>
                View and manage all available position types for your staff
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions && positions.length > 0 ? (
                    positions.map((position) => (
                      <TableRow key={position.id}>
                        <TableCell>
                          {editingPosition === position.id ? (
                            <div className="flex flex-col space-y-2">
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Position Title"
                              />
                              {editTitle.trim() === "" && (
                                <p className="text-sm text-red-500">Position title is required</p>
                              )}
                            </div>
                          ) : (
                            <span className="font-medium">{position.title}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingPosition === position.id ? (
                            <div className="flex flex-col space-y-2">
                              <Input
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="Description"
                              />
                            </div>
                          ) : (
                            position.description || "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {editingPosition === position.id ? (
                            <div className="flex items-center">
                              <Switch
                                checked={editIsDefault}
                                onCheckedChange={(value) => setEditIsDefault(value)}
                                disabled={position.isDefault}
                              />
                            </div>
                          ) : (
                            <span className={position.isDefault ? "text-blue-600 font-medium" : ""}>
                              {position.isDefault ? "Default" : "Custom"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingPosition === position.id ? (
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingPosition(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleSaveEdit(position.id)}
                                disabled={editTitle.trim() === "" || updatePositionMutation.isPending}
                              >
                                {updatePositionMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditClick(position)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {!position.isDefault && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteClick(position.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6">
                        <p className="text-muted-foreground">No positions found</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => setShowAddDialog(true)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add your first position
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deletePosition !== null} onOpenChange={(open) => !open && setDeletePosition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this position? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePosition(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete} 
              disabled={deletePositionMutation.isPending}
            >
              {deletePositionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}