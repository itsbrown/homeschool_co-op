import { Fragment, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Mail, RefreshCw } from 'lucide-react';

type CollectionsFilter =
  | 'all'
  | 'late'
  | 'no_payment_plan'
  | 'auto_pay'
  | 'never_paid'
  | 'membership';

interface CollectionFamily {
  parentId: number;
  parentEmail: string;
  parentName: string;
  phone: string | null;
  autoPayEnabled: boolean;
  tuitionOwedCents: number;
  membershipOwedCents: number;
  totalOwedCents: number;
  hasPaymentPlan: boolean;
  hasLatePayment: boolean;
  neverPaidTuition: boolean;
  owesMembership: boolean;
  enrollments: Array<{
    enrollmentId: number;
    childName: string | null;
    className: string | null;
    outstandingCents: number;
    hasPaymentPlan: boolean;
    isLate: boolean;
    neverPaid: boolean;
  }>;
  memberships: Array<{
    id: number;
    membershipYear: number;
    balanceDueCents: number;
    status: string;
  }>;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents || 0) / 100,
  );
}

type Props = {
  enabled: boolean;
  /** When summary card shows a balance but collections is empty, show a hint */
  summaryOutstandingCents?: number;
};

export default function CollectionsOverviewTab({ enabled, summaryOutstandingCents = 0 }: Props) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<CollectionsFilter>('all');
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{
    families: CollectionFamily[];
    summary: {
      familiesWithBalance: number;
      totalTuitionOwedCents: number;
      totalMembershipOwedCents: number;
      totalOwedCents: number;
      lateFamilies: number;
      noPaymentPlanFamilies: number;
      autoPayFamilies: number;
      neverPaidFamilies: number;
      membershipOwedFamilies: number;
    };
  }>({
    queryKey: ['/api/admin/financial-reports/collections-overview'],
    enabled,
    staleTime: 0,
  });

  const families = data?.families ?? [];
  const summary = data?.summary;

  const sendOneMutation = useMutation({
    mutationFn: async (parentEmail: string) => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/collections/send-balance-email', {
        parentEmail,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Email sent',
        description: 'Personalized balance summary with pay link was sent to the family.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/reminder-history'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Email failed', description: err.message, variant: 'destructive' });
    },
    onSettled: () => setSendingEmail(null),
  });

  const sendBulkMutation = useMutation({
    mutationFn: async (parentEmails: string[]) => {
      const response = await apiRequest('POST', '/api/admin/financial-reports/collections/send-balance-emails', {
        parentEmails,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send emails');
      }
      return data as { sent: number; failed: number; total: number };
    },
    onSuccess: (data) => {
      toast({
        title: 'Emails sent',
        description: `Sent ${data.sent} of ${data.total} balance summary email(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/financial-reports/reminder-history'] });
      setBulkConfirmOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Bulk email failed', description: err.message, variant: 'destructive' });
    },
  });

  const filtered = families.filter((family) => {
    switch (filter) {
      case 'late':
        return family.hasLatePayment;
      case 'no_payment_plan':
        return family.tuitionOwedCents > 0 && !family.hasPaymentPlan;
      case 'auto_pay':
        return family.autoPayEnabled && family.totalOwedCents > 0;
      case 'never_paid':
        return family.neverPaidTuition;
      case 'membership':
        return family.owesMembership;
      default:
        return true;
    }
  });

  const apiTotalOwed = summary?.totalOwedCents ?? 0;
  const summaryMismatch =
    summaryOutstandingCents > 0 && apiTotalOwed === 0 && families.length === 0 && !isLoading && !isError;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Collections Overview</CardTitle>
            <CardDescription>
              Who still owes tuition or membership, who has a payment plan, auto-pay, late payments,
              and families who have never paid
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {filtered.length > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={sendBulkMutation.isPending}
              >
                {sendBulkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-1" />
                )}
                Email {filter === 'all' ? 'all families' : 'filtered'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={!enabled || isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load collections</AlertTitle>
            <AlertDescription>
              {(error as Error)?.message ||
                'The server may need a restart after deploy. Try Refresh or check the Network tab for collections-overview.'}
            </AlertDescription>
          </Alert>
        )}

        {summaryMismatch && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Summary shows {formatCurrency(summaryOutstandingCents)} outstanding</AlertTitle>
            <AlertDescription>
              Collections returned no families. Try <strong>Sync Data</strong> on Outstanding Balances,
              or open{' '}
              <code className="text-xs">/api/admin/financial-reports/collections-overview?debug=1</code>{' '}
              in the network tab after refresh.
            </AlertDescription>
          </Alert>
        )}

        {summary && (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { key: 'all' as const, label: 'All', count: summary.familiesWithBalance },
              { key: 'late' as const, label: 'Late', count: summary.lateFamilies },
              { key: 'no_payment_plan' as const, label: 'No plan', count: summary.noPaymentPlanFamilies },
              { key: 'auto_pay' as const, label: 'Auto-pay on', count: summary.autoPayFamilies },
              { key: 'never_paid' as const, label: 'Never paid', count: summary.neverPaidFamilies },
              { key: 'membership' as const, label: 'Membership', count: summary.membershipOwedFamilies },
            ].map((chip) => (
              <Button
                key={chip.key}
                variant={filter === chip.key ? 'default' : 'outline'}
                size="sm"
                className="justify-between"
                onClick={() => setFilter(chip.key)}
              >
                <span>{chip.label}</span>
                <Badge variant="secondary">{chip.count}</Badge>
              </Button>
            ))}
          </div>
        )}

        {summary && apiTotalOwed > 0 && (
          <p className="text-sm text-muted-foreground">
            Total owed across {summary.familiesWithBalance} families:{' '}
            <span className="font-medium text-foreground">{formatCurrency(apiTotalOwed)}</span>
            {summary.totalTuitionOwedCents > 0 && summary.totalMembershipOwedCents > 0 && (
              <>
                {' '}
                (tuition {formatCurrency(summary.totalTuitionOwedCents)} · membership{' '}
                {formatCurrency(summary.totalMembershipOwedCents)})
              </>
            )}
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Family</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Tuition owed</TableHead>
                <TableHead className="text-right">Membership</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px] text-right">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((family) => {
                const isOpen = expandedFamily === family.parentEmail;
                const isSending = sendingEmail === family.parentEmail;
                return (
                  <Fragment key={family.parentEmail}>
                    <TableRow className="hover:bg-muted/50">
                      <TableCell
                        className="cursor-pointer"
                        onClick={() => setExpandedFamily(isOpen ? null : family.parentEmail)}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell
                        className="cursor-pointer"
                        onClick={() => setExpandedFamily(isOpen ? null : family.parentEmail)}
                      >
                        <p className="font-medium">{family.parentName}</p>
                        <p className="text-xs text-muted-foreground">{family.parentEmail}</p>
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground cursor-pointer"
                        onClick={() => setExpandedFamily(isOpen ? null : family.parentEmail)}
                      >
                        {family.phone || '—'}
                      </TableCell>
                      <TableCell
                        className="text-right cursor-pointer"
                        onClick={() => setExpandedFamily(isOpen ? null : family.parentEmail)}
                      >
                        {family.tuitionOwedCents > 0 ? formatCurrency(family.tuitionOwedCents) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {family.membershipOwedCents > 0
                          ? formatCurrency(family.membershipOwedCents)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(family.totalOwedCents)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {family.hasLatePayment && <Badge variant="destructive">Late</Badge>}
                          {family.tuitionOwedCents > 0 && !family.hasPaymentPlan && (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              No plan
                            </Badge>
                          )}
                          {family.autoPayEnabled && <Badge variant="outline">Auto-pay</Badge>}
                          {family.neverPaidTuition && <Badge variant="secondary">Never paid</Badge>}
                          {family.owesMembership && <Badge variant="outline">Membership</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSending || sendOneMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSendingEmail(family.parentEmail);
                            sendOneMutation.mutate(family.parentEmail);
                          }}
                          title="Send personalized balance email with pay link"
                        >
                          {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
                          <div className="space-y-3 text-sm">
                            {family.enrollments.map((enr) => (
                              <div
                                key={enr.enrollmentId}
                                className="flex justify-between border-b border-border/50 pb-2 last:border-0"
                              >
                                <span>
                                  {enr.childName} — {enr.className}
                                  {enr.neverPaid && (
                                    <span className="text-amber-600 ml-2">(no payments yet)</span>
                                  )}
                                  {enr.isLate && <span className="text-red-600 ml-2">(late)</span>}
                                  {!enr.hasPaymentPlan && (
                                    <span className="text-yellow-700 ml-2">(no payment plan)</span>
                                  )}
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(enr.outstandingCents)}
                                </span>
                              </div>
                            ))}
                            {family.memberships.map((m) => (
                              <div
                                key={m.id}
                                className="flex justify-between text-muted-foreground"
                              >
                                <span>
                                  Membership {m.membershipYear} ({m.status})
                                </span>
                                <span>{formatCurrency(m.balanceDueCents)}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        ) : !isError ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            {filter === 'all'
              ? 'No families with an outstanding balance'
              : 'No families match this filter'}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Emails include a line-by-line balance summary (tuition + membership) and a secure link to
          sign in and pay on the billing page.
        </p>
      </CardContent>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email balance summaries?</AlertDialogTitle>
            <AlertDialogDescription>
              Send a personalized email to {filtered.length} famil{filtered.length === 1 ? 'y' : 'ies'}{' '}
              {filter === 'all' ? 'with an outstanding balance' : `matching the "${filter.replace(/_/g, ' ')}" filter`}.
              Each email lists what they owe and includes a pay link to your billing page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendBulkMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendBulkMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                sendBulkMutation.mutate(filtered.map((f) => f.parentEmail));
              }}
            >
              {sendBulkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin inline" />
                  Sending…
                </>
              ) : (
                `Send ${filtered.length} email${filtered.length === 1 ? '' : 's'}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
