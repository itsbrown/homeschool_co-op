import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MapPin, Users, Building2, TrendingUp, Eye } from 'lucide-react'

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
        <TabsList>
          <TabsTrigger value="overview">Location Overview</TabsTrigger>
          <TabsTrigger value="students">Students by Location</TabsTrigger>
          <TabsTrigger value="permissions">My Permissions</TabsTrigger>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Utilization</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {location.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {location.address}
                      </TableCell>
                      <TableCell>{location.totalStudents}</TableCell>
                      <TableCell>{location.staffCount}</TableCell>
                      <TableCell>{location.capacity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium">{location.utilization}%</div>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <div className="border rounded-lg">
                  {isLoadingStudents ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="text-sm text-muted-foreground mt-2">Loading students...</p>
                    </div>
                  ) : students.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student Name</TableHead>
                          <TableHead>Grade Level</TableHead>
                          <TableHead>Parent Email</TableHead>
                          <TableHead>Enrollment Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">
                              {student.child ? 
                                `${student.child.firstName} ${student.child.lastName}` :
                                'Unknown Student'
                              }
                            </TableCell>
                            <TableCell>
                              {student.child?.gradeLevel || student.gradeLevel || 'N/A'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {student.child?.parentEmail || 'N/A'}
                            </TableCell>
                            <TableCell className="text-sm">
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
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-muted-foreground">No students found at this location.</p>
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