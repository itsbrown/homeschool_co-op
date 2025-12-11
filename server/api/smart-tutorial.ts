import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
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
  console.error('Failed to initialize Anthropic for smart tutorials:', error);
}

const MODEL = 'claude-3-7-sonnet-20250219';

interface PageContext {
  currentPath: string;
  userRole: string;
  availableActions: string[];
  pageTitle?: string;
}

interface TutorialMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a friendly, helpful guide for parents using a school management platform called American Seekers Academy. Your job is to help parents navigate the platform and complete tasks like:

- Registering their children
- Browsing and enrolling in classes
- Managing their cart and checkout
- Making payments
- Viewing their children's information

IMPORTANT RULES:
1. Be warm, encouraging, and use simple language (no technical jargon)
2. Give step-by-step instructions that are easy to follow
3. When explaining where to click, use **bold** for button/link names
4. Keep responses concise - parents are busy!
5. If you need to highlight a specific element on the page, include a special command in your response using this exact format: [[HIGHLIGHT:selector]] where selector is a CSS selector or data attribute
6. Available highlight selectors you can use:
   - [[HIGHLIGHT:my-children-btn]] - My Children button
   - [[HIGHLIGHT:browse-classes-btn]] - Browse Classes button  
   - [[HIGHLIGHT:add-child-btn]] - Add Child button
   - [[HIGHLIGHT:cart-btn]] - Shopping Cart button
   - [[HIGHLIGHT:enroll-btn]] - Enroll button on class pages
   - [[HIGHLIGHT:checkout-btn]] - Checkout button
   - [[HIGHLIGHT:help-btn]] - Help button
7. Only use ONE highlight per response - the most important one for the current step
8. Always acknowledge what page they're on and give context-aware help

Example response format:
"Great question! To add your child, first click on **My Children** in the menu. [[HIGHLIGHT:my-children-btn]]

Once you're there, you'll see an **Add Child** button where you can enter their information."`;

const PAGE_CONTEXT_MAP: Record<string, { title: string; description: string; actions: string[] }> = {
  '/parent': {
    title: 'Parent Dashboard',
    description: 'Main dashboard showing overview of children, classes, and quick actions',
    actions: ['View children', 'Browse classes', 'View cart', 'Access help']
  },
  '/parent/children': {
    title: 'My Children',
    description: 'Page to view and manage registered children',
    actions: ['Add a new child', 'Edit child information', 'View child details']
  },
  '/parent/classes': {
    title: 'Browse Classes', 
    description: 'Page showing available classes to enroll in',
    actions: ['View class details', 'Filter classes', 'Enroll child in class']
  },
  '/parent/cart': {
    title: 'Shopping Cart',
    description: 'Cart showing pending enrollments before checkout',
    actions: ['Review items', 'Remove items', 'Proceed to checkout']
  },
  '/parent/checkout': {
    title: 'Checkout',
    description: 'Payment page to complete enrollment purchases',
    actions: ['Enter payment info', 'Review order', 'Complete purchase']
  },
  '/login': {
    title: 'Login Page',
    description: 'User is not logged in yet',
    actions: ['Log in with email', 'Sign up for account', 'Reset password']
  }
};

const MAX_CONVERSATION_HISTORY = 10;

router.post('/chat', chatLimiter, async (req, res) => {
  try {
    if (!anthropic) {
      return res.status(503).json({ 
        error: 'AI service unavailable',
        fallbackResponse: "I'm sorry, the AI assistant is currently unavailable. Please try the step-by-step guides in the Help menu, or contact the school directly for assistance."
      });
    }

    const { message, conversationHistory, pageContext } = req.body as {
      message: string;
      conversationHistory: TutorialMessage[];
      pageContext: PageContext;
    };

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long. Please keep it under 1000 characters.' });
    }

    const pageInfo = PAGE_CONTEXT_MAP[pageContext?.currentPath] || {
      title: 'Unknown Page',
      description: 'User is on an unrecognized page',
      actions: []
    };

    const contextPrompt = `
CURRENT CONTEXT:
- Page: ${pageInfo.title} (${pageContext?.currentPath || 'unknown'})
- Page Description: ${pageInfo.description}
- Available Actions: ${pageInfo.actions.join(', ')}
- User Role: ${pageContext?.userRole || 'parent'}

USER'S QUESTION: ${message}`;

    const recentHistory = (conversationHistory || [])
      .slice(-MAX_CONVERSATION_HISTORY)
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
      max_tokens: 500,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages
    });

    if (response.content[0].type === 'text') {
      const responseText = response.content[0].text;
      
      const highlightMatch = responseText.match(/\[\[HIGHLIGHT:([^\]]+)\]\]/);
      const highlightTarget = highlightMatch ? highlightMatch[1] : null;
      const cleanedResponse = responseText.replace(/\[\[HIGHLIGHT:[^\]]+\]\]/g, '').trim();

      return res.json({
        response: cleanedResponse,
        highlight: highlightTarget,
        pageContext: pageInfo
      });
    }

    return res.json({
      response: "I'm here to help! Could you tell me more about what you're trying to do?",
      highlight: null
    });

  } catch (error) {
    console.error('Smart tutorial chat error:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      fallbackResponse: "I had trouble processing that. Could you try rephrasing your question?"
    });
  }
});

router.get('/suggestions', async (req, res) => {
  const { path } = req.query;
  
  const pageInfo = PAGE_CONTEXT_MAP[path as string] || null;
  
  const suggestions: Record<string, string[]> = {
    '/parent': [
      'How do I register my child?',
      'How do I enroll in a class?',
      'Where can I see my payments?'
    ],
    '/parent/children': [
      'How do I add a new child?',
      'How do I edit my child\'s information?',
      'What information do I need to register?'
    ],
    '/parent/classes': [
      'How do I enroll my child?',
      'What do the different class types mean?',
      'How do I filter classes by age?'
    ],
    '/parent/cart': [
      'How do I remove an item?',
      'When will I be charged?',
      'Can I save my cart for later?'
    ],
    '/parent/checkout': [
      'What payment methods are accepted?',
      'Is my payment information secure?',
      'Can I pay in installments?'
    ],
    '/login': [
      'How do I create an account?',
      'I forgot my password',
      'How do I register with the school?'
    ]
  };

  return res.json({
    suggestions: suggestions[path as string] || [
      'How do I get started?',
      'What can I do on this platform?',
      'How do I contact the school?'
    ],
    pageInfo
  });
});

export default router;
