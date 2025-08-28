import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface TechnicalIssue {
  id: string;
  userEmail: string;
  userRole: string;
  issueType: 'navigation' | 'payment' | 'ui' | 'performance' | 'authentication' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  userAgent: string;
  url: string;
  browserInfo: {
    browser: string;
    version: string;
    platform: string;
  };
  reproductionSteps: string[];
  recommendedActions: string[];
  timestamp: Date;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  assignedTo?: string;
  resolution?: string;
}

export class AITechnicalSupportService {
  async analyzeUserIssue(userInput: {
    description: string;
    userEmail: string;
    userRole: string;
    currentUrl: string;
    userAgent: string;
    browserInfo: any;
    attemptedActions: string[];
  }): Promise<{
    diagnosis: string;
    issueType: TechnicalIssue['issueType'];
    severity: TechnicalIssue['severity'];
    recommendedActions: string[];
    reproductionSteps: string[];
    requiresAdminNotification: boolean;
  }> {
    try {
      const prompt = `You are an AI technical support specialist for an educational platform. A user is experiencing an issue.

User Details:
- Email: ${userInput.userEmail}
- Role: ${userInput.userRole}
- Current URL: ${userInput.currentUrl}
- Browser: ${userInput.browserInfo.browser} ${userInput.browserInfo.version} on ${userInput.browserInfo.platform}

Issue Description: "${userInput.description}"

Actions they tried: ${userInput.attemptedActions.join(', ')}

Please analyze this issue and provide:
1. A clear diagnosis of what's likely causing the problem
2. The issue type (navigation, payment, ui, performance, authentication, other)
3. Severity level (low, medium, high, critical)
4. Step-by-step recommended actions for the user to try
5. Steps to reproduce the issue for debugging
6. Whether this requires immediate admin notification

Respond in JSON format:
{
  "diagnosis": "Clear explanation of the likely cause",
  "issueType": "category",
  "severity": "level", 
  "recommendedActions": ["action1", "action2"],
  "reproductionSteps": ["step1", "step2"],
  "requiresAdminNotification": boolean
}`;

      const response = await anthropic.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('AI analysis failed:', error);
      return {
        diagnosis: "Unable to analyze the issue automatically. This appears to be a technical problem that needs admin attention.",
        issueType: 'other' as const,
        severity: 'medium' as const,
        recommendedActions: [
          "Try refreshing the page",
          "Clear your browser cache and cookies", 
          "Try using a different browser",
          "Contact support if the issue persists"
        ],
        reproductionSteps: [
          "Navigate to the page where the issue occurred",
          "Attempt the same action that failed"
        ],
        requiresAdminNotification: true
      };
    }
  }

  async generateUserResponse(issue: {
    diagnosis: string;
    recommendedActions: string[];
    userFirstName: string;
  }): Promise<string> {
    try {
      const prompt = `You are a friendly technical support AI assistant for an educational platform. A user named ${issue.userFirstName} is experiencing a technical issue.

Diagnosis: ${issue.diagnosis}
Recommended actions: ${issue.recommendedActions.join(', ')}

Write a helpful, empathetic response that:
1. Acknowledges their frustration
2. Explains what's likely happening in simple terms
3. Provides clear steps they can try
4. Reassures them that the issue will be tracked and resolved
5. Uses a warm, professional tone

Keep it concise but thorough.`;

      const response = await anthropic.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Response generation failed:', error);
      return `Hi ${issue.userFirstName}, I understand you're having trouble with the platform. I've analyzed your issue and have some suggestions that should help. I've also notified our technical team so they can investigate and fix the underlying problem. You'll receive an update once it's resolved.`;
    }
  }

  async checkSystemHealth(): Promise<{
    overallHealth: 'healthy' | 'warning' | 'critical';
    issues: Array<{
      component: string;
      status: string;
      message: string;
    }>;
  }> {
    const issues = [];
    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check critical endpoints
    const criticalEndpoints = [
      '/api/auth/status',
      '/api/health',
      '/api/payments/status'
    ];

    for (const endpoint of criticalEndpoints) {
      try {
        const response = await fetch(`http://localhost:5000${endpoint}`, {
          timeout: 5000
        });
        if (!response.ok) {
          issues.push({
            component: endpoint,
            status: 'error',
            message: `HTTP ${response.status}`
          });
          overallHealth = 'warning';
        }
      } catch (error) {
        issues.push({
          component: endpoint,
          status: 'critical',
          message: 'Endpoint unreachable'
        });
        overallHealth = 'critical';
      }
    }

    return {
      overallHealth,
      issues
    };
  }

  generateIssueId(): string {
    return `TECH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  formatIssueForAdmin(issue: TechnicalIssue): string {
    return `
🚨 Technical Issue Report - ${issue.severity.toUpperCase()}

Issue ID: ${issue.id}
User: ${issue.userEmail} (${issue.userRole})
Issue Type: ${issue.issueType}
Reported: ${issue.timestamp.toLocaleString()}

Problem: ${issue.title}
Description: ${issue.description}

Browser: ${issue.browserInfo.browser} ${issue.browserInfo.version}
Platform: ${issue.browserInfo.platform}
URL: ${issue.url}

Reproduction Steps:
${issue.reproductionSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Recommended Actions:
${issue.recommendedActions.map((action, i) => `${i + 1}. ${action}`).join('\n')}

Status: ${issue.status}
    `;
  }
}