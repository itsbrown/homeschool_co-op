import Anthropic from '@anthropic-ai/sdk';

/*
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model. However, if the user has already selected "claude-3-7-sonnet-20250219", keep that selection unless they explicitly request a change.
*/

// <important_do_not_delete>
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
// </important_do_not_delete>

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface PaymentPattern {
  averageAmount: number;
  paymentFrequency: 'monthly' | 'quarterly' | 'annually' | 'irregular';
  preferredMethod: string;
  seasonality: string[];
  riskScore: number;
  confidence: number;
}

export interface EnrollmentRecommendation {
  classId: number;
  className: string;
  confidence: number;
  reasons: string[];
  childId: number;
}

export interface PaymentPlanSuggestion {
  planType: 'full' | 'deposit' | 'split' | 'monthly';
  description: string;
  confidence: number;
  reasoning: string;
  recommendedAmount: number;
}

export interface StudentInsight {
  studentId: number;
  learningStyleMatch: number;
  engagementLevel: string;
  recommendedPrograms: string[];
  parentCommunicationPreference: string;
}

// Analyze payment patterns for a family
export async function analyzePaymentPatterns(paymentHistory: any[]): Promise<PaymentPattern> {
  try {
    const analysisPrompt = `
Analyze the following payment history data and extract patterns:

${JSON.stringify(paymentHistory, null, 2)}

Please analyze and return a JSON object with:
- averageAmount: average payment amount in cents
- paymentFrequency: 'monthly', 'quarterly', 'annually', or 'irregular'  
- preferredMethod: most used payment method
- seasonality: array of months with higher activity
- riskScore: 0-100 (0=low risk, 100=high risk) based on payment delays/failures
- confidence: 0-1 confidence in the analysis

Focus on identifying spending patterns, payment timing, and financial reliability indicators.
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are a financial analyst specialized in educational payment patterns. Analyze payment data and provide structured insights in valid JSON format only.`,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: analysisPrompt }
      ],
    });

    const result = JSON.parse(response.content[0].text);
    return result;
  } catch (error) {
    console.error('Error analyzing payment patterns:', error);
    return {
      averageAmount: 0,
      paymentFrequency: 'irregular',
      preferredMethod: 'unknown',
      seasonality: [],
      riskScore: 50,
      confidence: 0
    };
  }
}

// Generate enrollment recommendations based on student profile
export async function generateEnrollmentRecommendations(
  studentProfile: any,
  availableClasses: any[],
  enrollmentHistory: any[]
): Promise<EnrollmentRecommendation[]> {
  try {
    const prompt = `
Analyze this student profile and recommend suitable classes:

Student Profile:
${JSON.stringify(studentProfile, null, 2)}

Available Classes:
${JSON.stringify(availableClasses, null, 2)}

Enrollment History:
${JSON.stringify(enrollmentHistory, null, 2)}

Consider:
- Student's age, grade level, and interests
- Learning style compatibility  
- Previous enrollment patterns
- Class difficulty and prerequisites
- Schedule compatibility

Return a JSON array of recommendations with classId, className, confidence (0-1), reasons array, and childId.
Limit to top 5 recommendations.
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are an educational advisor that matches students with appropriate classes based on their profiles and learning needs. Return only valid JSON.`,
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const result = JSON.parse(response.content[0].text);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error generating enrollment recommendations:', error);
    return [];
  }
}

// Suggest optimal payment plans based on family financial profile
export async function suggestPaymentPlans(
  familyFinancialProfile: any,
  enrollmentAmount: number,
  paymentHistory: any[]
): Promise<PaymentPlanSuggestion[]> {
  try {
    const prompt = `
Based on this family's financial profile and payment history, suggest the best payment plan options:

Family Financial Profile:
${JSON.stringify(familyFinancialProfile, null, 2)}

Enrollment Amount: $${enrollmentAmount / 100}
Payment History:
${JSON.stringify(paymentHistory, null, 2)}

Consider:
- Historical payment patterns and preferences
- Family's cash flow indicators
- Risk assessment for payment defaults
- Seasonal payment trends

Provide payment plan suggestions with planType, description, confidence, reasoning, and recommendedAmount.
Available plan types: 'full', 'deposit', 'split', 'monthly'
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are a financial advisor specializing in educational payment planning. Recommend payment structures that balance school cash flow with family affordability. Return valid JSON only.`,
      max_tokens: 1200,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const result = JSON.parse(response.content[0].text);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error suggesting payment plans:', error);
    return [];
  }
}

