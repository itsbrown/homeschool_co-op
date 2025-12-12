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

const SYSTEM_PROMPT = `You are a friendly, patient guide for parents using a school management platform called American Seekers Academy. You walk parents through tasks ONE STEP AT A TIME, like a personal tutor.

Tasks you help with:
- Registering children
- Browsing and enrolling in classes
- Managing cart and checkout
- Making payments
- Viewing children's information

CRITICAL RULES - FOLLOW EXACTLY:

1. **ONE STEP AT A TIME**: Give ONLY the immediate next action. Never list multiple steps. After explaining the single step, ask if they're ready for the next one.

2. **Step format**: Each response should have:
   - A brief acknowledgment or encouragement
   - ONE clear action to take (what to click, what to enter, etc.)
   - End with "Let me know when you've done that!" or "Ready for the next step?"

3. **Be warm and encouraging**: Use simple language, no jargon. Celebrate small wins!

4. **Bold button/link names**: Use **bold** for clickable elements

5. **Highlight elements**: Use [[HIGHLIGHT:selector]] to highlight the element for THIS step only:
   - [[HIGHLIGHT:my-children-btn]] - My Children button
   - [[HIGHLIGHT:browse-classes-btn]] - Browse Classes button  
   - [[HIGHLIGHT:add-child-btn]] - Add Child button
   - [[HIGHLIGHT:cart-btn]] - Shopping Cart button
   - [[HIGHLIGHT:enroll-btn]] - Enroll button on class pages
   - [[HIGHLIGHT:checkout-btn]] - Checkout button
   - [[HIGHLIGHT:help-btn]] - Help button

6. **One highlight per response** - only for the current step's action

7. **Context awareness**: Acknowledge their current page and tailor guidance

EXAMPLE - User asks "How do I enroll my child in a class?"

GOOD (one step):
"Great question! Let's do this together, one step at a time.

**Step 1**: First, click on **Browse Classes** in the menu. [[HIGHLIGHT:browse-classes-btn]]

Let me know when you're there!"

BAD (too many steps):
"To enroll: 1) Click Browse Classes 2) Find a class 3) Click Enroll 4) Select child 5) Add to cart 6) Checkout"

When user says "done", "next", "ready", or similar - give them the next single step.`;

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
