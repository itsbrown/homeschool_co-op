# ASA Learning Platform - Integration Guide

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Status:** Active Development

---

## Table of Contents
1. [Existing Integrations](#existing-integrations)
2. [Planned Integrations (Phases 2-3)](#planned-integrations-phases-2-3)
3. [Integration Patterns](#integration-patterns)
4. [API Key Management](#api-key-management)
5. [Testing Procedures](#testing-procedures)
6. [Troubleshooting](#troubleshooting)

---

## Existing Integrations

### 1. Supabase (Authentication)

**Purpose:** User authentication, OAuth, session management  
**Website:** https://supabase.com  
**Documentation:** https://supabase.com/docs

---

#### Setup Instructions

**Step 1: Create Supabase Project**

1. Visit https://supabase.com
2. Click "Start your project"
3. Create organization (if needed)
4. Click "New Project"
5. Fill in:
   - **Name:** asa-learning-platform
   - **Database Password:** (generate secure password)
   - **Region:** (closest to your users, e.g., US East)
6. Wait 2 minutes for provisioning

**Step 2: Configure Authentication**

1. In Supabase dashboard, go to **Authentication → Providers**
2. Enable providers:

   **Email/Password:**
   - Already enabled by default
   - Configure email templates (optional)

   **Google OAuth:**
   - Click "Google"
   - Enable
   - Add credentials from Google Cloud Console
   - Set redirect URL: `https://your-project.supabase.co/auth/v1/callback`

   **Magic Link:**
   - Enabled by default
   - Customize email template

3. Go to **Authentication → Settings**
4. Configure:
   - **Site URL:** `https://your-domain.com`
   - **Redirect URLs:** Add all allowed redirect URLs

**Step 3: Get API Keys**

1. Go to **Settings → API**
2. Copy:
   - **Project URL** (`SUPABASE_URL`)
   - **anon public** key (`VITE_SUPABASE_ANON_KEY`)
   - **service_role** key (`SUPABASE_SERVICE_KEY`) ⚠️ Keep secret!

**Step 4: Add to Environment Variables**

```bash
# .env
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...  # Backend only
VITE_SUPABASE_ANON_KEY=eyJhbGci...  # Frontend only
```

---

#### Implementation

**Backend Setup:**

```typescript
// server/config/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);
```

**Frontend Setup:**

```typescript
// client/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);
```

**Authentication Middleware:**

```typescript
// server/middleware/supabase-auth.ts
import { supabase } from '../config/supabase';

export async function supabaseAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Fetch user from database
    const dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, user.id)
    });

    if (!dbUser) {
      return res.status(401).json({ error: 'User not found in database' });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      supabaseId: user.id,
      role: dbUser.role,
    };

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication failed' });
  }
}
```

---

### 2. Stripe (Payment Processing)

**Purpose:** Payment processing, subscriptions, refunds  
**Website:** https://stripe.com  
**Documentation:** https://stripe.com/docs

---

#### Setup Instructions

**Step 1: Create Stripe Account**

1. Visit https://stripe.com
2. Click "Start now"
3. Create account
4. Verify email and business details

**Step 2: Enable Test Mode**

1. In Stripe Dashboard, toggle to **Test mode** (top-right)
2. Complete onboarding steps

**Step 3: Get API Keys**

1. Go to **Developers → API keys**
2. Copy:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`)

**Step 4: Set Up Webhook**

1. Go to **Developers → Webhooks**
2. Click "Add endpoint"
3. **Endpoint URL:** `https://your-domain.com/api/stripe/webhook`
4. **Events to send:**
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Click "Add endpoint"
6. Copy **Signing secret** (starts with `whsec_`)

**Step 5: Add to Environment Variables**

```bash
# .env
STRIPE_SECRET_KEY=sk_test_...  # Backend
VITE_STRIPE_PUBLIC_KEY=pk_test_...  # Frontend
STRIPE_WEBHOOK_SECRET=whsec_...  # Backend
```

**Step 6: Go Live**

When ready for production:
1. Complete business verification
2. Toggle to **Live mode**
3. Get live keys (starts with `pk_live_` and `sk_live_`)
4. Update webhook endpoint for live mode
5. Replace test keys with live keys in production environment

---

#### Implementation

**Backend Setup:**

```typescript
// server/config/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});
```

**Create Checkout Session:**

```typescript
// server/api/stripe.ts
import { stripe } from '../config/stripe';

export async function createCheckoutSession(req, res) {
  const { enrollmentIds } = req.body;
  
  // Fetch enrollments from database
  const enrollments = await db.query.enrollments.findMany({
    where: inArray(enrollments.id, enrollmentIds),
    with: { class: true, child: true }
  });

  // Create line items
  const lineItems = enrollments.map(enrollment => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: enrollment.class.name,
        description: `For ${enrollment.child.firstName} ${enrollment.child.lastName}`,
      },
      unit_amount: Math.round(enrollment.pricePaid * 100), // Convert to cents
    },
    quantity: 1,
  }));

  // Create Stripe session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/cart`,
    metadata: {
      enrollmentIds: enrollmentIds.join(','),
    },
  });

  res.json({ sessionId: session.id, url: session.url });
}
```

**Webhook Handler:**

```typescript
// server/api/stripe.ts
import { stripe } from '../config/stripe';

export async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      // Update enrollments to confirmed
      const enrollmentIds = session.metadata.enrollmentIds.split(',').map(Number);
      await db.update(enrollments)
        .set({ 
          status: 'confirmed',
          paymentStatus: 'paid',
          stripePaymentIntentId: session.payment_intent 
        })
        .where(inArray(enrollments.id, enrollmentIds));
      
      // Send confirmation emails
      // ...
      break;

    case 'payment_intent.payment_failed':
      // Handle failed payment
      break;

    case 'charge.refunded':
      // Handle refund
      break;
  }

  res.json({ received: true });
}
```

**Frontend Redirect to Checkout:**

```typescript
// client/src/hooks/useCheckout.ts
import { apiRequest } from '@/lib/queryClient';

export function useCheckout() {
  const checkout = async (enrollmentIds: number[]) => {
    const { sessionId, url } = await apiRequest('/api/stripe/create-checkout-session', {
      method: 'POST',
      data: { enrollmentIds }
    });

    // Redirect to Stripe Checkout
    window.location.href = url;
  };

  return { checkout };
}
```

---

### 3. Anthropic Claude (AI)

**Purpose:** AI content generation, lesson planning, chatbots  
**Website:** https://anthropic.com  
**Documentation:** https://docs.anthropic.com

---

#### Setup Instructions

**Step 1: Create Account**

1. Visit https://console.anthropic.com
2. Sign up with email
3. Verify email

**Step 2: Generate API Key**

1. Go to **Settings → API Keys**
2. Click "Create Key"
3. Name: "ASA Learning Platform"
4. Copy API key (starts with `sk-ant-`)
5. Save securely (cannot view again)

**Step 3: Add Credits**

1. Go to **Settings → Billing**
2. Add payment method
3. Add credits (e.g., $100)

**Step 4: Monitor Usage**

1. Go to **Dashboard**
2. View usage statistics
3. Set up billing alerts

**Step 5: Add to Environment Variables**

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

#### Implementation

**Setup:**

```typescript
// server/config/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
```

**Generate Lesson Plan:**

```typescript
// server/api/ai.ts
import { anthropic } from '../config/anthropic';

export async function generateLesson(req, res) {
  const { topic, gradeLevel, duration, objectives } = req.body;

  const prompt = `Generate a comprehensive lesson plan for:
Topic: ${topic}
Grade Level: ${gradeLevel}
Duration: ${duration}
Learning Objectives:
${objectives.map(obj => `- ${obj}`).join('\n')}

Please include:
1. Lesson overview
2. Materials needed
3. Step-by-step activities with timing
4. Assessment methods
5. Differentiation strategies

Format as JSON with the following structure:
{
  "title": "...",
  "overview": "...",
  "materials": ["...", "..."],
  "activities": [
    {
      "name": "...",
      "duration": "...",
      "description": "..."
    }
  ],
  "assessment": "...",
  "differentiation": "..."
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 2048,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const content = message.content[0].text;
    const lessonPlan = JSON.parse(content);

    res.json({
      success: true,
      lesson: lessonPlan,
      metadata: {
        model: message.model,
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed' });
  }
}
```

**Cost Management:**

```typescript
// Track token usage
function estimateCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1000000) * 15; // $15 per 1M input tokens
  const outputCost = (outputTokens / 1000000) * 75; // $75 per 1M output tokens
  return inputCost + outputCost;
}
```

---

### 4. Brevo (Email Service)

**Purpose:** Transactional emails, welcome emails, notifications  
**Website:** https://brevo.com  
**Documentation:** https://developers.brevo.com

---

#### Setup Instructions

**Step 1: Create Account**

1. Visit https://brevo.com
2. Sign up for free account
3. Verify email

**Step 2: Generate API Key**

1. Go to **Settings → SMTP & API**
2. Click **API Keys**
3. Click "Generate a new API key"
4. Name: "ASA Platform"
5. Copy key (starts with `xkeysib-`)

**Step 3: Verify Domain (Optional but Recommended)**

1. Go to **Senders & IP**
2. Click "Add a sender"
3. Enter domain (e.g., yourschool.com)
4. Add DNS records as instructed
5. Verify domain

**Step 4: Create Email Templates (Optional)**

1. Go to **Campaigns → Email Templates**
2. Create templates for:
   - Welcome email
   - Password reset
   - Enrollment confirmation
3. Note template IDs

**Step 5: Add to Environment Variables**

```bash
# .env
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=noreply@yourschool.com
BREVO_SENDER_NAME=ASA Platform
```

---

#### Implementation

**Setup:**

```typescript
// server/config/brevo.ts
import { TransactionalEmailsApi } from '@getbrevo/brevo';

const brevo = new TransactionalEmailsApi();
brevo.setApiKey('BREVO_API_KEY', process.env.BREVO_API_KEY!);

export default brevo;
```

**Send Welcome Email:**

```typescript
// server/services/email.ts
import brevo from '../config/brevo';

export async function sendWelcomeEmail(user: any, school: any) {
  try {
    await brevo.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL!,
        name: process.env.BREVO_SENDER_NAME!,
      },
      to: [{ email: user.email, name: user.name }],
      subject: `Welcome to ${school.name}!`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <img src="${school.logo}" alt="${school.name}" style="max-width: 200px;" />
          <h1>Welcome, ${user.name}!</h1>
          <p>Thank you for joining ${school.name}. We're excited to have you in our community!</p>
          <h2>Next Steps:</h2>
          <ol>
            <li>Add your children's profiles</li>
            <li>Browse our class catalog</li>
            <li>Enroll in classes</li>
          </ol>
          <a href="${process.env.FRONTEND_URL}/parent" style="background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0;">
            Get Started
          </a>
          <p style="color: #666; font-size: 14px; margin-top: 40px;">
            If you have any questions, contact us at ${school.email}
          </p>
        </div>
      `,
    });
    
    console.log('Welcome email sent to', user.email);
  } catch (error) {
    console.error('Email send failed:', error);
  }
}
```

**Bulk Email:**

```typescript
export async function sendBulkEmail(recipients: any[], subject: string, content: string) {
  const emailBatches = chunk(recipients, 50); // Brevo limit: 50 per request

  for (const batch of emailBatches) {
    await brevo.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL!,
        name: process.env.BREVO_SENDER_NAME!,
      },
      to: batch.map(r => ({ email: r.email, name: r.name })),
      subject,
      htmlContent: content,
    });
  }
}
```

---

### 5. Twilio (SMS - Optional)

**Purpose:** SMS notifications  
**Website:** https://twilio.com  
**Documentation:** https://www.twilio.com/docs

---

#### Setup Instructions

**Step 1: Create Account**

1. Visit https://twilio.com
2. Sign up for free trial
3. Verify phone number

**Step 2: Get Credentials**

1. Go to **Dashboard**
2. Copy:
   - **Account SID** (starts with `AC`)
   - **Auth Token**

**Step 3: Get Phone Number**

1. Go to **Phone Numbers → Buy a number**
2. Select country (US)
3. Select number with SMS capability
4. Purchase number
5. Copy phone number

**Step 4: Add to Environment Variables**

```bash
# .env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
```

---

#### Implementation

**Setup:**

```typescript
// server/config/twilio.ts
import twilio from 'twilio';

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);
```

**Send SMS:**

```typescript
// server/services/sms.ts
import { twilioClient } from '../config/twilio';

