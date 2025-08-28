import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Brain, DollarSign, TrendingUp, AlertCircle, CheckCircle, Star } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';

interface PaymentPlanSuggestion {
  planType: 'full' | 'deposit' | 'split' | 'monthly';
  description: string;
  confidence: number;
  reasoning: string;
  recommendedAmount: number;
}

interface SmartPaymentPlansProps {
  enrollmentAmount: number;
  childIds: number[];
  onSelectPlan?: (planType: string) => void;
}

export default function SmartPaymentPlans({ 
  enrollmentAmount, 
  childIds, 
  onSelectPlan 
}: SmartPaymentPlansProps) {
  const { user } = useAuth();
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Fetch AI-powered payment plan suggestions
  const { data: suggestions, isLoading, refetch } = useQuery<{
    success: boolean;
    suggestions: PaymentPlanSuggestion[];
    familyProfile: any;
  }>({
    queryKey: ['/api/ai-insights/payment-plan-suggestions', user?.email, enrollmentAmount],
    enabled: false, // Only fetch when explicitly requested
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/ai-insights/payment-plan-suggestions', {
        parentEmail: user!.email,
        enrollmentAmount,
        childIds
      });
      return response.json();
    },
  });

  const handleGetSmartSuggestions = async () => {
    setIsLoadingSuggestions(true);
    try {
      await refetch();
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const getPlanTypeLabel = (planType: string) => {
    switch (planType) {
      case 'full': return 'Pay in Full';
      case 'deposit': return 'Deposit Only';
      case 'split': return 'Split Payment';
      case 'monthly': return 'Monthly Plan';
      default: return planType;
    }
  };

  const getPlanTypeColor = (planType: string) => {
    switch (planType) {
      case 'full': return 'bg-green-100 text-green-800';
      case 'deposit': return 'bg-blue-100 text-blue-800';
      case 'split': return 'bg-yellow-100 text-yellow-800';
      case 'monthly': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Default payment plans without AI suggestions
  const defaultPlans = [
    {
      planType: 'full' as const,
      description: 'Pay the complete amount now with potential early payment discount',
      confidence: 0.5,
      reasoning: 'Standard full payment option',
      recommendedAmount: enrollmentAmount
    },
    {
      planType: 'deposit' as const,
      description: 'Pay 10% deposit now, remaining balance due before class starts',
      confidence: 0.7,
      reasoning: 'Popular choice for securing enrollment with minimal upfront cost',
      recommendedAmount: Math.round(enrollmentAmount * 0.1)
    },
    {
      planType: 'split' as const,
      description: 'Split payment into two equal installments',
      confidence: 0.6,
      reasoning: 'Balanced approach for managing cash flow',
      recommendedAmount: Math.round(enrollmentAmount / 2)
    },
    {
      planType: 'monthly' as const,
      description: 'Spread payment over 3 monthly installments',
      confidence: 0.6,
      reasoning: 'Easiest on monthly budget',
      recommendedAmount: Math.round(enrollmentAmount / 3)
    }
  ];

  const plansToShow = suggestions?.success ? suggestions.suggestions : defaultPlans;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            Smart Payment Plans
          </h3>
          <p className="text-sm text-gray-600">
            AI-powered recommendations based on your payment history and preferences
          </p>
        </div>
        
        {!suggestions?.success && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleGetSmartSuggestions}
            disabled={isLoading || isLoadingSuggestions || !user?.email}
          >
            {isLoading || isLoadingSuggestions ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-2 h-4 w-4" />
            )}
            Get AI Suggestions
          </Button>
        )}
      </div>

      {suggestions?.success && suggestions.familyProfile && (
        <Alert>
          <TrendingUp className="h-4 w-4" />
          <AlertDescription>
            <strong>Family Profile Analysis:</strong> Based on {suggestions.familyProfile.totalPreviousPayments} previous payments 
            (avg: {formatCurrency(suggestions.familyProfile.averagePayment)}, 
            risk score: {suggestions.familyProfile.riskScore}/100)
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plansToShow.map((plan, index) => (
          <Card key={plan.planType} className={`relative ${index === 0 && suggestions?.success ? 'ring-2 ring-blue-500' : ''}`}>
            {index === 0 && suggestions?.success && (
              <div className="absolute -top-2 -right-2">
                <Badge className="bg-blue-600 text-white">
                  <Star className="h-3 w-3 mr-1" />
                  AI Recommended
                </Badge>
              </div>
            )}
            
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{getPlanTypeLabel(plan.planType)}</CardTitle>
                <Badge variant="secondary" className={getPlanTypeColor(plan.planType)}>
                  {plan.planType}
                </Badge>
              </div>
              <CardDescription className="text-sm">
                {plan.description}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">
                  {formatCurrency(plan.recommendedAmount)}
                </span>
                {suggestions?.success && (
                  <div className="flex items-center gap-1">
                    <div className={`h-2 w-2 rounded-full ${getConfidenceColor(plan.confidence)}`} />
                    <span className={`text-xs font-medium ${getConfidenceColor(plan.confidence)}`}>
                      {(plan.confidence * 100).toFixed(0)}% match
                    </span>
                  </div>
                )}
              </div>

              {suggestions?.success && plan.reasoning && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-700">
                    <strong>AI Insight:</strong> {plan.reasoning}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {plan.planType === 'full' && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700">No future payment worries</span>
                  </div>
                )}
                {plan.planType === 'deposit' && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-700">Secure spot with minimal upfront cost</span>
                  </div>
                )}
                {plan.planType === 'split' && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-700">Balanced payment schedule</span>
                  </div>
                )}
                {plan.planType === 'monthly' && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-purple-600" />
                    <span className="text-sm text-purple-700">Budget-friendly monthly payments</span>
                  </div>
                )}
              </div>

              <Button 
                className="w-full" 
                variant={index === 0 && suggestions?.success ? "default" : "outline"}
                onClick={() => onSelectPlan?.(plan.planType)}
              >
                Select {getPlanTypeLabel(plan.planType)}
                {index === 0 && suggestions?.success && (
                  <Star className="ml-2 h-4 w-4" />
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {(isLoading || isLoadingSuggestions) && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm text-gray-600">Analyzing your payment patterns...</span>
        </div>
      )}

      {!suggestions?.success && !isLoading && !isLoadingSuggestions && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Standard Plans:</strong> Get personalized AI recommendations based on your payment history by clicking "Get AI Suggestions" above.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}