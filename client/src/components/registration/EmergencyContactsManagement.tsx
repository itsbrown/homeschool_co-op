import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EmergencyContactForm } from "./EmergencyContactForm";

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
  Dialog,
  DialogContent,
  DialogDescription,
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
  Phone,
  Mail,
  User,
  CheckCircle,
  XCircle,
  ShieldAlert
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EmergencyContact {
  id: number;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  isAuthorizedPickup: boolean;
}

export function EmergencyContactsManagement() {
  const [addContactDialogOpen, setAddContactDialogOpen] = useState(false);
  const [editContactDialogOpen, setEditContactDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch emergency contacts data
  const { data: contacts, isLoading } = useQuery({
    queryKey: ["/api/emergency-contacts"],
  });

  // Get selected contact data for editing
  const selectedContact = selectedContactId 
    ? contacts?.find((contact: EmergencyContact) => contact.id === selectedContactId) 
    : null;

  // Handle adding a new contact
  const handleAddContactSuccess = () => {
    setAddContactDialogOpen(false);
    toast({
      title: "Success",
      description: "Emergency contact added successfully",
    });
  };

  // Handle editing a contact
  const handleEditContactSuccess = () => {
    setEditContactDialogOpen(false);
    setSelectedContactId(null);
    toast({
      title: "Success",
      description: "Emergency contact updated successfully",
    });
  };

  // Handle deleting a contact
  const handleDeleteContact = async () => {
    if (!selectedContactId) return;

    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/emergency-contacts/${selectedContactId}`);
      
      toast({
        title: "Success",
        description: "Emergency contact deleted successfully",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/emergency-contacts"] });
      
      setDeleteDialogOpen(false);
      setSelectedContactId(null);
    } catch (error) {
      console.error("Failed to delete emergency contact:", error);
      toast({
        title: "Error",
        description: "Failed to delete emergency contact. Please try again.",
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
            <Skeleton key={n} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Emergency Contacts</h2>
          <p className="text-muted-foreground">
            Manage your emergency contacts for your children
          </p>
        </div>
        
        <Dialog open={addContactDialogOpen} onOpenChange={setAddContactDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Emergency Contact</DialogTitle>
              <DialogDescription>
                Add someone we can contact in case of emergency
              </DialogDescription>
            </DialogHeader>
            <EmergencyContactForm onSuccess={handleAddContactSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {contacts?.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Emergency Contacts</CardTitle>
            <CardDescription>
              You haven't added any emergency contacts yet
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <ShieldAlert className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-center text-muted-foreground">
              Add at least one emergency contact for your children's safety
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={() => setAddContactDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Emergency Contact
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact: EmergencyContact) => (
            <Card key={contact.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle>{contact.firstName} {contact.lastName}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedContactId(contact.id);
                        setEditContactDialogOpen(true);
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
                            setSelectedContactId(contact.id);
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
                            This will permanently delete this emergency contact and cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleDeleteContact}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <CardDescription>{contact.relationship}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 opacity-70" />
                  <span className="text-sm">{contact.phoneNumber}</span>
                </div>
                
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 opacity-70" />
                    <span className="text-sm">{contact.email}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 opacity-70" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Authorized for pickup:</span>
                    {contact.isAuthorizedPickup ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Yes
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> No
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Contact Dialog */}
      <Dialog open={editContactDialogOpen} onOpenChange={setEditContactDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Emergency Contact</DialogTitle>
            <DialogDescription>
              Update emergency contact information
            </DialogDescription>
          </DialogHeader>
          {selectedContact && (
            <EmergencyContactForm 
              defaultValues={{
                firstName: selectedContact.firstName,
                lastName: selectedContact.lastName,
                relationship: selectedContact.relationship,
                phoneNumber: selectedContact.phoneNumber,
                email: selectedContact.email || "",
                isAuthorizedPickup: selectedContact.isAuthorizedPickup,
              }}
              onSuccess={handleEditContactSuccess}
              contactId={selectedContact.id}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Contact Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this emergency contact and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteContact}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}