export async function sendSMS(to: string, message: string) {
  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: to,
    });
    
    console.log('SMS sent:', result.sid);
    return result;
  } catch (error) {
    console.error('SMS send failed:', error);
    throw error;
  }
}

// Usage
await sendSMS('+1234567890', 'Your child has been enrolled in Python class!');
```

---

## Planned Integrations (Phases 2-3)

### 6. Thirdweb (Blockchain - Phase 3)

**Purpose:** NFT minting, smart contract deployment, Web3 infrastructure  
**Website:** https://thirdweb.com  
**Documentation:** https://portal.thirdweb.com

---

#### Setup Instructions

**Step 1: Create Account**

1. Visit https://thirdweb.com
2. Connect wallet (MetaMask)
3. Complete profile

**Step 2: Create Project**

1. Go to **Dashboard**
2. Click "Create Project"
3. Name: "ASA Learning Platform"

**Step 3: Get API Keys**

1. Go to **Settings → API Keys**
2. Click "Create API Key"
3. Copy:
   - **Client ID**
   - **Secret Key**

**Step 4: Deploy NFT Contract**

1. Go to **Contracts**
2. Click "Deploy Contract"
3. Select "NFT Collection"
4. Configure:
   - **Name:** "ASA Achievement Badges"
   - **Symbol:** "ASABADGE"
   - **Network:** Polygon (for low fees)
5. Deploy
6. Copy contract address

**Step 5: Add to Environment Variables**

```bash
# .env (Phase 3)
THIRDWEB_CLIENT_ID=...
THIRDWEB_SECRET_KEY=...
NFT_CONTRACT_ADDRESS=0x...
POLYGON_CHAIN_ID=137
```

---

#### Implementation (Planned)

**Setup:**

```typescript
// server/config/thirdweb.ts
import { ThirdwebSDK } from '@thirdweb-dev/sdk';