// Predict class enrollment trends and capacity needs
export async function predictClassPopularity(
  historicalEnrollments: any[],
  classDetails: any[],
  seasonalTrends: any
): Promise<any> {
  try {
    const prompt = `
Predict class popularity and enrollment trends based on historical data:

Historical Enrollments:
${JSON.stringify(historicalEnrollments, null, 2)}

Class Details:
${JSON.stringify(classDetails, null, 2)}

Seasonal Trends:
${JSON.stringify(seasonalTrends, null, 2)}

Analyze and predict:
- Which classes will be most popular next season
- Recommended capacity adjustments
- Optimal scheduling suggestions
- New class opportunities
- Risk of under-enrollment

Return JSON with predictions, confidence scores, and actionable recommendations.
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are an education analytics specialist who predicts enrollment trends and helps optimize class offerings. Focus on data-driven insights and practical recommendations. Return valid JSON only.`,
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const result = JSON.parse(response.content[0].text);
    return result;
  } catch (error) {
    console.error('Error predicting class popularity:', error);
    return {
      predictions: [],
      recommendations: [],
      confidence: 0
    };
  }
}

// Generate personalized payment reminder messages
export async function generatePaymentReminder(
  parentName: string,
  childName: string,
  amountDue: number,
  dueDate: string,
  paymentHistory: any[],
  personalityProfile?: any
): Promise<string> {
  try {
    const prompt = `
Generate a personalized payment reminder for:
- Parent: ${parentName}
- Child: ${childName}
- Amount Due: $${amountDue / 100}
- Due Date: ${dueDate}
- Payment History: ${JSON.stringify(paymentHistory.slice(-3), null, 2)}
- Personality Profile: ${JSON.stringify(personalityProfile, null, 2)}

Create a friendly, encouraging reminder that:
- Uses appropriate tone based on payment history
- References the child by name
- Provides clear next steps
- Maintains positive relationship
- Is concise but warm

Return just the message text, no JSON wrapper.
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are a friendly school administrator who writes personalized, empathetic payment reminders that maintain positive relationships with families while encouraging timely payment.`,
      max_tokens: 500,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    return response.content[0].text.trim();
  } catch (error) {
    console.error('Error generating payment reminder:', error);
    return `Hi ${parentName}, friendly reminder that ${childName}'s payment of $${amountDue / 100} is due on ${dueDate}. Thank you for your continued support!`;
  }
}

// Analyze student engagement and provide insights
export async function analyzeStudentEngagement(
  studentData: any,
  classAttendance: any[],
  parentFeedback: any[]
): Promise<StudentInsight> {
  try {
    const prompt = `
Analyze student engagement and learning effectiveness:

Student Data:
${JSON.stringify(studentData, null, 2)}

Class Attendance:
${JSON.stringify(classAttendance, null, 2)}

Parent Feedback:
${JSON.stringify(parentFeedback, null, 2)}

Provide insights on:
- Learning style match (0-100 score)
- Engagement level (high/medium/low)
- Recommended programs/interventions
- Parent communication preferences
- Success indicators and concerns

Return JSON with studentId, learningStyleMatch, engagementLevel, recommendedPrograms, and parentCommunicationPreference.
`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      system: `You are an educational psychologist who analyzes student engagement patterns and provides actionable insights for improving learning outcomes. Return valid JSON only.`,
      max_tokens: 1000,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const result = JSON.parse(response.content[0].text);
    return result;
  } catch (error) {
    console.error('Error analyzing student engagement:', error);
    return {
      studentId: studentData?.id || 0,
      learningStyleMatch: 50,
      engagementLevel: 'medium',
      recommendedPrograms: [],
      parentCommunicationPreference: 'email'
    };
  }
}