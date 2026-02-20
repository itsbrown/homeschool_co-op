import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import { supabaseAuth } from '../middleware/supabase-auth';
import { storage } from '../storage';
import { knowledgeBaseProcessor } from '../services/knowledgeBaseProcessor';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please wait a moment before asking another question.' }
});

let anthropic: Anthropic | null = null;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch (error) {
  console.error('Failed to initialize Anthropic for parent concierge:', error);
}

const MODEL = 'claude-sonnet-4-20250514';

const CONCIERGE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'lookup_classes',
    description: 'Search available classes the parent can enroll their children in. Returns class details including title, schedule, price, spots remaining, age range, and instructor.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Optional search query to filter classes by name or category' },
        age: { type: 'number', description: 'Optional child age to filter age-appropriate classes' },
      },
      required: [],
    },
  },
  {
    name: 'check_enrollments',
    description: 'Check the current enrollment status for the parent\'s children. Shows which classes each child is enrolled in, their status, and payment progress.',
    input_schema: {
      type: 'object' as const,
      properties: {
        childName: { type: 'string', description: 'Optional specific child name to check enrollments for' },
      },
      required: [],
    },
  },
  {
    name: 'check_payments',
    description: 'Check the parent\'s payment status including upcoming payments, outstanding balances, and payment history.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_credits',
    description: 'Check the parent\'s available credit balance including volunteer credits, referral credits, and other types. Shows total available amount that can be applied to payments.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_waitlist',
    description: 'Check if any of the parent\'s children are on a waitlist for any classes. Shows waitlist position and class details.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_knowledge_base',
    description: 'Search the school\'s knowledge base for information about policies, procedures, curriculum, schedules, and other school-related topics. Use this when the parent asks a question about how the school works.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The question or topic to search for in the knowledge base' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a class enrollment to the parent\'s cart for a specific child. The parent will still need to complete checkout separately.',
    input_schema: {
      type: 'object' as const,
      properties: {
        classId: { type: 'number', description: 'The ID of the class to add' },
        childId: { type: 'number', description: 'The ID of the child to enroll' },
        paymentPlan: { type: 'string', enum: ['full', 'biweekly'], description: 'Payment plan: "full" for pay in full, "biweekly" for biweekly installments' },
      },
      required: ['classId', 'childId', 'paymentPlan'],
    },
  },
  {
    name: 'register_child',
    description: 'Register a new child for the parent. Collects basic information to create a child profile.',
    input_schema: {
      type: 'object' as const,
      properties: {
        firstName: { type: 'string', description: 'Child\'s first name' },
        lastName: { type: 'string', description: 'Child\'s last name' },
        age: { type: 'number', description: 'Child\'s age' },
        gradeLevel: { type: 'string', description: 'Child\'s grade level (e.g., "3rd Grade", "Kindergarten")' },
        birthdate: { type: 'string', description: 'Child\'s birthdate in YYYY-MM-DD format (can be approximate based on age)' },
      },
      required: ['firstName', 'lastName', 'age', 'gradeLevel'],
    },
  },
];

function buildSystemPrompt(parentName: string, contextSummary: string): string {
  return `You are the AI Concierge for American Seekers Academy — a warm, knowledgeable assistant that helps parents manage everything related to their children's education at the academy.

IDENTITY:
- Your name is "ASA Assistant"
- You speak in a warm, encouraging tone — like a helpful school office staff member
- Use simple, everyday language — never technical jargon
- Use **bold** for important information like amounts, dates, and action items
- Use bullet points for lists
- Keep responses concise but thorough — parents are busy

PARENT CONTEXT:
${contextSummary}

CAPABILITIES — USE TOOLS TO GET REAL DATA:
1. **Class Discovery**: Search available classes, recommend based on child's age/interests. Use the lookup_classes tool.
2. **Enrollment Management**: Check enrollment status, waitlist positions. Use check_enrollments and check_waitlist tools.
3. **Payment Help**: Check upcoming payments, outstanding balances, explain billing. Use check_payments tool.
4. **Credit Information**: Check available credits (volunteer, referral, etc.). Use check_credits tool.
5. **Child Registration**: Register new children by collecting their information. Use register_child tool.
6. **Add to Cart**: Add classes to the parent's cart for checkout. Use add_to_cart tool.
7. **School Information**: Answer questions about policies, curriculum, schedules using knowledge base. Use search_knowledge_base tool.

BEHAVIORAL RULES:
1. Always use tools to fetch REAL data — never make up amounts, dates, or class names
2. When showing financial info, format as currency: $XX.XX
3. When recommending classes, mention available spots and price
4. Proactively mention available credits when discussing payments or enrollment
5. For registration, collect: first name, last name, age, and grade level — then confirm before registering
6. After adding to cart, remind them they can go to checkout to complete the process
7. If you don't know something, say so honestly and suggest they contact the school office
8. Never process payments directly — guide them to the checkout page
9. When answering from knowledge base, mention the source document
10. One action at a time — don't overwhelm parents with multiple suggestions

QUICK ACTION GUIDANCE:
- "Make a payment" → Use check_payments to show what's due, then guide to billing page
- "Enroll in a class" → Ask which child, use lookup_classes, then add_to_cart
- "Register a child" → Collect info conversationally, then use register_child
- "Check my balance" → Use check_payments and check_credits together
- General questions → Use search_knowledge_base first`;
}