export const sdk = ThirdwebSDK.fromPrivateKey(
  process.env.THIRDWEB_SECRET_KEY!,
  'polygon',
  {
    clientId: process.env.THIRDWEB_CLIENT_ID!,
  }
);
```

**Mint NFT Badge:**

```typescript
// server/services/nft.ts
import { sdk } from '../config/thirdweb';

export async function mintBadge(studentWallet: string, achievement: any) {
  const contract = await sdk.getContract(process.env.NFT_CONTRACT_ADDRESS!);

  const metadata = {
    name: `${achievement.name} - ${achievement.studentName}`,
    description: achievement.description,
    image: achievement.imageUrl, // IPFS URL
    attributes: [
      { trait_type: 'Achievement', value: achievement.name },
      { trait_type: 'Rarity', value: achievement.rarity },
      { trait_type: 'School', value: achievement.schoolName },
      { trait_type: 'Date Earned', value: achievement.earnedDate },
    ],
  };

  const tx = await contract.erc721.mintTo(studentWallet, metadata);
  
  return {
    tokenId: tx.id.toString(),
    transactionHash: tx.receipt.transactionHash,
  };
}
```

---

### 7. Magic Link (Wallet Provider - Phase 3)

**Purpose:** Email-based wallet creation (no seed phrases)  
**Website:** https://magic.link  
**Documentation:** https://magic.link/docs

---

#### Setup Instructions

**Step 1: Create Account**

1. Visit https://magic.link
2. Sign up
3. Verify email

**Step 2: Create Project**

1. Go to **Dashboard**
2. Click "New App"
3. Name: "ASA Student Wallets"
4. Network: Polygon

**Step 3: Get API Keys**

1. Copy:
   - **Publishable Key**
   - **Secret Key**

**Step 4: Configure Domain**

1. Add allowed domains:
   - `http://localhost:5000` (development)
   - `https://your-domain.com` (production)

