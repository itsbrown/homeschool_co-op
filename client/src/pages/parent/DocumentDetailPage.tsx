import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { FileText, Loader2, ArrowLeft, Download, Printer, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/SupabaseProvider";
import { queryClient } from "@/lib/queryClient";
import { useRef } from "react";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { safeFormatDate } from "@/utils/safeFormatDate";

interface DocumentDetail {
  id: number;
  schoolName: string;
  signatoryName: string;
  signatoryEmail?: string | null;
  agreementContent: string;
  agreementVersion: string;
  signedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export default function DocumentDetailPage() {
  const { user, session } = useAuth();
  const params = useParams();
  const documentId = params.id;
  const printRef = useRef<HTMLDivElement>(null);

  const { data: signedDoc, isLoading, isError } = useQuery<DocumentDetail>({
    queryKey: ["/api/parent/documents", documentId],
    enabled: !!user && !!session && !!documentId,
    retry: 1,
  });

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Membership Agreement - ${signedDoc?.schoolName || "Document"}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
              line-height: 1.6;
            }
            h1 { font-size: 24px; margin-bottom: 20px; }
            .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
            .content { white-space: pre-wrap; }
            .signature-block {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
            }
            .signature-block p { margin: 5px 0; }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>Membership Agreement</h1>
          <div class="meta">
            <p><strong>${signedDoc?.schoolName}</strong></p>
            <p>Version ${signedDoc?.agreementVersion}</p>
          </div>
          <div class="content">${signedDoc?.agreementContent || ""}</div>
          <div class="signature-block">
            <p><strong>Electronically Signed By:</strong> ${signedDoc?.signatoryName}</p>
            <p><strong>Email:</strong> ${signedDoc?.signatoryEmail || ""}</p>
            <p><strong>Date:</strong> ${signedDoc?.signedAt ? safeFormatDate(signedDoc.signedAt, "PPpp") : ""}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownload = () => {
    if (!signedDoc) return;

    const content = `
MEMBERSHIP AGREEMENT
${signedDoc.schoolName}
Version ${signedDoc.agreementVersion}
================================================================================

${signedDoc.agreementContent}

================================================================================
ELECTRONIC SIGNATURE RECORD

Signed By: ${signedDoc.signatoryName}
Email: ${signedDoc.signatoryEmail || ""}
Date/Time: ${safeFormatDate(signedDoc.signedAt, "PPpp")}
IP Address: ${signedDoc.ipAddress || "Not recorded"}

This document was electronically signed in compliance with the Electronic 
Signatures in Global and National Commerce Act (ESIGN) and the Uniform 
Electronic Transactions Act (UETA).
================================================================================
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `membership-agreement-${signedDoc.schoolName.toLowerCase().replace(/\s+/g, "-")}-${signedDoc.agreementVersion}.txt`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ParentAppShell>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/parent/documents">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Documents
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading document...</span>
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-red-500 mb-2">Unable to load document.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/parent/documents", documentId] })}
                >
                  Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : !signedDoc ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg mb-1">Document not found</p>
                <p className="text-sm">This document may have been removed or you don't have access to view it.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                  <FileText className="h-7 w-7" />
                  Membership Agreement
                </h1>
                <p className="text-muted-foreground mt-1">
                  {signedDoc.schoolName} - Version {signedDoc.agreementVersion}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Agreement Details</CardTitle>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Signed
                  </Badge>
                </div>
                <CardDescription>
                  This agreement was electronically signed and is legally binding
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Signed By</p>
                    <p className="font-medium">{signedDoc.signatoryName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{signedDoc.signatoryEmail || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date Signed</p>
                    <p className="font-medium">{safeFormatDate(signedDoc.signedAt, "PPpp")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Agreement Version</p>
                    <p className="font-medium">{signedDoc.agreementVersion}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agreement Text</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  ref={printRef}
                  className="prose prose-sm max-w-none p-4 bg-white dark:bg-gray-950 rounded-lg border"
                  style={{ whiteSpace: "pre-wrap" }}
                  data-testid="membership-agreement-content"
                >
                  {signedDoc.agreementContent}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Signature Record</CardTitle>
                <CardDescription>
                  Electronic signature verification details for legal compliance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg text-sm">
                  <div>
                    <p className="text-muted-foreground">IP Address</p>
                    <p className="font-mono">{signedDoc.ipAddress || "Not recorded"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">User Agent</p>
                    <p className="font-mono text-xs break-all">{signedDoc.userAgent || "Not recorded"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground mt-2">
                      This document was electronically signed in compliance with the Electronic Signatures
                      in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ParentAppShell>
  );
}
