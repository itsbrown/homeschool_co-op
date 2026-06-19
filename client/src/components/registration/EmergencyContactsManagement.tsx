import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EmergencyContactForm, type EmergencyContactRecord } from "./EmergencyContactForm";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Edit,
  Trash,
  Plus,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EmergencyContactsManagementProps {
  /** Hide the section title when the parent page already provides one */
  embedded?: boolean;
}

export function EmergencyContactsManagement({ embedded = false }: EmergencyContactsManagementProps) {
  const [addContactDialogOpen, setAddContactDialogOpen] = useState(false);
  const [editContactDialogOpen, setEditContactDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contacts, isLoading } = useQuery<EmergencyContactRecord[]>({
    queryKey: ["/api/emergency-contacts"],
  });

  const contactList = Array.isArray(contacts) ? contacts : [];
  const selectedContact = selectedContactId
    ? contactList.find((contact) => contact.id === selectedContactId) ?? null
    : null;

  const handleAddContactSuccess = () => {
    setAddContactDialogOpen(false);
    toast({
      title: "Contact saved",
      description: "Your emergency contact list has been updated.",
    });
  };

  const handleEditContactSuccess = () => {
    setEditContactDialogOpen(false);
    setSelectedContactId(null);
    toast({
      title: "Contact updated",
      description: "Your changes have been saved.",
    });
  };

  const handleDeleteContact = async () => {
    if (!selectedContactId) return;

    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/emergency-contacts/${selectedContactId}`);

      queryClient.setQueryData<EmergencyContactRecord[]>(
        ["/api/emergency-contacts"],
        (existing) =>
          Array.isArray(existing)
            ? existing.filter((contact) => contact.id !== selectedContactId)
            : [],
      );
      await queryClient.invalidateQueries({ queryKey: ["/api/emergency-contacts"] });

      toast({
        title: "Contact removed",
        description: "The emergency contact has been deleted.",
      });

      setDeleteDialogOpen(false);
      setSelectedContactId(null);
    } catch (error) {
      console.error("Failed to delete emergency contact:", error);
      toast({
        title: "Could not delete contact",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const openAddDialog = () => setAddContactDialogOpen(true);

  const addContactButton = (
    <Button onClick={openAddDialog}>
      <Plus className="mr-2 h-4 w-4" />
      Add Contact
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 ml-auto" />
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {!embedded && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Emergency Contacts</h2>
            <p className="text-sm text-muted-foreground">
              People we can reach in an emergency or authorize for pickup
            </p>
          </div>
        )}
        <div className={embedded ? "sm:ml-auto" : ""}>{addContactButton}</div>
      </div>

      {contactList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">No emergency contacts yet</CardTitle>
            <CardDescription className="max-w-sm mb-6">
              Add at least one contact so we know who to call or who may pick up your children.
            </CardDescription>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contactList.map((contact) => (
            <Card key={contact.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <CardTitle className="text-lg">
                      {contact.firstName} {contact.lastName}
                    </CardTitle>
                    <CardDescription>{contact.relationship}</CardDescription>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit contact"
                      onClick={() => {
                        setSelectedContactId(contact.id);
                        setEditContactDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete contact"
                      onClick={() => {
                        setSelectedContactId(contact.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 opacity-70" />
                  <span className="text-sm">{contact.phoneNumber}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 opacity-70" />
                  <span className="text-sm">{contact.email}</span>
                </div>

                <div className="flex items-center gap-2">
                  {contact.isAuthorizedPickup ? (
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Authorized for pickup
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Not authorized for pickup
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addContactDialogOpen} onOpenChange={setAddContactDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Emergency Contact</DialogTitle>
            <DialogDescription>
              Enter contact details for someone we can reach in an emergency.
            </DialogDescription>
          </DialogHeader>
          <EmergencyContactForm onSuccess={handleAddContactSuccess} variant="plain" />
        </DialogContent>
      </Dialog>

      <Dialog open={editContactDialogOpen} onOpenChange={setEditContactDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Emergency Contact</DialogTitle>
            <DialogDescription>Update this contact&apos;s information.</DialogDescription>
          </DialogHeader>
          {selectedContact && (
            <EmergencyContactForm
              defaultValues={{
                firstName: selectedContact.firstName,
                lastName: selectedContact.lastName,
                relationship: selectedContact.relationship,
                phoneNumber: selectedContact.phoneNumber,
                email: selectedContact.email,
                isAuthorizedPickup: selectedContact.isAuthorizedPickup,
              }}
              onSuccess={handleEditContactSuccess}
              contactId={selectedContact.id}
              variant="plain"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the emergency contact permanently. You can add them again later if needed.
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
