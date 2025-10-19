import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { ArrowLeft, Download, Filter, Search } from 'lucide-react';
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
}

interface CustomForm {
  id: number;
  title: string;
  description: string | null;
}

export default function SubmissionsPage() {
  const [, params] = useRoute('/school-admin/forms/:id/submissions');
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const formId = params?.id ? parseInt(params.id) : 0;

  // Fetch form details
  const { data: formData } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/${formId}`],
    enabled: !!formId,
  });

  // Fetch submissions
  const { data: submissions = [], isLoading } = useQuery<FormSubmission[]>({
    queryKey: [`/api/custom-forms/forms/${formId}/submissions`],
    enabled: !!formId,
  });

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
    const allFields = new Set<string>();
    submissions.forEach((sub: FormSubmission) => {
      Object.keys(sub.responseData || {}).forEach((key) => allFields.add(key));
    });

    // Create CSV headers
    const headers = [
      'Submission ID',
      'Email',
      'Name',
      'Status',
      'Submitted At',
      ...Array.from(allFields),
    ];

    // Create CSV rows
    const rows = submissions.map((sub: FormSubmission) => {
      return [
        sub.id,
        sub.submitterEmail,
        sub.submitterName,
        sub.status,
        formatDate(sub.createdAt),
        ...Array.from(allFields).map((field) => {
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
                            onClick={() => {
                              // TODO: Show submission details in a dialog
                              alert(JSON.stringify(submission.responseData, null, 2));
                            }}
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
    </SchoolAdminLayout>
  );
}
