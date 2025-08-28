import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Loader2, Brain, TrendingUp, Users, DollarSign, AlertCircle, CheckCircle, Star, ArrowRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { useAuth } from '@/components/SupabaseProvider';

interface PaymentPattern {
  averageAmount: number;
  paymentFrequency: 'monthly' | 'quarterly' | 'annually' | 'irregular';
  preferredMethod: string;
  seasonality: string[];
  riskScore: number;
  confidence: number;
}

interface EnrollmentRecommendation {
  classId: number;
  className: string;
  confidence: number;
  reasons: string[];
  childId: number;
}

interface PaymentPlanSuggestion {
  planType: 'full' | 'deposit' | 'split' | 'monthly';
  description: string;
  confidence: number;
  reasoning: string;
  recommendedAmount: number;
}

interface FamilyInsights {
  paymentPatterns: PaymentPattern | null;
  childInsights: Array<{
    child: {
      id: number;
      firstName: string;
      gradeLevel: string;
      interests: string[];
    };
    recommendations: EnrollmentRecommendation[];
    currentEnrollments: number;
  }>;
  totalChildren: number;
  totalPayments: number;
  analysisDate: string;
}

export default function AIInsightsDashboard() {
  const { user } = useAuth();
  const [selectedChild, setSelectedChild] = useState<number | null>(null);

  // Fetch family insights
  const { data: familyInsights, isLoading: insightsLoading } = useQuery<{ success: boolean; familyInsights: FamilyInsights }>({
    queryKey: ['/api/ai-insights/family-insights', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/ai-insights/family-insights/${encodeURIComponent(user!.email)}`);
      return response.json();
    },
  });

  // Fetch class popularity predictions
  const { data: classPopularity, isLoading: popularityLoading } = useQuery({
    queryKey: ['/api/ai-insights/class-popularity-predictions'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/ai-insights/class-popularity-predictions');
      return response.json();
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const getRiskColor = (riskScore: number) => {
    if (riskScore < 30) return 'text-green-600';
    if (riskScore < 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRiskLabel = (riskScore: number) => {
    if (riskScore < 30) return 'Low Risk';
    if (riskScore < 70) return 'Medium Risk';
    return 'High Risk';
  };

  if (insightsLoading) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <span className="text-lg">Analyzing your family's data...</span>
          </div>
        </div>
      </ParentAppShell>
    );
  }

  if (!familyInsights?.success || !familyInsights.familyInsights) {
    return (
      <ParentAppShell>
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <Card>
            <CardContent className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No data available for AI insights analysis</p>
              <p className="text-sm text-gray-500 mt-2">Make some payments and enrollments to see personalized insights</p>
            </CardContent>
          </Card>
        </div>
      </ParentAppShell>
    );
  }

  const { familyInsights: insights } = familyInsights;

  return (
    <ParentAppShell>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" />
            AI Family Insights
          </h1>
          <p className="text-gray-600 mt-2">
            Personalized recommendations and insights powered by AI analysis of your family's educational journey
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="payment-insights">Payment Insights</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Children</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{insights.totalChildren}</div>
                  <p className="text-xs text-muted-foreground">
                    Active in your family
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Payment History</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{insights.totalPayments}</div>
                  <p className="text-xs text-muted-foreground">
                    Total transactions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Risk Assessment</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getRiskColor(insights.paymentPatterns?.riskScore || 50)}`}>
                    {getRiskLabel(insights.paymentPatterns?.riskScore || 50)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Payment reliability score
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Children Overview</CardTitle>
                  <CardDescription>Your children's educational progress</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {insights.childInsights.map((childInsight) => (
                    <div key={childInsight.child.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">{childInsight.child.firstName}</h3>
                        <p className="text-sm text-gray-600">Grade {childInsight.child.gradeLevel}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {childInsight.child.interests?.slice(0, 3).map((interest, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {interest}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{childInsight.recommendations.length} recommendations</p>
                        <p className="text-xs text-gray-600">{childInsight.currentEnrollments} current enrollments</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {insights.paymentPatterns && (
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Profile</CardTitle>
                    <CardDescription>Your family's payment patterns</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Average Payment</span>
                        <span className="font-medium">{formatCurrency(insights.paymentPatterns.averageAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Frequency</span>
                        <span className="font-medium capitalize">{insights.paymentPatterns.paymentFrequency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Preferred Method</span>
                        <span className="font-medium capitalize">{insights.paymentPatterns.preferredMethod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Risk Score</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${getRiskColor(insights.paymentPatterns.riskScore)}`}>
                            {insights.paymentPatterns.riskScore}/100
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="text-sm text-gray-600">Analysis Confidence</label>
                      <Progress value={insights.paymentPatterns.confidence * 100} className="mt-2" />
                      <p className="text-xs text-gray-500 mt-1">
                        {(insights.paymentPatterns.confidence * 100).toFixed(1)}% confidence
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-6 mt-6">
            <div className="space-y-6">
              {insights.childInsights.map((childInsight) => (
                <Card key={childInsight.child.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Recommendations for {childInsight.child.firstName}
                      <Badge variant="outline">Grade {childInsight.child.gradeLevel}</Badge>
                    </CardTitle>
                    <CardDescription>
                      AI-powered class recommendations based on interests and learning profile
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {childInsight.recommendations.length > 0 ? (
                      <div className="space-y-4">
                        {childInsight.recommendations.map((rec, idx) => (
                          <div key={rec.classId} className="flex items-start justify-between p-4 border rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{rec.className}</h3>
                                <div className="flex items-center gap-1">
                                  <Star className="h-4 w-4 text-yellow-500" />
                                  <span className="text-sm font-medium">
                                    {(rec.confidence * 100).toFixed(0)}% match
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2">
                                <p className="text-sm text-gray-600 mb-2">Why this is recommended:</p>
                                <ul className="text-sm text-gray-700 space-y-1">
                                  {rec.reasons.slice(0, 3).map((reason, reasonIdx) => (
                                    <li key={reasonIdx} className="flex items-start gap-2">
                                      <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                                      {reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="ml-4">
                              View Class <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-center py-4">
                        No recommendations available yet. Enroll in more classes to get personalized suggestions.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="payment-insights" className="space-y-6 mt-6">
            {insights.paymentPatterns ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Behavior Analysis</CardTitle>
                    <CardDescription>Insights from your payment history</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Payment Consistency</span>
                        <Badge variant={insights.paymentPatterns.paymentFrequency === 'irregular' ? 'destructive' : 'default'}>
                          {insights.paymentPatterns.paymentFrequency === 'irregular' ? 'Irregular' : 'Regular'}
                        </Badge>
                      </div>
                      
                      {insights.paymentPatterns.seasonality.length > 0 && (
                        <div>
                          <span className="text-sm text-gray-600">Peak Payment Months</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {insights.paymentPatterns.seasonality.map((month) => (
                              <Badge key={month} variant="secondary" className="text-xs">
                                {month}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t">
                        <h4 className="font-medium mb-2">Risk Assessment</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Payment Risk Score</span>
                            <span className={`font-medium ${getRiskColor(insights.paymentPatterns.riskScore)}`}>
                              {insights.paymentPatterns.riskScore}/100
                            </span>
                          </div>
                          <Progress 
                            value={insights.paymentPatterns.riskScore} 
                            className="h-2"
                          />
                          <p className="text-xs text-gray-500">
                            Lower scores indicate more reliable payment patterns
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment Recommendations</CardTitle>
                    <CardDescription>Optimize your payment approach</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {insights.paymentPatterns.riskScore > 70 ? (
                        <div className="p-4 bg-red-50 border-l-4 border-red-400 rounded">
                          <h4 className="font-medium text-red-800">Consider Payment Plans</h4>
                          <p className="text-sm text-red-700 mt-1">
                            Breaking large payments into smaller installments might help maintain consistency
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-green-50 border-l-4 border-green-400 rounded">
                          <h4 className="font-medium text-green-800">Great Payment History!</h4>
                          <p className="text-sm text-green-700 mt-1">
                            Your consistent payment pattern qualifies you for full payment discounts
                          </p>
                        </div>
                      )}

                      {insights.paymentPatterns.paymentFrequency === 'monthly' && (
                        <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                          <h4 className="font-medium text-blue-800">Monthly Payment Option</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            Your monthly payment preference makes you ideal for our installment plans
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <DollarSign className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No payment history available</p>
                  <p className="text-sm text-gray-500 mt-2">Make your first payment to see payment insights</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-6 mt-6">
            {popularityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Analyzing class trends...</span>
              </div>
            ) : classPopularity?.success ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Class Popularity Trends
                  </CardTitle>
                  <CardDescription>
                    AI predictions for upcoming enrollment trends
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {classPopularity.predictions ? (
                    <div className="space-y-4">
                      <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto">
                        {JSON.stringify(classPopularity.predictions, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-gray-600">Trend analysis coming soon...</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Trend analysis unavailable</p>
                  <p className="text-sm text-gray-500 mt-2">Not enough historical data for predictions</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ParentAppShell>
  );
}