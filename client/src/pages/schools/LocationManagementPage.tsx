import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Location } from '@shared/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useSchoolAdmin } from '@/hooks/useSchoolAdmin'
import { MapPin, Users, Building2, TrendingUp, Eye, PlusCircle, Trash2, Edit, Power } from 'lucide-react'

interface LocationOverview {
  id: number
  name: string
  address: string
  capacity: number
  totalStudents: number
  staffCount: number
  utilization: number
  status: string
}

interface Student {
  id: number
  childId: number
  locationId: number
  schoolId: number
  enrollmentDate: string
  status: string
  gradeLevel: string
  child: {
    firstName: string
    lastName: string
    parentEmail: string
    gradeLevel: string
    profileImage?: string
  } | null
}

export default function LocationManagementPage() {
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Get authenticated user's schoolId
  const { schoolId, hasSchool } = useSchoolAdmin()

  // Fetch location overview data
  const { data: locationData, isLoading: isLoadingLocations, error: locationsError } = useQuery({
    queryKey: ['/api/school-admin/locations/overview'],
    queryFn: () => fetch('/api/school-admin/locations/overview', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
      }
    }).then(res => res.json())
  })

  // Fetch students for selected location
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['/api/school-admin/students/by-location', selectedLocationId],
    queryFn: () => selectedLocationId ? 
      fetch(`/api/school-admin/students/by-location/${selectedLocationId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
        }
      }).then(res => res.json()) : null,
    enabled: !!selectedLocationId
  })

  // Fetch user location permissions
  const { data: permissionsData } = useQuery({
    queryKey: ['/api/school-admin/user-locations/my-permissions'],
    queryFn: () => fetch('/api/school-admin/user-locations/my-permissions', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
      }
    }).then(res => res.json())
  })

  // Create location mutation
  const createLocationMutation = useMutation({
    mutationFn: (locationData: any) => 
      fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
        },
        body: JSON.stringify(locationData)
      }).then(res => {
        if (!res.ok) throw new Error('Failed to create location')
        return res.json()
      }),
    onSuccess: () => {
      // Force refresh multiple related queries
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      setIsAddDialogOpen(false)
      toast({
        title: "Success",
        description: "Location created successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create location",
        variant: "destructive",
      })
    }
  })

  const handleCreateLocation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    if (!hasSchool || !schoolId) {
      toast({
        title: "Error",
        description: "Unable to determine your school. Please ensure you're logged in as a school administrator.",
        variant: "destructive",
      })
      return
    }
    
    const locationData = {
      schoolId: schoolId,
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      state: formData.get('state') as string,
      zipCode: formData.get('zipCode') as string,
      phoneNumber: formData.get('phoneNumber') as string || undefined,
      email: formData.get('email') as string || undefined,
      managerName: formData.get('managerName') as string || undefined,
      capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : undefined,
      timezone: formData.get('timezone') as string || 'America/New_York'
    }

    createLocationMutation.mutate(locationData)
  }

  // Delete location mutation
  const deleteLocationMutation = useMutation({
    mutationFn: (locationId: number) => 
      fetch(`/api/locations/${locationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
        }
      }).then(res => {
        if (!res.ok) throw new Error('Failed to delete location')
        return res.json()
      }),
    onSuccess: () => {
      // Force refresh multiple related queries  
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      toast({
        title: "Success",
        description: "Location deleted successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete location",
        variant: "destructive",
      })
    }
  })

  const handleDeleteLocation = (location: LocationOverview) => {
    if (window.confirm(`Are you sure you want to delete "${location.name}"? This action cannot be undone and will affect ${location.totalStudents} students.`)) {
      deleteLocationMutation.mutate(location.id)
    }
  }

  // Status toggle mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: number; newStatus: boolean }) => 
      fetch(`/api/locations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
        },
        body: JSON.stringify({ isActive: newStatus })
      }).then(res => {
        if (!res.ok) throw new Error('Failed to update location status')
        return res.json()
      }),
    onSuccess: () => {
      // Force refresh multiple related queries
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      toast({
        title: "Success",
        description: "Location status updated successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update location status",
        variant: "destructive",
      })
    }
  })

  const handleToggleStatus = (location: LocationOverview) => {
    const newStatus = location.status === 'Inactive'
    const actionText = newStatus ? 'activate' : 'deactivate'
    
    if (window.confirm(`Are you sure you want to ${actionText} "${location.name}"?`)) {
      toggleStatusMutation.mutate({ id: location.id, newStatus })
    }
  }

  // Update location mutation
  const updateLocationMutation = useMutation({
    mutationFn: ({ id, locationData }: { id: number; locationData: any }) => 
      fetch(`/api/locations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
        },
        body: JSON.stringify(locationData)
      }).then(res => {
        if (!res.ok) throw new Error('Failed to update location')
        return res.json()
      }),
    onSuccess: () => {
      // Force refresh multiple related queries
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/locations/overview'] })
      setIsEditDialogOpen(false)
      setEditingLocation(null)
      toast({
        title: "Success",
        description: "Location updated successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive",
      })
    }
  })

  const handleEditLocation = async (location: LocationOverview) => {
    try {
      // Fetch complete location details for editing
      const response = await fetch(`/api/locations/${location.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_access_token') || ''}`
        }
      })
      const fullLocationData = await response.json()
      setEditingLocation(fullLocationData)
      setIsEditDialogOpen(true)
    } catch (error) {
      console.error('Error fetching location details:', error)
      toast({
        title: "Error",
        description: "Failed to load location details",
        variant: "destructive",
      })
    }
  }

  const handleUpdateLocation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingLocation) return

    const formData = new FormData(e.currentTarget)
    
    const locationData = {
      name: formData.get('name') as string,
      code: formData.get('code') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      state: formData.get('state') as string,
      zipCode: formData.get('zipCode') as string,
      phoneNumber: formData.get('phoneNumber') as string || undefined,
      email: formData.get('email') as string || undefined,
      managerName: formData.get('managerName') as string || undefined,
      capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : undefined,
      timezone: formData.get('timezone') as string || 'America/New_York'
    }

    updateLocationMutation.mutate({ id: editingLocation.id, locationData })
  }

  if (isLoadingLocations) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-4">Loading location data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (locationsError) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Locations</CardTitle>
            <CardDescription>There was a problem loading your location data.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please try refreshing the page or contact support if the problem persists.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const locations: LocationOverview[] = locationData?.locations || []
  const students: Student[] = studentsData?.students || []

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Location Management</h1>
          <p className="text-muted-foreground">
            Manage students and staff across all school locations
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
              <DialogDescription>
                Create a new campus location for your school.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateLocation} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Location Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Downtown Campus"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Location Code *</Label>
                  <Input
                    id="code"
                    name="code"
                    placeholder="DT"
                    required
                    maxLength={4}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="123 Main Street"
                  required
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    placeholder="Atlanta"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    name="state"
                    placeholder="GA"
                    required
                    maxLength={2}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zipCode">ZIP Code *</Label>
                  <Input
                    id="zipCode"
                    name="zipCode"
                    placeholder="30301"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    name="capacity"
                    type="number"
                    placeholder="150"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    placeholder="(404) 555-0100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="location@school.edu"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="managerName">Manager Name</Label>
                  <Input
                    id="managerName"
                    name="managerName"
                    placeholder="Sarah Johnson"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select name="timezone" defaultValue="America/New_York">
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
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLocationMutation.isPending}>
                  {createLocationMutation.isPending ? "Creating..." : "Create Location"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        
        {/* Edit Location Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Location</DialogTitle>
              <DialogDescription>
                Update the location information.
              </DialogDescription>
            </DialogHeader>
            {editingLocation && (
              <form onSubmit={handleUpdateLocation} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Location Name *</Label>
                    <Input
                      id="edit-name"
                      name="name"
                      defaultValue={editingLocation.name}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-code">Location Code *</Label>
                    <Input
                      id="edit-code"
                      name="code"
                      defaultValue={editingLocation.code || ''}
                      required
                      maxLength={4}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-address">Address *</Label>
                  <Input
                    id="edit-address"
                    name="address"
                    defaultValue={editingLocation.address}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit-city">City *</Label>
                    <Input
                      id="edit-city"
                      name="city"
                      defaultValue={editingLocation.city || ''}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-state">State *</Label>
                    <Input
                      id="edit-state"
                      name="state"
                      defaultValue={editingLocation.state || ''}
                      required
                      maxLength={2}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-zipCode">ZIP Code *</Label>
                    <Input
                      id="edit-zipCode"
                      name="zipCode"
                      defaultValue={editingLocation.zipCode || ''}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-capacity">Capacity</Label>
                    <Input
                      id="edit-capacity"
                      name="capacity"
                      type="number"
                      defaultValue={editingLocation.capacity || ''}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-phoneNumber">Phone Number</Label>
                    <Input
                      id="edit-phoneNumber"
                      name="phoneNumber"
                      defaultValue={editingLocation.phoneNumber || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      name="email"
                      type="email"
                      defaultValue={editingLocation.email || ''}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-managerName">Manager Name</Label>
                    <Input
                      id="edit-managerName"
                      name="managerName"
                      defaultValue={editingLocation.managerName || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-timezone">Timezone</Label>
                    <Select name="timezone" defaultValue={editingLocation.timezone || 'America/New_York'}>
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
                
                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateLocationMutation.isPending}>
                    {updateLocationMutation.isPending ? "Updating..." : "Update Location"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Location Overview Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locationData?.totalLocations || 0}</div>
            <p className="text-xs text-muted-foreground">Active school locations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locationData?.totalStudents || 0}</div>
            <p className="text-xs text-muted-foreground">Across all locations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{locationData?.totalStaff || 0}</div>
            <p className="text-xs text-muted-foreground">Staff members assigned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {locations.length > 0 
                ? Math.round(locations.reduce((sum, loc) => sum + loc.utilization, 0) / locations.length)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Capacity utilization</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Location Overview</TabsTrigger>
          <TabsTrigger value="students" className="text-xs sm:text-sm">Students by Location</TabsTrigger>
          <TabsTrigger value="permissions" className="text-xs sm:text-sm">My Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Location Details</CardTitle>
              <CardDescription>
                Overview of all school locations with student and staff counts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {locations.length > 0 ? (
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Location</TableHead>
                        <TableHead className="hidden md:table-cell min-w-[200px]">Address</TableHead>
                        <TableHead className="min-w-[80px]">Students</TableHead>
                        <TableHead className="hidden lg:table-cell min-w-[60px]">Staff</TableHead>
                        <TableHead className="hidden lg:table-cell min-w-[80px]">Capacity</TableHead>
                        <TableHead className="hidden xl:table-cell min-w-[120px]">Utilization</TableHead>
                        <TableHead className="min-w-[80px]">Status</TableHead>
                        <TableHead className="min-w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locations.map((location) => (
                        <TableRow key={location.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 flex-shrink-0" />
                              <span className="whitespace-nowrap">{location.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            <span className="line-clamp-2">{location.address}</span>
                          </TableCell>
                          <TableCell>{location.totalStudents}</TableCell>
                          <TableCell className="hidden lg:table-cell">{location.staffCount}</TableCell>
                          <TableCell className="hidden lg:table-cell">{location.capacity}</TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium whitespace-nowrap">{location.utilization}%</div>
                              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    location.utilization > 80 ? 'bg-red-500' :
                                    location.utilization > 60 ? 'bg-yellow-500' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(location.utilization, 100)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={location.status === 'Active' ? 'default' : 'secondary'}>
                              {location.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Edit location"
                                className="h-8 w-8 p-0"
                                onClick={() => handleEditLocation(location)}
                                data-testid={`button-edit-location-${location.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title={location.status === 'Active' ? 'Deactivate location' : 'Activate location'}
                                className={`h-8 w-8 p-0 ${
                                  location.status === 'Active' 
                                    ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' 
                                    : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                }`}
                                onClick={() => handleToggleStatus(location)}
                                disabled={toggleStatusMutation.isPending}
                                data-testid={`button-toggle-status-${location.id}`}
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Delete location"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteLocation(location)}
                                disabled={deleteLocationMutation.isPending}
                                data-testid={`button-delete-location-${location.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg font-semibold">No locations found</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Get started by adding your first location using the "Add Location" button above.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Students by Location</CardTitle>
              <CardDescription>
                View and manage students enrolled at specific locations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id.toString()}>
                        {location.name} ({location.totalStudents} students)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLocationId && (
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    View Details
                  </Button>
                )}
              </div>

              {selectedLocationId && (
                <div className="border rounded-lg overflow-hidden">
                  {isLoadingStudents ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="text-sm text-muted-foreground mt-2">Loading students...</p>
                    </div>
                  ) : students.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">Student Name</TableHead>
                            <TableHead className="min-w-[100px]">Grade Level</TableHead>
                            <TableHead className="hidden md:table-cell min-w-[200px]">Parent Email</TableHead>
                            <TableHead className="hidden lg:table-cell min-w-[120px]">Enrollment Date</TableHead>
                            <TableHead className="min-w-[80px]">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {students.map((student) => (
                            <TableRow key={student.id}>
                              <TableCell className="font-medium">
                                <span className="whitespace-nowrap">
                                  {student.child ? 
                                    `${student.child.firstName} ${student.child.lastName}` :
                                    'Unknown Student'
                                  }
                                </span>
                              </TableCell>
                              <TableCell>
                                {student.child?.gradeLevel || student.gradeLevel || 'N/A'}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">
                                <span className="truncate max-w-[200px] inline-block">
                                  {student.child?.parentEmail || 'N/A'}
                                </span>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">
                                {new Date(student.enrollmentDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant={student.status === 'active' ? 'default' : 'secondary'}>
                                  {student.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Users className="mx-auto h-10 w-10 text-muted-foreground opacity-50" />
                      <p className="mt-3 text-muted-foreground">No students found at this location.</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My Location Permissions</CardTitle>
              <CardDescription>
                View your assigned locations and access permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {permissionsData?.userLocations && permissionsData.userLocations.length > 0 ? (
                <div className="space-y-4">
                  {permissionsData.userLocations.map((userLocation: any) => (
                    <Card key={userLocation.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {userLocation.location?.name || 'Unknown Location'}
                          </CardTitle>
                          <Badge variant={userLocation.isActive ? 'default' : 'secondary'}>
                            {userLocation.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-2 text-sm">
                          <div><span className="font-medium">Role:</span> {userLocation.role}</div>
                          <div><span className="font-medium">Permissions:</span> {userLocation.permissions?.join(', ') || 'None specified'}</div>
                          <div><span className="font-medium">Address:</span> {userLocation.location?.address || 'N/A'}</div>
                          <div><span className="font-medium">Assigned:</span> {new Date(userLocation.assignedAt).toLocaleDateString()}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">You don't have specific location permissions assigned.</p>
                  <p className="text-sm text-muted-foreground mt-2">Contact your administrator if you need access to specific locations.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}