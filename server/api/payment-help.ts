import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Too many requests. Please wait a moment before asking another question.' }
});

let anthropic: Anthropic | null = null;

try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
} catch (error) {
  console.error('Failed to initialize Anthropic for payment help:', error);
}

const MODEL = 'claude-3-7-sonnet-20250219';

interface PaymentHelpMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a friendly, helpful payment assistant for American Seekers Academy - a homeschool co-op management platform. Your job is to help parents understand their payments, resolve checkout issues, and answer billing questions.

You have access to the parent's ACTUAL payment context (membership status, outstanding balance, payment plans, upcoming payments). Use this information to give personalized, accurate answers.

CRITICAL RULES:

1. **Be specific and helpful**: Reference their actual amounts, due dates, and membership status when relevant.

2. **Common issues you help with**:
   - "Why is my total higher than expected?" → Check if membership fee is included (expired membership adds $175)
   - "Why can't I checkout?" → Could be expired membership, payment method issue, or cart pricing mismatch
   - "How do payment plans work?" → Explain installment options
   - "When is my next payment due?" → Reference their specific payment schedule
   - "What is the membership fee?" → Explain annual membership requirement and renewal

3. **Membership fee explanation**: The school requires an annual membership ($175). If it's expired, it gets added to checkout automatically. This is the most common reason for "unexpected" charges.

4. **Payment plans**: Parents can set up payment plans for classes. Explain how installments work, when payments are due.

5. **Be warm and reassuring**: Payment issues are stressful. Be patient and understanding.

6. **Format for clarity**: Use **bold** for amounts and important terms. Use bullet points for lists.

7. **Escalation**: If you can't resolve an issue, suggest they contact the school administrator.

EXAMPLE RESPONSES:

User: "Why am I being charged $175 extra?"
Good response: "That $175 is your **annual membership fee**. I can see your membership expired, so it's been added to your checkout automatically. This membership covers the full school year and is required before enrolling in any classes. Once paid, you won't see this charge again until next year's renewal."

User: "I can't complete my checkout"
Good response: "Let me help you troubleshoot! Based on your account, I can see a few things to check:
- **Membership status**: Your membership shows as expired, which adds a $175 renewal fee
- **Cart total**: Make sure your displayed total matches what the system expects

Try refreshing your cart page to get the updated total. If the issue persists, it might be a payment method issue - make sure your card is valid and has sufficient funds."`;

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  '/parent/cart': [
    'Why is my total different?',
    'How do I apply a discount?',
    'What is the membership fee?',
    'How do payment plans work?'
  ],
  '/parent/checkout': [
    'Why can\'t I complete checkout?',
    'Why was I charged extra?',
    'Is my payment secure?',
    'Can I pay in installments?'
  ],
  '/parent/billing': [
    'When is my next payment?',
    'How do I update my card?',
    'What is my outstanding balance?',
    'How do I get a receipt?'
  ],
  '/parent/payment-plans': [
    'How do payment plans work?',
    'Can I pay off my balance early?',
    'What if I miss a payment?',
    'How do I change my payment date?'
  ],
  'default': [
    'Why is my total higher?',
    'What is the membership fee?',
    'How do payment plans work?',
    'I need help with checkout'
  ]
};

router.get('/context', supabaseAuth, async (req, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let membershipStatus = 'unknown';
    let membershipExpired = false;
    let membershipAmount = 0;
    let outstandingBalance = 0;
    const upcomingPayments: Array<{ amount: number; dueDate: string; className: string }> = [];
    let hasPaymentPlan = false;

    if (user.schoolId) {
      const school = await storage.getSchool(user.schoolId);
      if (school) {
        membershipAmount = school.membershipFeeAmount || 17500;
        
        const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
        const currentYear = new Date().getFullYear();
        const activeMembership = memberships.find(m => 
          m.schoolId === user.schoolId && 
          m.membershipYear >= currentYear &&
          ['enrolled', 'active', 'paid'].includes(m.status || '')
        );
        
        if (activeMembership) {
          membershipStatus = 'active';
          membershipExpired = false;
        } else {
          membershipStatus = 'expired';
          membershipExpired = true;
        }
      }

      const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
      const allClasses = await storage.getAllClasses();
      
      for (const payment of scheduledPayments) {
        if (payment.schoolId === user.schoolId && payment.status === 'pending') {
          outstandingBalance += payment.amount || 0;
          hasPaymentPlan = true;
          
          if (upcomingPayments.length < 3) {
            const enrollment = await storage.getEnrollmentById(payment.enrollmentId);
            let className = 'Class';
            if (enrollment) {
              const classInfo = allClasses.find(c => c.id === enrollment.classId);
              className = classInfo?.title || 'Class';
            }
            upcomingPayments.push({
              amount: payment.amount || 0,
              dueDate: payment.scheduledDate ? new Date(payment.scheduledDate).toLocaleDateString() : 'Unknown',
              className
            });
          }
        }
      }
    }

    return res.json({
      membershipStatus,
      membershipExpired,
      membershipAmount,
      outstandingBalance,
      upcomingPayments,
      hasPaymentPlan
    });

  } catch (error) {
    console.error('Failed to fetch payment context:', error);
    return res.status(500).json({ error: 'Failed to fetch payment context' });
  }
});

