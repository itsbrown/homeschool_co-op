import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface FinancialSummary {
  totalRevenue: number;
  totalCollected: number;
  outstandingBalance: number;
  paymentPlanProgress: number;
  enrollmentCount: number;
  averagePaymentAmount: number;
}

export interface RevenueTrend {
  month: string;
  revenue: number;
  collected: number;
}

export interface CFOInsight {
  category: 'revenue' | 'collections' | 'risk' | 'opportunity' | 'forecast';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  metric?: string;
  recommendation?: string;
}

export interface CFOAnalysisResult {
  insights: CFOInsight[];
  executiveSummary: string;
  generatedAt: string;
}

export async function generateCFOInsights(
  summary: FinancialSummary,
  revenueTrends: RevenueTrend[],
  outstandingBalances: any[],
  paymentPlans: any[]
): Promise<CFOAnalysisResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return getDefaultInsights(summary);
    }

    const collectionRate = summary.totalRevenue > 0 
      ? ((summary.totalCollected / summary.totalRevenue) * 100).toFixed(1)
      : '0';

    const prompt = `
You are a CFO-level financial analyst for an educational organization. Analyze this financial data and provide actionable insights.

FINANCIAL SUMMARY:
- Total Revenue (invoiced): $${(summary.totalRevenue / 100).toFixed(2)}
- Total Collected: $${(summary.totalCollected / 100).toFixed(2)}
- Outstanding Balance: $${(summary.outstandingBalance / 100).toFixed(2)}
- Collection Rate: ${collectionRate}%
- Payment Plan Progress: ${summary.paymentPlanProgress.toFixed(1)}%
- Total Enrollments: ${summary.enrollmentCount}
- Average Payment: $${(summary.averagePaymentAmount / 100).toFixed(2)}

REVENUE TRENDS (Last 6 months):
${revenueTrends.map(t => `${t.month}: Revenue $${(t.revenue / 100).toFixed(2)}, Collected $${(t.collected / 100).toFixed(2)}`).join('\n')}

OUTSTANDING BALANCES (${outstandingBalances.length} families with balances):
${outstandingBalances.slice(0, 5).map(b => `- ${b.familyName}: $${(b.balance / 100).toFixed(2)} (${b.daysOverdue} days overdue)`).join('\n')}

PAYMENT PLANS (${paymentPlans.length} active):
${paymentPlans.slice(0, 5).map(p => `- ${p.familyName}: ${p.progress}% complete, $${(p.remainingBalance / 100).toFixed(2)} remaining`).join('\n')}

Provide your analysis as a JSON object with this structure:
{
  "executiveSummary": "2-3 sentence overview of financial health",
  "insights": [
    {
      "category": "revenue|collections|risk|opportunity|forecast",
      "title": "Short insight title",
      "description": "Detailed explanation (1-2 sentences)",
      "priority": "high|medium|low",
      "metric": "optional key metric like '85% collection rate'",
      "recommendation": "optional specific action to take"
    }
  ]
}

Provide 3-5 insights covering:
1. Collection health and any concerns
2. Revenue trend analysis
3. At-risk accounts needing attention
4. Opportunities for improvement
5. Short-term forecast if possible

Focus on actionable, school-admin-friendly language. Return only valid JSON.
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are a CFO-level financial analyst specializing in educational organizations. Provide clear, actionable insights for school administrators. Always return valid JSON only.`,
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    
    let jsonText = contentBlock.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }
    
    const result = JSON.parse(jsonText);
    
    return {
      insights: result.insights || [],
      executiveSummary: result.executiveSummary || 'Analysis complete.',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[CFO Insights] Error generating insights:', error);
    return getDefaultInsights(summary);
  }
}

function getDefaultInsights(summary: FinancialSummary): CFOAnalysisResult {
  const collectionRate = summary.totalRevenue > 0 
    ? (summary.totalCollected / summary.totalRevenue) * 100 
    : 0;

  const insights: CFOInsight[] = [];

  if (collectionRate >= 90) {
    insights.push({
      category: 'collections',
      title: 'Strong Collection Rate',
      description: `Your ${collectionRate.toFixed(1)}% collection rate exceeds industry benchmarks.`,
      priority: 'low',
      metric: `${collectionRate.toFixed(1)}%`,
    });
  } else if (collectionRate >= 70) {
    insights.push({
      category: 'collections',
      title: 'Collection Rate Needs Attention',
      description: `At ${collectionRate.toFixed(1)}%, consider follow-up on outstanding balances.`,
      priority: 'medium',
      metric: `${collectionRate.toFixed(1)}%`,
      recommendation: 'Review accounts 30+ days overdue for payment reminders.',
    });
  } else {
    insights.push({
      category: 'risk',
      title: 'Low Collection Rate Alert',
      description: `Collection rate of ${collectionRate.toFixed(1)}% requires immediate attention.`,
      priority: 'high',
      metric: `${collectionRate.toFixed(1)}%`,
      recommendation: 'Prioritize outreach to families with outstanding balances.',
    });
  }

  if (summary.outstandingBalance > 0) {
    insights.push({
      category: 'revenue',
      title: 'Outstanding Balance Summary',
      description: `$${(summary.outstandingBalance / 100).toFixed(2)} in outstanding balances to collect.`,
      priority: summary.outstandingBalance > summary.totalCollected * 0.2 ? 'high' : 'medium',
      metric: `$${(summary.outstandingBalance / 100).toFixed(2)}`,
    });
  }

  if (summary.paymentPlanProgress > 0) {
    insights.push({
      category: 'forecast',
      title: 'Payment Plan Progress',
      description: `Payment plans are ${summary.paymentPlanProgress.toFixed(1)}% complete on average.`,
      priority: 'low',
      metric: `${summary.paymentPlanProgress.toFixed(1)}%`,
    });
  }

  return {
    insights,
    executiveSummary: `Revenue of $${(summary.totalRevenue / 100).toFixed(2)} with ${collectionRate.toFixed(1)}% collection rate. ${summary.outstandingBalance > 0 ? `$${(summary.outstandingBalance / 100).toFixed(2)} outstanding.` : 'All balances collected.'}`,
    generatedAt: new Date().toISOString(),
  };
}

export function isAIAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