**Step 5: Add to Environment Variables**

```bash
# .env (Phase 3)
MAGIC_LINK_SECRET_KEY=...
VITE_MAGIC_LINK_PUBLISHABLE_KEY=...
```

---

#### Implementation (Planned)

**Setup:**

```typescript
// server/config/magic.ts
import { Magic } from '@magic-sdk/admin';

export const magic = new Magic(process.env.MAGIC_LINK_SECRET_KEY!);
```

**Create Wallet for Student:**

```typescript
// server/services/wallet.ts
import { magic } from '../config/magic';

export async function createStudentWallet(student: any) {
  // Generate Magic Link for student
  const email = `${student.id}@students.asa-platform.com`; // Internal email
  
  const didToken = await magic.auth.loginWithMagicLink({ email });
  const metadata = await magic.users.getMetadataByToken(didToken);
  
  const wallet = {
    address: metadata.publicAddress,
    email: email,
    provider: 'magic_link',
  };

  // Save to database
  await db.insert(studentWallets).values({
    studentId: student.id,
    walletAddress: wallet.address,
    walletProvider: 'magic_link',
    magicLinkEmail: wallet.email,
    walletStatus: 'locked', // Locked until graduation
  });

  return wallet;
}
```

---

### 8. Pinata (IPFS Storage - Phase 3)

