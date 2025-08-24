import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  MapPin, 
  Users, 
  Settings, 
  Mail, 
  Phone, 
  Edit, 
  Trash2,
  Building2,
  UserPlus,
  Shield
} from "lucide-react";

interface Location {
  id: number;
  schoolId: number;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber?: string;
  email?: string;
  managerName?: string;
  capacity?: number;
  isActive: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

interface UserLocation {
  id: number;
  userId: number;
  locationId: number;
  accessLevel: "view" | "manage" | "admin";
  canViewReports: boolean;
  canManageStaff: boolean;
  canManageClasses: boolean;
  canManageStudents: boolean;
  canSendNotifications: boolean;
  isActive: boolean;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
}

export default function LocationManagementPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [schoolId] = useState(1); // Current school ID - in real app this would come from auth context
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch locations
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["/api/locations", schoolId],
    queryFn: () => apiRequest(`/api/locations?schoolId=${schoolId}`),
  });

  // Create location mutation
  const createLocationMutation = useMutation({
    mutationFn: (locationData: any) => apiRequest("/api/locations", {
      method: "POST",
      body: JSON.stringify(locationData),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Location created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create location",
        variant: "destructive",
      });
    },
  });

  // Update location mutation
  const updateLocationMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/api/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsEditDialogOpen(false);
      setSelectedLocation(null);
      toast({
        title: "Success",
        description: "Location updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive",
      });
    },
  });

  // Delete location mutation
  const deleteLocationMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/locations/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({
        title: "Success",
        description: "Location deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete location",
        variant: "destructive",
      });
    },
  });

  const handleCreateLocation = (formData: FormData) => {
    const locationData = {
      schoolId,
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      zipCode: formData.get("zipCode") as string,
      phoneNumber: formData.get("phoneNumber") as string || undefined,
      email: formData.get("email") as string || undefined,
      managerName: formData.get("managerName") as string || undefined,
      capacity: formData.get("capacity") ? parseInt(formData.get("capacity") as string) : undefined,
      timezone: formData.get("timezone") as string || "America/New_York",
    };

    createLocationMutation.mutate(locationData);
  };

  const handleUpdateLocation = (formData: FormData) => {
    if (!selectedLocation) return;

    const locationData = {
      id: selectedLocation.id,
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      zipCode: formData.get("zipCode") as string,
      phoneNumber: formData.get("phoneNumber") as string || undefined,
      email: formData.get("email") as string || undefined,
      managerName: formData.get("managerName") as string || undefined,
      capacity: formData.get("capacity") ? parseInt(formData.get("capacity") as string) : undefined,
      timezone: formData.get("timezone") as string || "America/New_York",
    };

    updateLocationMutation.mutate(locationData);
  };

  const handleDeleteLocation = (location: Location) => {
    if (window.confirm(`Are you sure you want to delete ${location.name}? This action cannot be undone.`)) {
      deleteLocationMutation.mutate(location.id);
    }
  };

  const openEditDialog = (location: Location) => {
    setSelectedLocation(location);
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Loading locations...</div>
    </div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Location Management</h1>
          <p className="text-muted-foreground">
            Manage your school's physical locations and campus sites
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Location
            </Button>
          </DialogTrigger>
          <LocationFormDialog
            title="Create New Location"
            description="Add a new physical location or campus to your school"
            onSubmit={handleCreateLocation}
            isLoading={createLocationMutation.isPending}
          />
        </Dialog>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locations.length}</div>
            <p className="text-xs text-muted-foreground">
              {locations.filter((l: Location) => l.isActive).length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {locations.reduce((total: number, loc: Location) => total + (loc.capacity || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              students across all locations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Capacity</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {locations.length > 0 
                ? Math.round(locations.reduce((total: number, loc: Location) => total + (loc.capacity || 0), 0) / locations.length)
                : 0
              }
            </div>
            <p className="text-xs text-muted-foreground">
              students per location
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Managers</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {locations.filter((l: Location) => l.managerName).length}
            </div>
            <p className="text-xs text-muted-foreground">
              locations with assigned managers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Locations Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Locations</CardTitle>
          <CardDescription>
            View and manage all physical locations and campus sites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location: Location) => (
                <TableRow key={location.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{location.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Code: {location.code}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{location.address}</div>
                      <div className="text-muted-foreground">
                        {location.city}, {location.state} {location.zipCode}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {location.managerName || (
                      <span className="text-muted-foreground">No manager assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-center">
                      <div className="font-medium">{location.capacity || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">students</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {location.email && (
                        <div className="flex items-center text-sm">
                          <Mail className="mr-1 h-3 w-3" />
                          {location.email}
                        </div>
                      )}
                      {location.phoneNumber && (
                        <div className="flex items-center text-sm">
                          <Phone className="mr-1 h-3 w-3" />
                          {location.phoneNumber}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={location.isActive ? "default" : "secondary"}>
                      {location.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(location)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteLocation(location)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        {selectedLocation && (
          <LocationFormDialog
            title="Edit Location"
            description="Update the location information"
            location={selectedLocation}
            onSubmit={handleUpdateLocation}
            isLoading={updateLocationMutation.isPending}
          />
        )}
      </Dialog>
    </div>
  );
}

// Location Form Dialog Component
function LocationFormDialog({
  title,
  description,
  location,
  onSubmit,
  isLoading,
}: {
  title: string;
  description: string;
  location?: Location;
  onSubmit: (formData: FormData) => void;
  isLoading: boolean;
}) {
  return (
    <DialogContent className="sm:max-w-[600px]">
      <form action={onSubmit}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Location Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Downtown Campus"
                defaultValue={location?.name}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code">Location Code</Label>
              <Input
                id="code"
                name="code"
                placeholder="DT"
                defaultValue={location?.code}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              placeholder="123 Main Street"
              defaultValue={location?.address}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                placeholder="Atlanta"
                defaultValue={location?.city}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                placeholder="Georgia"
                defaultValue={location?.state}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                name="zipCode"
                placeholder="30301"
                defaultValue={location?.zipCode}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                placeholder="(404) 555-0100"
                defaultValue={location?.phoneNumber}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="location@school.edu"
                defaultValue={location?.email}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="managerName">Manager Name</Label>
              <Input
                id="managerName"
                name="managerName"
                placeholder="Sarah Johnson"
                defaultValue={location?.managerName}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                name="capacity"
                type="number"
                placeholder="150"
                defaultValue={location?.capacity}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select name="timezone" defaultValue={location?.timezone || "America/New_York"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern Time</SelectItem>
                <SelectItem value="America/Chicago">Central Time</SelectItem>
                <SelectItem value="America/Denver">Mountain Time</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Location"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}