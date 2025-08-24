
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Users, CreditCard, GraduationCap } from 'lucide-react';

export default function DataImportPage() {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const handleFileUpload = async (endpoint: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setUploading(true);
    setError('');
    setResults(null);

    const formData = new FormData();
    if (files.length === 1) {
      formData.append('file', files[0]);
    } else {
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
    }

    try {
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        setResults(data);
      } else {
        setError(data.message || 'Upload failed');
      }
    } catch (error) {
      setError('Network error occurred');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Data Import</h1>
        <p className="text-muted-foreground">Import existing account data, payments, and registrations</p>
      </div>

      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="enrollments" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Enrollments
          </TabsTrigger>
          <TabsTrigger value="bulk" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Bulk Import
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Import Payment Data
              </CardTitle>
              <CardDescription>
                Upload payment history CSV from Stripe or other payment processors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileUpload('payment-import/upload-payments', e.target.files)}
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Expected columns: id, Amount, Currency, Status, Customer Email, Created date (UTC), Description
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Import Parent & Child Accounts
              </CardTitle>
              <CardDescription>
                Upload parent and child registration data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={(e) => handleFileUpload('account-import/upload-accounts', e.target.files)}
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Upload separate CSV files for parents and children, or combined data
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Import Class Enrollments
              </CardTitle>
              <CardDescription>
                Upload enrollment data to link children with classes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileUpload('enrollments/import', e.target.files)}
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Expected columns: Child ID, Class ID, Status, Enrollment Date, Amount
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Bulk Data Import
              </CardTitle>
              <CardDescription>
                Upload multiple CSV files at once for complete data migration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={(e) => handleFileUpload('account-import/upload-accounts', e.target.files)}
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Upload all CSV files (payments, parents, children, enrollments) at once
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {uploading && (
        <Alert className="mt-4">
          <Upload className="h-4 w-4 animate-spin" />
          <AlertDescription>
            Uploading and processing data...
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <Alert className="mt-4">
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">Import Results:</p>
              {results.processedCount && (
                <p>✅ Successfully processed: {results.processedCount}</p>
              )}
              {results.failedCount > 0 && (
                <p>❌ Failed: {results.failedCount}</p>
              )}
              {results.results && (
                <div className="space-y-1">
                  <p>👥 Parents: {results.results.parents?.successful || 0} successful, {results.results.parents?.failed || 0} failed</p>
                  <p>👶 Children: {results.results.children?.successful || 0} successful, {results.results.children?.failed || 0} failed</p>
                  <p>🎓 Enrollments: {results.results.enrollments?.successful || 0} successful, {results.results.enrollments?.failed || 0} failed</p>
                  <p>💳 Payments: {results.results.payments?.successful || 0} successful, {results.results.payments?.failed || 0} failed</p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
