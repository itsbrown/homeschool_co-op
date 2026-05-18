import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';

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

export default function CollectionsOverviewTab({ enabled }: { enabled: boolean }) {
  const [filter, setFilter] = useState<CollectionsFilter>('all');
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    families: CollectionFamily[];
    summary: {
      familiesWithBalance: number;
      lateFamilies: number;
      noPaymentPlanFamilies: number;
      autoPayFamilies: number;
      neverPaidFamilies: number;
      membershipOwedFamilies: number;
    };
  }>({
    queryKey: ['/api/admin/financial-reports/collections-overview'],
    enabled,
  });

  const families = data?.families ?? [];
  const summary = data?.summary;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collections Overview</CardTitle>
        <CardDescription>
          Who still owes tuition or membership, who has a payment plan, auto-pay, late payments, and
          families who have never paid
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((family) => {
                const isOpen = expandedFamily === family.parentEmail;
                return (
                  <Fragment key={family.parentEmail}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedFamily(isOpen ? null : family.parentEmail)}
                    >
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{family.parentName}</p>
                        <p className="text-xs text-muted-foreground">{family.parentEmail}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{family.phone || '—'}</TableCell>
                      <TableCell className="text-right">
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
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 p-4">
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
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            No families match this filter
          </div>
        )}
      </CardContent>
    </Card>
  );
}