**Purpose:** Decentralized storage for NFT metadata and images  
**Website:** https://pinata.cloud  
**Documentation:** https://docs.pinata.cloud

---

#### Setup Instructions

**Step 1: Create Account**

1. Visit https://pinata.cloud
2. Sign up for free account

**Step 2: Generate API Keys**

1. Go to **API Keys**
2. Click "New Key"
3. Select permissions:
   - ✅ Pin File to IPFS
   - ✅ Unpin File from IPFS
4. Copy:
   - **API Key**
   - **API Secret**

**Step 3: Add to Environment Variables**

```bash
# .env (Phase 3)
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
```

---

#### Implementation (Planned)

**Setup:**

```typescript
// server/config/pinata.ts
import pinataSDK from '@pinata/sdk';

export const pinata = new pinataSDK(
  process.env.PINATA_API_KEY!,
  process.env.PINATA_SECRET_KEY!
);
```

**Upload NFT Metadata:**

```typescript
// server/services/ipfs.ts
import { pinata } from '../config/pinata';

export async function uploadNFTMetadata(metadata: any) {
  // Upload image first (if local)
  let imageUrl = metadata.imageUrl;
  if (!imageUrl.startsWith('ipfs://')) {
    const imageResult = await pinata.pinFileToIPFS(metadata.imageFile);
    imageUrl = `ipfs://${imageResult.IpfsHash}`;
  }

  // Upload metadata
  const metadataJSON = {
    name: metadata.name,
    description: metadata.description,
    image: imageUrl,
    attributes: metadata.attributes,
  };

  const result = await pinata.pinJSONToIPFS(metadataJSON);
  
  return {
    ipfsHash: result.IpfsHash,
    uri: `ipfs://${result.IpfsHash}`,
    url: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
  };
}
```

---

## Integration Patterns

### Pattern 1: Environment-Based Configuration

**Use Case:** Different credentials per environment (dev, staging, prod)

**Implementation:**

```typescript
// server/config/index.ts
const config = {
  stripe: {
    secretKey: process.env.NODE_ENV === 'production' 
      ? process.env.STRIPE_SECRET_KEY_LIVE 
      : process.env.STRIPE_SECRET_KEY_TEST,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.NODE_ENV === 'production'
      ? process.env.SUPABASE_SERVICE_KEY_PROD
      : process.env.SUPABASE_SERVICE_KEY_DEV,
  },
};

export default config;
```

---

### Pattern 2: Retry Logic for External APIs

**Use Case:** Handle temporary failures gracefully

**Implementation:**

```typescript
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Should never reach here');
}