async function executeToolCall(
  toolName: string,
  toolInput: any,
  userId: number,
  userEmail: string,
  schoolId: number | null
): Promise<string> {
  try {
    switch (toolName) {
      case 'lookup_classes': {
        const allClasses = await storage.getClasses({ page: 1, limit: 100, status: '' });
        let classes = allClasses.filter(c => c.isPublished === true || c.status === 'active');

        if (toolInput.search) {
          const search = toolInput.search.toLowerCase();
          classes = classes.filter(c =>
            c.title?.toLowerCase().includes(search) ||
            c.category?.toLowerCase().includes(search) ||
            c.description?.toLowerCase().includes(search)
          );
        }

        if (toolInput.age) {
          classes = classes.filter(c => {
            if (!c.ageRange) return true;
            const match = c.ageRange.match(/(\d+)\s*-\s*(\d+)/);
            if (match) {
              const min = parseInt(match[1]);
              const max = parseInt(match[2]);
              return toolInput.age >= min && toolInput.age <= max;
            }
            return true;
          });
        }

        if (classes.length === 0) {
          return 'No classes found matching the criteria. Try a broader search or ask about all available classes.';
        }

        return classes.slice(0, 10).map(c => {
          const spotsRemaining = (c.capacity || 0) - (c.enrollmentCount || 0);
          const isFull = spotsRemaining <= 0;
          return `CLASS ID: ${c.id}
Title: ${c.title}
Category: ${c.category || 'General'}
Schedule: ${c.schedule || 'TBD'}
Location: ${c.location || 'TBD'}
Instructor: ${c.instructorName || 'TBD'}
Age Range: ${c.ageRange || 'All ages'}
Price: $${((c.price || 0) / 100).toFixed(2)}
Spots: ${isFull ? 'FULL (waitlist available)' : `${spotsRemaining} remaining`}
Start Date: ${c.startDate || 'TBD'}
End Date: ${c.endDate || 'TBD'}`;
        }).join('\n\n---\n\n');
      }

      case 'check_enrollments': {
        const allEnrollments = await storage.getAllEnrollments();
        const children = await storage.getChildrenByParentEmail(userEmail);
        const childIds = children.map(c => c.id);

        let enrollments = allEnrollments.filter((e: any) =>
          (e.parentEmail === userEmail || childIds.includes(e.childId)) &&
          e.status !== 'cancelled'
        );

        if (toolInput.childName) {
          const name = toolInput.childName.toLowerCase();
          enrollments = enrollments.filter((e: any) =>
            e.childName?.toLowerCase().includes(name)
          );
        }

        if (enrollments.length === 0) {
          return 'No active enrollments found. Would you like to browse available classes?';
        }

        return enrollments.map((e: any) => {
          const remaining = e.remainingBalance || ((e.totalCost || 0) - (e.totalPaid || 0));
          return `Child: ${e.childName || 'Unknown'}
Class: ${e.className || 'Unknown'}
Status: ${e.status}
Payment Plan: ${e.paymentPlan || 'N/A'}
Total Cost: $${((e.totalCost || 0) / 100).toFixed(2)}
Paid: $${((e.totalPaid || 0) / 100).toFixed(2)}
Remaining: $${(remaining / 100).toFixed(2)}`;
        }).join('\n\n---\n\n');
      }

      case 'check_payments': {
        const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
        const pendingPayments = scheduledPayments.filter(p =>
          p.status === 'pending' && (!schoolId || p.schoolId === schoolId)
        );

        if (pendingPayments.length === 0) {
          return 'No upcoming payments found. All payments are up to date!';
        }

        const totalDue = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

        const overdue = pendingPayments.filter(p => {
          if (!p.scheduledDate) return false;
          return new Date(p.scheduledDate) < new Date();
        });

        let result = `Total Outstanding: $${(totalDue / 100).toFixed(2)}\n`;
        if (overdue.length > 0) {
          result += `⚠️ OVERDUE PAYMENTS: ${overdue.length}\n\n`;
        }

        const allEnrollments = await storage.getAllEnrollments();

        result += pendingPayments.slice(0, 8).map(p => {
          const enrollment = allEnrollments.find((e: any) => e.id === p.enrollmentId);
          const isOverdue = p.scheduledDate && new Date(p.scheduledDate) < new Date();
          return `${isOverdue ? '🔴 OVERDUE' : '📅'} $${((p.amount || 0) / 100).toFixed(2)} — Due: ${p.scheduledDate ? new Date(p.scheduledDate).toLocaleDateString() : 'TBD'}
   Class: ${enrollment?.className || 'Unknown'}
   Child: ${enrollment?.childName || 'Unknown'}`;
        }).join('\n\n');

        return result;
      }

      case 'check_credits': {
        const credits = await storage.getCredits({ userId, status: 'approved' as any });
        const activeCredits = credits.filter(c => {
          const remaining = (c.creditAmountCents || 0) - (c.usedAmountCents || 0);
          if (remaining <= 0) return false;
          if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
          return true;
        });

        if (activeCredits.length === 0) {
          return 'No available credits at this time.';
        }

        const totalAvailable = activeCredits.reduce((sum, c) =>
          sum + ((c.creditAmountCents || 0) - (c.usedAmountCents || 0)), 0
        );

        let result = `Total Available Credits: $${(totalAvailable / 100).toFixed(2)}\n\nBreakdown:\n`;
        result += activeCredits.map(c => {
          const remaining = (c.creditAmountCents || 0) - (c.usedAmountCents || 0);
          return `• ${c.creditType} credit: $${(remaining / 100).toFixed(2)}${c.title ? ` — ${c.title}` : ''}${c.expiresAt ? ` (expires ${new Date(c.expiresAt).toLocaleDateString()})` : ''}`;
        }).join('\n');

        return result;
      }

      case 'check_waitlist': {
        const allEnrollments = await storage.getAllEnrollments();
        const children = await storage.getChildrenByParentEmail(userEmail);
        const childIds = children.map(c => c.id);

        const waitlisted = allEnrollments.filter((e: any) =>
          (e.parentEmail === userEmail || childIds.includes(e.childId)) &&
          e.status === 'waitlist'
        );

        if (waitlisted.length === 0) {
          return 'None of your children are currently on any waitlists.';
        }

        return waitlisted.map((e: any) =>
          `Child: ${e.childName}
Class: ${e.className}
Waitlist Position: #${e.waitlistPosition || '?'}
We'll notify you when a spot opens up.`
        ).join('\n\n---\n\n');
      }

      case 'search_knowledge_base': {
        try {
          const publicKBs = await storage.getPublicKnowledgeBases();
          if (!publicKBs || publicKBs.length === 0) {
            return 'No school information documents are available at this time. Please contact the school office for more details.';
          }

          console.log(`🔍 Concierge KB search: ${publicKBs.length} public KBs found, query: "${toolInput.query}"`);

          const kbContent = await knowledgeBaseProcessor.extractContextFromKnowledgeBases(publicKBs);
          if (!kbContent || kbContent.trim().length < 10) {
            const kbTitles = publicKBs.map(kb => {
              const kbAny = kb as any;
              let info = `- ${kb.title}`;
              if (kb.description) info += `: ${kb.description}`;
              if (kbAny.aiProcessed) info += ' (AI-analyzed)';
              const files = kb.files as any[];
              if (files && files.length > 0) {
                info += ` [Files: ${files.map((f: any) => f.name || 'document').join(', ')}]`;
              }
              return info;
            }).join('\n');
            return `Available school knowledge bases:\n${kbTitles}\n\nNote: Detailed content summaries from these documents are available. The documents cover school programs, curriculum descriptions, and policies.`;
          }

          return `SCHOOL KNOWLEDGE BASE RESULTS:\n${kbContent}\n\nSource: School knowledge base documents (${publicKBs.map(kb => kb.title).join(', ')})`;
        } catch (error) {
          console.error('Knowledge base search error:', error);
          return 'I had trouble searching the school information. Please contact the school office directly.';
        }
      }

      case 'add_to_cart': {
        const { classId, childId, paymentPlan } = toolInput;

        const classItem = await storage.getClassById(classId);
        if (!classItem) {
          return 'ERROR: Class not found. Please try a different class.';
        }

        const child = await storage.getChildById(childId);
        if (!child) {
          return 'ERROR: Child not found. Please check the child\'s information.';
        }

        const allEnrollments = await storage.getAllEnrollments();
        const existingEnrollment = allEnrollments.find((e: any) =>
          e.childId === childId &&
          (e.marketplaceClassId === classId || e.classId === classId) &&
          e.status !== 'cancelled'
        );

        if (existingEnrollment) {
          return `${child.firstName} is already ${existingEnrollment.status === 'waitlist' ? 'on the waitlist' : 'enrolled'} in ${classItem.title}.`;
        }

        const spotsRemaining = (classItem.capacity || 0) - (classItem.enrollmentCount || 0);
        const isWaitlist = spotsRemaining <= 0;

        const enrollmentData: any = {
          childId,
          childName: `${child.firstName} ${child.lastName}`,
          parentEmail: userEmail,
          parentId: userId,
          classId: classId,
          marketplaceClassId: classId,
          className: classItem.title,
          schoolId: classItem.schoolId || schoolId,
          totalCost: classItem.price || 0,
          totalPaid: 0,
          remainingBalance: classItem.price || 0,
          paymentPlan: paymentPlan || 'full',
          status: isWaitlist ? 'waitlist' : 'pending_payment',
          paymentStatus: 'pending',
          waitlistPosition: isWaitlist ? (spotsRemaining * -1 + 1) : null,
          enrollmentDate: new Date(),
        };

        await storage.createProgramEnrollment(enrollmentData);

        if (isWaitlist) {
          return `${child.firstName} has been added to the waitlist for **${classItem.title}**. The class is currently full — you'll be notified when a spot opens up.`;
        }

        return `✅ **${classItem.title}** has been added to the cart for **${child.firstName}**!
Price: $${((classItem.price || 0) / 100).toFixed(2)}
Payment Plan: ${paymentPlan === 'biweekly' ? 'Biweekly Installments' : 'Pay in Full'}

To complete the enrollment, please head to checkout. You can say "take me to checkout" or click **Browse on your own** and go to the Cart page.`;
      }

      case 'register_child': {
        const { firstName, lastName, age, gradeLevel, birthdate } = toolInput;

        const currentYear = new Date().getFullYear();
        const estimatedBirthdate = birthdate || `${currentYear - age}-06-15`;

        const childData: any = {
          firstName,
          lastName,
          birthdate: estimatedBirthdate,
          gradeLevel: gradeLevel || '',
          parentEmail: userEmail,
          parentId: userId,
          schoolId: schoolId || 1,
          status: 'active',
        };

        const newChild = await storage.createChild(childData);

        return `✅ **${firstName} ${lastName}** has been registered successfully!
Child ID: ${newChild.id}
Grade: ${gradeLevel}
Age: ${age}

You can now enroll ${firstName} in classes. Would you like me to show you available classes for ${firstName}'s age group?`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return `I had trouble completing that action. Please try again or contact the school office for help.`;
  }
}

router.get('/context', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const parentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Parent';

    const children = await storage.getChildrenByParentEmail(userEmail);

    let membershipStatus = 'unknown';
    let membershipExpired = false;
    let schoolName = '';

    if (user.schoolId) {
      const school = await storage.getSchool(user.schoolId);
      if (school) {
        schoolName = school.name || '';
        const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
        const currentYear = new Date().getFullYear();
        const activeMembership = memberships.find(m =>
          m.schoolId === user.schoolId &&
          m.membershipYear >= currentYear &&
          ['enrolled', 'active', 'paid'].includes(m.status || '')
        );
        membershipStatus = activeMembership ? 'active' : 'expired';
        membershipExpired = !activeMembership;
      }
    }

    const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(userEmail);
    const pendingPayments = scheduledPayments
      .filter(p => p.status === 'pending' && (!user.schoolId || p.schoolId === user.schoolId))
      .sort((a, b) => {
        const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Infinity;
        const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Infinity;
        return dateA - dateB;
      });

    const totalDue = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const overdueCount = pendingPayments.filter(p =>
      p.scheduledDate && new Date(p.scheduledDate) < new Date()
    ).length;

    const allEnrollments = await storage.getAllEnrollments();
    const childIds = children.map(c => c.id);

    const upcomingPayments = pendingPayments.slice(0, 3).map(p => {
      const enrollment = allEnrollments.find((e: any) => e.id === p.enrollmentId);
      return {
        amount: p.amount || 0,
        dueDate: p.scheduledDate ? new Date(p.scheduledDate).toLocaleDateString() : 'TBD',
        className: enrollment?.className || 'Class',
        childName: enrollment?.childName || '',
        isOverdue: p.scheduledDate ? new Date(p.scheduledDate) < new Date() : false,
      };
    });

    const activeEnrollments = allEnrollments.filter((e: any) =>
      (e.parentEmail === userEmail || childIds.includes(e.childId)) &&
      ['enrolled', 'pending_payment', 'pending_admin_approval'].includes(e.status)
    );

    const waitlistedEnrollments = allEnrollments.filter((e: any) =>
      (e.parentEmail === userEmail || childIds.includes(e.childId)) &&
      e.status === 'waitlist'
    );

    const credits = await storage.getCredits({ userId: user.id, status: 'approved' as any });
    const activeCredits = credits.filter(c => {
      const remaining = (c.creditAmountCents || 0) - (c.usedAmountCents || 0);
      if (remaining <= 0) return false;
      if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
      return true;
    });
    const totalCredits = activeCredits.reduce((sum, c) =>
      sum + ((c.creditAmountCents || 0) - (c.usedAmountCents || 0)), 0
    );

    let announcements: any[] = [];
    if (user.schoolId) {
      try {
        const schoolAnnouncements = await storage.getAnnouncementsBySchool(user.schoolId);
        announcements = schoolAnnouncements.slice(0, 3).map(a => ({
          subject: a.subject,
          content: a.content?.substring(0, 120) + (a.content && a.content.length > 120 ? '...' : ''),
          date: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '',
        }));
      } catch (e) {
        // Non-blocking
      }
    }

    const childrenSummary = children.map(c => {
      const childEnrollments = activeEnrollments.filter((e: any) => e.childId === c.id);
      const childWaitlists = waitlistedEnrollments.filter((e: any) => e.childId === c.id);
      return {
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        age: c.birthdate ? Math.floor((Date.now() - new Date(c.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null,
        gradeLevel: c.gradeLevel,
        enrollmentCount: childEnrollments.length,
        waitlistCount: childWaitlists.length,
      };
    });

    const hour = new Date().getHours();
    let timeGreeting = 'Hello';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';

    const urgentAlerts: string[] = [];
    const importantAlerts: string[] = [];
    const infoAlerts: string[] = [];

    if (overdueCount > 0) {
      urgentAlerts.push(`You have ${overdueCount} overdue payment${overdueCount > 1 ? 's' : ''} that need${overdueCount === 1 ? 's' : ''} attention.`);
    }
    if (membershipExpired) {
      urgentAlerts.push('Your school membership has expired. Renewal is required for class enrollment.');
    }

    if (pendingPayments.length > 0 && overdueCount === 0) {
      const nextPayment = pendingPayments[0];
      const enrollment = allEnrollments.find((e: any) => e.id === nextPayment.enrollmentId);
      importantAlerts.push(`Next payment of $${((nextPayment.amount || 0) / 100).toFixed(2)} due ${nextPayment.scheduledDate ? new Date(nextPayment.scheduledDate).toLocaleDateString() : 'soon'}${enrollment ? ` for ${enrollment.className}` : ''}.`);
    }
    if (waitlistedEnrollments.length > 0) {
      importantAlerts.push(`${waitlistedEnrollments.length} child${waitlistedEnrollments.length > 1 ? 'ren are' : ' is'} on a class waitlist.`);
    }

    if (totalCredits > 0) {
      infoAlerts.push(`You have $${(totalCredits / 100).toFixed(2)} in credits available to use.`);
    }
    if (children.length === 0) {
      infoAlerts.push('Register your first child to start enrolling in classes.');
    }

    const quickActions: Array<{ label: string; action: string }> = [];
    if (overdueCount > 0) {
      quickActions.push({ label: 'Make a Payment', action: 'I need to make a payment' });
    }
    if (children.length === 0) {
      quickActions.push({ label: 'Register a Child', action: 'I want to register my child' });
    } else {
      quickActions.push({ label: 'Enroll in a Class', action: 'I want to enroll my child in a class' });
    }
    if (pendingPayments.length > 0 && overdueCount === 0) {
      quickActions.push({ label: 'View Payments', action: 'Show me my upcoming payments' });
    }
    if (totalCredits > 0) {
      quickActions.push({ label: 'Check Credits', action: 'What credits do I have available?' });
    }
    quickActions.push({ label: 'Browse Classes', action: 'Show me available classes' });
    if (activeEnrollments.length > 0) {
      quickActions.push({ label: 'My Enrollments', action: 'Show me my children\'s enrollments' });
    }

    return res.json({
      parentName,
      schoolName,
      timeGreeting,
      children: childrenSummary,
      membershipStatus,
      membershipExpired,
      payments: {
        totalDue,
        overdueCount,
        upcoming: upcomingPayments,
      },
      credits: {
        totalAvailable: totalCredits,
        breakdown: activeCredits.map(c => ({
          type: c.creditType,
          amount: (c.creditAmountCents || 0) - (c.usedAmountCents || 0),
          title: c.title,
        })),
      },
      enrollments: {
        activeCount: activeEnrollments.length,
        waitlistCount: waitlistedEnrollments.length,
      },
      announcements,
      alerts: {
        urgent: urgentAlerts,
        important: importantAlerts,
        info: infoAlerts,
      },
      quickActions: quickActions.slice(0, 5),
    });
  } catch (error) {
    console.error('Failed to fetch parent concierge context:', error);
    return res.status(500).json({ error: 'Failed to fetch context' });
  }
});

router.post('/chat', supabaseAuth, chatLimiter, async (req: any, res) => {
  try {
    if (!anthropic) {
      return res.status(503).json({
        error: 'AI service unavailable',
        fallbackResponse: "I'm sorry, the AI assistant is currently unavailable. Please use the 'Browse on your own' button to access the platform directly, or contact the school office for help.",
      });
    }

    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { message, conversationHistory } = req.body as {
      message: string;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long. Please keep it under 2000 characters.' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const parentName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Parent';
    const children = await storage.getChildrenByParentEmail(userEmail);

    const contextSummary = `Parent Name: ${parentName}
Email: ${userEmail}
School ID: ${user.schoolId || 'None'}
Children: ${children.length > 0 ? children.map(c => `${c.firstName} ${c.lastName} (ID: ${c.id}, Age: ${c.birthdate ? Math.floor((Date.now() - new Date(c.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : '?'}, Grade: ${c.gradeLevel || '?'})`).join(', ') : 'No children registered yet'}`;

    const systemPrompt = buildSystemPrompt(parentName, contextSummary);

    const messages: Anthropic.MessageParam[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: message });

    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: CONCIERGE_TOOLS,
      messages,
    });

    let fullResponse = '';
    const toolResults: Array<{ tool: string; result: string }> = [];
    let iterations = 0;
    const maxIterations = 5;

    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
      iterations++;

      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const textBlocks = assistantContent.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      if (textBlocks.length > 0) {
        fullResponse += textBlocks.map(b => b.text).join('\n');
      }

      const toolResultContents: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`🔧 Concierge tool call: ${toolUse.name}`, JSON.stringify(toolUse.input).substring(0, 200));

        const result = await executeToolCall(
          toolUse.name,
          toolUse.input,
          user.id,
          userEmail,
          user.schoolId
        );

        toolResults.push({ tool: toolUse.name, result });

        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: 'assistant', content: assistantContent });
      messages.push({ role: 'user', content: toolResultContents });

      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: CONCIERGE_TOOLS,
        messages,
      });
    }

    const finalTextBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    if (finalTextBlocks.length > 0) {
      fullResponse = finalTextBlocks.map(b => b.text).join('\n');
    }

    return res.json({
      response: fullResponse,
      toolsUsed: toolResults.map(t => t.tool),
    });
  } catch (error: any) {
    console.error('Parent concierge chat error:', error);

    if (error?.status === 429) {
      return res.status(429).json({
        error: 'Rate limited',
        fallbackResponse: 'The AI assistant is busy right now. Please wait a moment and try again.',
      });
    }

    return res.status(500).json({
      error: 'Chat failed',
      fallbackResponse: "I'm having trouble right now. Please try again in a moment, or use the 'Browse on your own' button.",
    });
  }
});

export default router;
