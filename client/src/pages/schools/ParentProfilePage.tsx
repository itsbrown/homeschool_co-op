import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  ArrowLeft, 
  User, 
  Users, 
  GraduationCap, 
  CreditCard, 
  Calendar, 
  Phone, 
  Mail,
  MapPin,
  AlertTriangle,
  DollarSign,
  Clock,
  CheckCircle
} from 'lucide-react';
import { Link } from 'wouter';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

interface ParentProfile {
  parent: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  children: Array<{
    id: number;
    firstName: string;
    lastName: string;
    birthDate: string;
    grade: string;
    schoolId: number | null;
    parentEmail: string;
    allergies: string | null;
    medicalConditions: string | null;
    emergencyContact: string | null;
    additionalLanguages: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  enrollments: Array<{
    id: number;
    classId: number;
    className: string;
    classDescription?: string;
    childId: number;
    childName: string;
    enrollmentDate: string;
    status: string;
    amount: number;
    depositRequired: number;
    totalCost: number;
    remainingBalance: number;
    paymentPlan?: string;
  }>;
  paymentHistory: Array<{
    id: number;
    amount: number;
    status: string;
    paymentDate: string;
    paymentMethod: string;
    description: string;
    transactionId: string;
  }>;
  scheduledPayments: Array<{
    id: number;
    amount: number;
    dueDate: string;
    status: string;
    description: string;
    enrollmentId: number | null;
  }>;
  emergencyContacts: Array<{
    childId: number;
    childName: string;
    emergencyContact: string;
  }>;
  summary: {
    totalChildren: number;
    totalEnrollments: number;
    totalAmountPaid: number;
    totalAmountDue: number;
    activeEnrollments: number;
  };
}

export default function ParentProfilePage() {
  const [match, params] = useRoute('/schools/parents/:parentId');
  const parentId = params?.parentId;

  const { data: profile, isLoading, error } = useQuery<ParentProfile>({
    queryKey: [`/api/parent-profile/${parentId}`],
    enabled: !!parentId,
  });

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Parent Profile">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !profile) {
    return (
      <SchoolAdminLayout pageTitle="Parent Profile">
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Parent Not Found</h2>
          <p className="text-muted-foreground">The requested parent profile could not be found.</p>
          <Link href="/schools/users">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>
      </SchoolAdminLayout>
    );
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'enrolled':
        return 'default';
      case 'pending_payment':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getPaymentStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid':
      case 'succeeded':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <SchoolAdminLayout pageTitle={`${profile.parent.firstName} ${profile.parent.lastName}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/schools/users">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>

        {/* Parent Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {profile.parent.firstName} {profile.parent.lastName}
                </CardTitle>
                <CardDescription className="flex items-center space-x-4 mt-2">
                  <span className="flex items-center">
                    <Mail className="h-4 w-4 mr-1" />
                    {profile.parent.email}
                  </span>
                  {profile.parent.phone && (
                    <span className="flex items-center">
                      <Phone className="h-4 w-4 mr-1" />
                      {profile.parent.phone}
                    </span>
                  )}
                  <Badge variant={profile.parent.isActive ? 'default' : 'secondary'}>
                    {profile.parent.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Children</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.summary.totalChildren}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile.summary.totalEnrollments}</div>
              <p className="text-xs text-muted-foreground">
                {profile.summary.activeEnrollments} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${profile.summary.totalAmountPaid.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Amount Due</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${profile.summary.totalAmountDue.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Since</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {new Date(profile.parent.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Information */}
        <Tabs defaultValue="children" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="children">Children</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="emergency">Emergency Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="children">
            <Card>
              <CardHeader>
                <CardTitle>Children</CardTitle>
                <CardDescription>
                  Information about {profile.parent.firstName}'s children
                </CardDescription>
              </CardHeader>
              <CardContent>
                {profile.children.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No children found.</p>
                ) : (
                  <div className="space-y-4">
                    {profile.children.map((child) => (
                      <Card key={child.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-lg">
                              {child.firstName} {child.lastName}
                            </h3>
                            <div className="text-sm text-muted-foreground space-y-1 mt-2">
                              <p>Grade: {child.grade}</p>
                              <p>Birth Date: {new Date(child.birthDate).toLocaleDateString()}</p>
                              {child.allergies && <p>Allergies: {child.allergies}</p>}
                              {child.medicalConditions && <p>Medical Conditions: {child.medicalConditions}</p>}
                              {child.additionalLanguages && <p>Languages: {child.additionalLanguages}</p>}
                              {child.notes && <p>Notes: {child.notes}</p>}
                            </div>
                          </div>
                          <Badge variant="outline">ID: {child.id}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enrollments">
            <Card>
              <CardHeader>
                <CardTitle>Enrollments</CardTitle>
                <CardDescription>
                  Current and past enrollments for all children
                </CardDescription>
              </CardHeader>
              <CardContent>
                {profile.enrollments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No enrollments found.</p>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Child</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Enrollment Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead>Remaining Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.enrollments.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell className="font-medium">
                              {enrollment.childName}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{enrollment.className}</div>
                                {enrollment.classDescription && (
                                  <div className="text-sm text-muted-foreground">
                                    {enrollment.classDescription}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(enrollment.status)}>
                                {enrollment.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>${enrollment.totalCost.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={enrollment.remainingBalance > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                                ${enrollment.remainingBalance.toFixed(2)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <div className="space-y-6">
              {/* Payment History */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>All completed payments</CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.paymentHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No payment history found.</p>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Transaction ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profile.paymentHistory.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>
                                {new Date(payment.paymentDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{payment.description}</TableCell>
                              <TableCell>${payment.amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={getPaymentStatusBadgeVariant(payment.status)}>
                                  {payment.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {payment.transactionId}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Scheduled Payments */}
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled Payments</CardTitle>
                  <CardDescription>Upcoming and overdue payments</CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.scheduledPayments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No scheduled payments found.</p>
                  ) : (
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profile.scheduledPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>
                                {new Date(payment.dueDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{payment.description}</TableCell>
                              <TableCell>${payment.amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={getPaymentStatusBadgeVariant(payment.status)}>
                                  {payment.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="emergency">
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contacts</CardTitle>
                <CardDescription>
                  Emergency contact information for each child
                </CardDescription>
              </CardHeader>
              <CardContent>
                {profile.emergencyContacts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No emergency contacts found.</p>
                ) : (
                  <div className="space-y-4">
                    {profile.emergencyContacts.map((contact) => (
                      <Card key={contact.childId} className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold">{contact.childName}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {contact.emergencyContact}
                            </p>
                          </div>
                          <Badge variant="outline">Child ID: {contact.childId}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}