router.get('/suggestions', async (req, res) => {
  const { path } = req.query;
  const pathStr = path as string || '';
  
  let suggestions = PAGE_SUGGESTIONS['default'];
  
  for (const [pagePath, pageSuggestions] of Object.entries(PAGE_SUGGESTIONS)) {
    if (pathStr.includes(pagePath.replace('/parent', ''))) {
      suggestions = pageSuggestions;
      break;
    }
  }
  
  return res.json({ suggestions });
});

router.post('/chat', supabaseAuth, chatLimiter, async (req, res) => {
  try {
    if (!anthropic) {
      return res.status(503).json({ 
        error: 'AI service unavailable',
        fallbackResponse: "I'm sorry, the payment assistant is currently unavailable. Please contact the school administrator for help with your payment questions."
      });
    }

    const { message, conversationHistory, pageContext } = req.body as {
      message: string;
      conversationHistory: PaymentHelpMessage[];
      pageContext: { currentPath: string };
    };

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long. Please keep it under 1000 characters.' });
    }

    let paymentContextStr = '';
    const userEmail = req.user?.email;
    
    if (userEmail) {
      try {
          const user = await storage.getUserByEmail(userEmail);
          if (user && user.schoolId) {
            const school = await storage.getSchool(user.schoolId);
            const membershipAmount = school?.membershipFeeAmount || 17500;
            
            const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
            const currentYear = new Date().getFullYear();
            const activeMembership = memberships.find(m => 
              m.schoolId === user.schoolId && 
              m.membershipYear >= currentYear &&
              ['enrolled', 'active', 'paid'].includes(m.status || '')
            );
            
            const membershipExpired = !activeMembership;
            const membershipStatus = activeMembership ? 'active' : 'expired';
            
            const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
            const allClasses = await storage.getAllClasses();
            let outstandingBalance = 0;
            const upcomingPaymentsInfo: string[] = [];
            
            for (const payment of scheduledPayments) {
              if (payment.schoolId === user.schoolId && payment.status === 'pending') {
                outstandingBalance += payment.amount || 0;
                
                if (upcomingPaymentsInfo.length < 3) {
                  const enrollment = await storage.getEnrollmentById(payment.enrollmentId);
                  let className = 'Class';
                  if (enrollment) {
                    const classInfo = allClasses.find(c => c.id === enrollment.classId);
                    className = classInfo?.title || 'Class';
                  }
                  upcomingPaymentsInfo.push(`  • ${className}: $${(payment.amount / 100).toFixed(2)} due ${new Date(payment.scheduledDate).toLocaleDateString()}`);
                }
              }
            }
            
            paymentContextStr = `
PARENT'S PAYMENT CONTEXT:
- Membership Status: ${membershipStatus} ${membershipExpired ? '(EXPIRED - $' + (membershipAmount / 100).toFixed(2) + ' renewal will be added to checkout)' : ''}
- Outstanding Balance: $${(outstandingBalance / 100).toFixed(2)}
- Has Payment Plan: ${upcomingPaymentsInfo.length > 0 ? 'Yes' : 'No'}
${upcomingPaymentsInfo.length > 0 ? `- Upcoming Payments:\n${upcomingPaymentsInfo.join('\n')}` : ''}`;
        }
      } catch (e) {
        console.error('Failed to fetch payment context for chat:', e);
      }
    }

    const contextPrompt = `${paymentContextStr}

CURRENT PAGE: ${pageContext?.currentPath || 'unknown'}

PARENT'S QUESTION: ${message}`;

    const recentHistory = (conversationHistory || [])
      .slice(-8)
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content.slice(0, 500)
      }));

    const messages: Anthropic.MessageParam[] = [
      ...recentHistory,
      { role: 'user', content: contextPrompt }
    ];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages
    });

    if (response.content[0].type === 'text') {
      return res.json({
        response: response.content[0].text
      });
    }

    return res.json({
      response: "I'm here to help with your payment questions! Could you tell me more about what you need help with?"
    });

  } catch (error) {
    console.error('Payment help chat error:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      fallbackResponse: "I had trouble processing that. Could you try rephrasing your question?"
    });
  }
});

export default router;