// Usage
const message = await callWithRetry(() => 
  anthropic.messages.create({ ... })
);
```

---

### Pattern 3: Graceful Degradation

**Use Case:** Continue operating if non-critical service fails

**Implementation:**

```typescript
async function sendNotification(user: any, message: string) {
  // Try SMS first
  try {
    await sendSMS(user.phoneNumber, message);
    return { method: 'sms', success: true };
  } catch (error) {
    console.error('SMS failed, falling back to email');
  }

  // Fallback to email
  try {
    await sendEmail(user.email, 'Notification', message);
    return { method: 'email', success: true };
  } catch (error) {
    console.error('Email failed, using in-app notification only');
  }

  // Final fallback: in-app notification
  await createInAppNotification(user.id, message);
  return { method: 'in-app', success: true };
}
```

---

### Pattern 4: Circuit Breaker

**Use Case:** Prevent cascading failures

**Implementation:**

```typescript
class CircuitBreaker {
  private failures = 0;
  private threshold = 5;
  private timeout = 60000; // 1 minute
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttempt = Date.now();

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

// Usage
const stripeBreaker = new CircuitBreaker();
const session = await stripeBreaker.execute(() => 
  stripe.checkout.sessions.create({ ... })
);
```

---

## API Key Management

### Using Replit Integrations

**Replit** provides built-in integrations for many services. Use these when available:

**Advantages:**
- Automatic key management
- Secure storage
- Team access control
- Key rotation

**How to Use:**
1. Open Replit project
2. Click "Tools" → "Integrations"
3. Search for service (e.g., "Stripe")
4. Click "Connect"
5. Follow prompts
6. Keys automatically added to environment

---

### Manual Key Management

**For services without Replit integration:**

**1. Store in Replit Secrets**
- Never commit to Git
- Use Secrets tab (lock icon)
- Access via `process.env`

**2. Key Rotation Schedule**
- Production keys: Every 90 days
- Development keys: Every 6 months
- Immediately if compromised

**3. Access Control**
- Limit who can view secrets
- Use separate keys per team member (if possible)
- Audit key usage regularly

**4. Monitoring**
- Set up alerts for unusual usage
- Track API call volumes
- Monitor costs

---

## Testing Procedures

### Testing Stripe Integration

**Test Mode:**
```typescript
// Use test credit cards
const testCards = {
  success: '4242424242424242',
  decline: '4000000000000002',
  requiresAuth: '4000002500003155',
};
```

**Test Workflow:**
1. Create test checkout session
2. Use test card `4242424242424242`
3. Complete payment
4. Verify webhook received
5. Check enrollment status updated

**Webhook Testing:**
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:5000/api/stripe/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

---

### Testing Supabase Integration

**Test Authentication:**
```typescript
// Create test user
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'TestPassword123!',
});

// Verify user created
expect(error).toBeNull();
expect(data.user).toBeDefined();

// Test login
const { data: loginData } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'TestPassword123!',
});

expect(loginData.session).toBeDefined();
```

---

### Testing AI Integration

**Test Lesson Generation:**
```typescript
const lessonPlan = await generateLesson({
  topic: 'Fractions',
  gradeLevel: '4th',
  duration: '45 minutes',
  objectives: ['Understand numerator and denominator'],
});

expect(lessonPlan.title).toBeDefined();
expect(lessonPlan.activities.length).toBeGreaterThan(0);
```

---

### Testing Email Integration

**Use Test Email Services:**
- **Mailtrap:** https://mailtrap.io (email testing)
- **Ethereal:** https://ethereal.email (free test emails)

**Test Workflow:**
1. Send email to test address
2. Verify received in test inbox
3. Check formatting
4. Verify links work

---

## Troubleshooting

### Stripe Issues

**Issue: Webhook not received**

**Solutions:**
1. Verify endpoint URL is correct and HTTPS
2. Check webhook signing secret matches
3. Test locally with Stripe CLI
4. Check firewall/proxy settings

**Issue: Payment succeeded but enrollment not confirmed**

**Solutions:**
1. Check webhook handler logs
2. Verify event type is `checkout.session.completed`
3. Check metadata includes enrollment IDs
4. Ensure no errors in database update

---

### Supabase Issues

**Issue: Invalid JWT token**

**Solutions:**
1. Verify token format: `Bearer <token>`
2. Check token not expired
3. Verify using correct project URL
4. Test token at https://jwt.io

**Issue: CORS errors**

**Solutions:**
1. Add frontend URL to allowed origins in Supabase dashboard
2. Include credentials in fetch requests
3. Verify redirect URLs configured

---

### AI Issues

**Issue: Rate limit exceeded**

**Solutions:**
1. Implement exponential backoff
2. Add request queuing
3. Upgrade to higher tier
4. Cache common responses

**Issue: Timeout errors**

**Solutions:**
1. Increase timeout in request
2. Reduce max_tokens
3. Simplify prompt
4. Split into multiple requests

---

**Document Control**
- Document Type: Integration Guide
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: Integration Team
- Approvers: CTO, Lead Developer
