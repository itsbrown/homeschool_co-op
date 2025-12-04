import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { ArrowLeft, Download, Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState } from 'react';

interface FormSubmission {
  id: number;
  formId: number;
  submittedBy: number | null;
  submitterEmail: string;
  submitterName: string;
  responseData: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Product order fields
  subtotal?: number;
  platformFee?: number;
  totalAmount?: number;
  paymentStatus?: string;
  stripePaymentIntentId?: string | null;
  shippingAddress?: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  productImages?: string[];
}

interface CustomFormField {
  id: number;
  formId: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  order: number;
}

interface CustomForm {
  id: number;
  title: string;
  description: string | null;
  fields?: CustomFormField[];
}

export default function SubmissionsPage() {
  const [, params] = useRoute('/school-admin/forms/:id/submissions');
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const formId = params?.id ? parseInt(params.id) : 0;

  // Fetch form details with fields
  const { data: formData } = useQuery<CustomForm>({
    queryKey: ['/api/custom-forms/forms', formId],
    enabled: !!formId,
  });

  // Fetch submissions
  const { data: submissions = [], isLoading } = useQuery<FormSubmission[]>({
    queryKey: ['/api/custom-forms/forms', formId, 'submissions'],
    enabled: !!formId,
  });

  // Create field ID to label mapping
  // Response data uses keys like "field_4", "field_7" which correspond to field.id
  const fieldLabelMap: Record<string, string> = {};
  if (formData?.fields) {
    formData.fields.forEach((field) => {
      // Map both possible key formats
      fieldLabelMap[`field_${field.id}`] = field.label;
      if (field.fieldKey) {
        fieldLabelMap[field.fieldKey] = field.label;
      }
    });
  }

  const filteredSubmissions = submissions.filter((submission: FormSubmission) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      submission.submitterEmail?.toLowerCase().includes(searchLower) ||
      submission.submitterName?.toLowerCase().includes(searchLower) ||
      submission.status?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      reviewed: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const exportToCSV = () => {
    if (submissions.length === 0) return;

    // Get all unique field keys from response data
    const allFieldKeys = new Set<string>();
    submissions.forEach((sub: FormSubmission) => {
      Object.keys(sub.responseData || {}).forEach((key) => allFieldKeys.add(key));
    });
    const fieldKeysArray = Array.from(allFieldKeys);

    // Create CSV headers - use field labels instead of field IDs
    const headers = [
      'Submission ID',
      'Email',
      'Name',
      'Status',
      'Submitted At',
      ...fieldKeysArray.map((key) => fieldLabelMap[key] || key),
    ];

    // Create CSV rows
    const rows = submissions.map((sub: FormSubmission) => {
      return [
        sub.id,
        sub.submitterEmail,
        sub.submitterName,
        sub.status,
        formatDate(sub.createdAt),
        ...fieldKeysArray.map((field) => {
          const value = sub.responseData?.[field];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value || '';
        }),
      ];
    });

    // Combine headers and rows
    const csv = [headers.join(','), ...rows.map((row: any[]) => row.join(','))].join('\n');

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formData?.title || 'form'}-submissions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <SchoolAdminLayout pageTitle="Form Submissions">
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/school-admin/forms')}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">
                Form Submissions
              </h1>
              {formData && (
                <p className="text-muted-foreground mt-1" data-testid="text-form-title">
                  {formData.title}
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={exportToCSV}
            disabled={submissions.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Submissions</CardDescription>
              <CardTitle className="text-3xl" data-testid="stat-total">
                {submissions.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-3xl" data-testid="stat-pending">
                {submissions.filter((s: FormSubmission) => s.status === 'pending').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Reviewed</CardDescription>
              <CardTitle className="text-3xl" data-testid="stat-reviewed">
                {submissions.filter((s: FormSubmission) => s.status === 'reviewed').length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-3xl" data-testid="stat-approved">
                {submissions.filter((s: FormSubmission) => s.status === 'approved').length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, name, or status..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-submissions">
                {searchTerm ? 'No submissions match your search.' : 'No submissions yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((submission: FormSubmission) => (
                      <TableRow key={submission.id} data-testid={`row-submission-${submission.id}`}>
                        <TableCell className="font-mono text-sm">{submission.id}</TableCell>
                        <TableCell data-testid={`text-email-${submission.id}`}>
                          {submission.submitterEmail}
                        </TableCell>
                        <TableCell data-testid={`text-name-${submission.id}`}>
                          {submission.submitterName}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(submission.status)} data-testid={`badge-status-${submission.id}`}>
                            {submission.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(submission.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSubmission(submission)}
                            data-testid={`button-view-${submission.id}`}
                          >
                            View
                          </Button>
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

      {/* Submission Details Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission Details</DialogTitle>
            <DialogDescription>
              Submission ID: {selectedSubmission?.id} • Submitted on {selectedSubmission && formatDate(selectedSubmission.createdAt)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-6">
              {/* Submitter Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Submitter Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <p className="font-medium">{selectedSubmission.submitterName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium">{selectedSubmission.submitterEmail}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="mt-1">
                      <Badge className={getStatusColor(selectedSubmission.status)}>
                        {selectedSubmission.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP Address:</span>
                    <p className="font-medium font-mono text-xs">{selectedSubmission.ipAddress}</p>
                  </div>
                </div>
              </div>

              {/* Payment Information (if product order) */}
              {selectedSubmission.totalAmount !== undefined && selectedSubmission.totalAmount > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Payment Information</h3>
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">${(selectedSubmission.subtotal || 0) / 100}</span>
                    </div>
                    {selectedSubmission.platformFee && selectedSubmission.platformFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Platform Fee:</span>
                        <span className="font-medium">${selectedSubmission.platformFee / 100}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Total:</span>
                      <span>${selectedSubmission.totalAmount / 100}</span>
                    </div>
                    {selectedSubmission.paymentStatus && (
                      <div className="flex items-center gap-2 text-sm mt-3">
                        <span className="text-muted-foreground">Payment Status:</span>
                        <Badge className={
                          selectedSubmission.paymentStatus === 'completed' ? 'bg-green-100 text-green-800' :
                          selectedSubmission.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          selectedSubmission.paymentStatus === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }>
                          {selectedSubmission.paymentStatus}
                        </Badge>
                      </div>
                    )}
                    {selectedSubmission.stripePaymentIntentId && (
                      <div className="text-xs text-muted-foreground mt-2">
                        Payment ID: {selectedSubmission.stripePaymentIntentId}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Shipping Address (if product order) */}
              {selectedSubmission.shippingAddress && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Shipping Address</h3>
                  <div className="border rounded-lg p-4 text-sm">
                    <p>{selectedSubmission.shippingAddress.address}</p>
                    <p>
                      {selectedSubmission.shippingAddress.city}, {selectedSubmission.shippingAddress.state} {selectedSubmission.shippingAddress.zipCode}
                    </p>
                  </div>
                </div>
              )}

              {/* Product Images (if any) */}
              {selectedSubmission.productImages && selectedSubmission.productImages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Product Images</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedSubmission.productImages.map((imageUrl, index) => (
                      <a 
                        key={index} 
                        href={imageUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={imageUrl}
                          alt={`Product ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Responses */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Form Responses</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">Field</TableHead>
                        <TableHead>Response</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(selectedSubmission.responseData || {}).map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell className="font-medium">
                            {fieldLabelMap[key] || key}
                          </TableCell>
                          <TableCell>
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Notes (if any) */}
              {selectedSubmission.notes && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Notes</h3>
                  <p className="text-sm bg-muted p-3 rounded-md">{selectedSubmission.notes}</p>
                </div>
              )}

              {/* Status Info */}
              <div className="text-xs text-muted-foreground pt-4 border-t">
                <p><strong>Status:</strong> "{selectedSubmission.status}" means the submission {
                  selectedSubmission.status === 'pending' ? 'has been received and is waiting to be reviewed' :
                  selectedSubmission.status === 'reviewed' ? 'has been reviewed by staff' :
                  selectedSubmission.status === 'approved' ? 'has been approved' :
                  selectedSubmission.status === 'rejected' ? 'has been rejected' :
                  'is in an unknown state'
                }</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
