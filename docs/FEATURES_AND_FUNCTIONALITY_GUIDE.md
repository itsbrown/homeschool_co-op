# ASA Learning Platform - Features and Functionality Guide

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Status:** Active Development

---

## Table of Contents
1. [Current Platform Features](#current-platform-features)
2. [Planned Features (Phases 1-3)](#planned-features-phases-1-3)
3. [User Workflows](#user-workflows)
4. [Administrative Workflows](#administrative-workflows)

---

## Current Platform Features

### 1. Multi-Role Authentication System

**Description:**  
Advanced authentication system allowing users to hold multiple roles (parent, educator, school admin) simultaneously with seamless role switching.

**Key Capabilities:**
- Email/password authentication via Supabase
- OAuth integration (Google, Facebook planned)
- Magic link login
- Password reset flows
- Multi-role support (same user can be parent AND educator)
- Dynamic role context switching
- Session management with JWT tokens

**User Flow:**
1. User visits login page
2. Enters credentials or uses OAuth
3. System validates and creates session
4. If user has multiple roles, displays role selector
5. User selects desired role
6. Dashboard loads based on selected role
7. User can switch roles anytime from navigation

**Technical Details:**
- **Frontend:** Supabase client for OAuth and session
- **Backend:** JWT validation via supabaseAuth middleware
- **Database:** Users table + user_roles junction table
- **Security:** JWT tokens, httpOnly cookies, CSRF protection

**Access Control:**
- **Parent:** View own children, enrollments, payments
- **Educator:** View assigned classes, students, gradebook
- **School Admin:** Full school management, user management, reports
- **Super Admin:** Platform-wide administration

---

### 2. School Management

**Description:**  
Comprehensive school administration system with multi-location support, custom branding, and configuration management.

**Key Capabilities:**
- School profile management (name, address, contact info)
- Custom logo upload and branding
- Multi-location management
- School settings configuration
- Membership fee management
- Academic year setup
- Custom category creation
- Staff directory

**User Flow (School Admin):**
1. Navigate to school settings
2. Update school information (name, contact, etc.)
3. Upload school logo (auto-resized to optimal dimensions)
4. Configure membership fees and renewal dates
5. Set academic year start/end dates
6. Add/manage locations
7. Create custom categories for classes
8. Save changes (instantly applied across platform)

**Technical Details:**
- **Database:** schools, locations, categories tables
- **File Storage:** Local filesystem for logos
- **Validation:** Zod schemas for all inputs
- **Multi-tenancy:** All data scoped to schoolId

**Configuration Options:**
- **Membership Fee:** Annual fee amount
- **Renewal Date:** When memberships renew
- **Grace Period:** Days after expiration before suspension
- **Membership Required:** Toggle to enforce membership
- **Academic Year:** Start and end dates
- **Timezone:** For scheduling and communications

---

### 3. Class Management

**Description:**  
Create, schedule, and manage classes with multi-variant pricing, capacity limits, and enrollment tracking.

**Key Capabilities:**
- Class creation with rich details
- Multi-variant pricing (early bird, regular, late)
- Age range and grade level targeting
- Capacity management with real-time availability
- Schedule management
- Prerequisites and requirements
- Category and location assignment
- Class status (draft, active, full, archived)
- Instructor assignment
- Image upload for class promotion

**User Flow (Admin Creating Class):**
1. Navigate to class management
2. Click "Create New Class"
3. Enter class details:
   - Name and description
   - Instructor name
   - Age range (min/max)
   - Grade levels
   - Location
   - Category
4. Set capacity and pricing:
   - Maximum students
   - Regular price
   - Early bird price + deadline
   - Late registration fee + start date
5. Define schedule:
   - Days of week
   - Time
   - Duration
   - Start and end dates
6. Add prerequisites, materials, image
7. Save as draft or publish immediately
8. Share class link or add to catalog

**User Flow (Parent Browsing Classes):**
1. Navigate to class catalog
2. Apply filters:
   - Location
   - Category
   - Age range
   - Search text
3. View class cards with key info
4. Click class for full details
5. Check if child meets requirements
6. View pricing (early bird vs regular)
7. Add to cart or enroll immediately

**Technical Details:**
- **Database:** classes table with foreign keys to schools, locations, categories
- **Pricing Logic:** Automatic price selection based on current date vs deadlines
- **Availability:** Real-time calculation (capacity - currentEnrollment)
- **Validation:** Age/grade checks before enrollment

**Pricing Variants:**
- **Early Bird:** Discounted price before deadline
- **Regular:** Standard price
- **Late:** Regular price + late fee after registration start

---

### 4. Enrollment Management

**Description:**  
Complete enrollment workflow from browsing classes to payment, with duplicate prevention and status tracking.

**Key Capabilities:**
- Browse and filter available classes
- Add classes to cart
- Duplicate enrollment prevention
- Enrollment status workflow (pending → confirmed → completed/cancelled)
- Waitlist management (planned)
- Parent-student association
- Enrollment history tracking
- Payment integration

**User Flow (Parent Enrolling Child):**
1. Browse class catalog
2. Filter by child's age/grade
3. Select class and view details
4. Click "Enroll [Child Name]"
5. Class added to cart
6. Repeat for additional classes/children
7. Review cart:
   - See all pending enrollments
   - Remove unwanted items
   - See total cost
8. Proceed to checkout
9. Complete payment via Stripe
10. Receive confirmation email
11. Enrollment status changes to "confirmed"

**Enrollment Status Flow:**
```
Draft → Pending → Confirmed → Completed
              ↓
           Cancelled
```

**Technical Details:**
- **Database:** enrollments table
- **Duplicate Check:** Query for existing (childId, classId) combination
- **Capacity Check:** Verify spots available before adding to cart
- **Price Calculation:** Automatic based on variant + discounts
- **Payment Link:** Stripe Checkout session

**Enrollment Constraints:**
- Cannot enroll if class full
- Cannot enroll same child in same class twice
- Child must meet age/grade requirements
- Parent must have active role at school

---

### 5. Payment Processing (Stripe)

**Description:**  
Secure payment processing using Stripe with checkout, payment tracking, and automated confirmations.

**Key Capabilities:**
- Stripe Checkout integration (hosted payment page)
- Credit card payments
- Payment history tracking
- Automatic receipt generation
- Refund processing
- Failed payment handling
- Payment notifications
- Secure webhook processing

**User Flow (Checkout Process):**
1. User reviews cart
2. Clicks "Proceed to Checkout"
3. Backend creates Stripe Checkout session:
   - Line items for each enrollment
   - Total calculated with discounts
   - Metadata includes enrollment IDs
4. User redirected to Stripe Checkout
5. User enters payment information on Stripe
6. Stripe processes payment
7. On success:
   - User redirected to success page
   - Stripe sends webhook to backend
8. Backend webhook handler:
   - Verifies webhook signature
   - Updates enrollment statuses to "confirmed"
   - Updates payment statuses to "paid"
   - Sends confirmation email
9. User sees confirmed enrollments in dashboard

**Technical Details:**
- **Provider:** Stripe (PCI-compliant)
- **Integration:** stripe npm package
- **Checkout:** Hosted Checkout page (Stripe-managed)
- **Webhooks:** `/api/stripe/webhook` endpoint
- **Security:** Webhook signature verification
- **Idempotency:** Webhook event IDs prevent duplicate processing

**Supported Payment Methods:**
- Credit cards (Visa, Mastercard, Amex, Discover)
- Debit cards
- Digital wallets (Apple Pay, Google Pay) via Stripe

**Refund Process:**
1. Admin initiates refund in admin panel
2. Backend calls Stripe refund API
3. Stripe processes refund
4. Webhook confirms refund
5. Enrollment status updated to "cancelled"
6. Parent notified

---

### 6. Shopping Cart System

**Description:**  
TanStack Query-based cart with API-first state management, race condition prevention, and atomic operations.

**Key Capabilities:**
- Add classes to cart
- Remove individual items
- Bulk removal
- Cart persistence (database-backed)
- Real-time total calculation
- Discount application
- Cart expiration
- Item count badge

**User Flow:**
1. Parent adds class to cart
2. Cart icon shows badge with count
3. Parent continues browsing
4. Parent clicks cart icon
5. Cart drawer/page opens showing:
   - All cart items
   - Child name
   - Class name and schedule
   - Price (with variant)
   - Remove button per item
   - Total
6. Parent can:
   - Remove items
   - Continue shopping
   - Proceed to checkout
7. Checkout redirects to Stripe

**Technical Details:**
- **State Management:** TanStack Query
- **API Endpoints:**
  - GET `/api/cart` - Fetch cart
  - POST `/api/enrollments` - Add item
  - DELETE `/api/enrollments/:id` - Remove item
  - POST `/api/cart/bulk-cancel` - Remove multiple
- **Race Conditions:** Prevented by query invalidation + optimistic updates
- **Persistence:** All cart items stored as enrollments with status='pending'

**Cart Cleanup:**
- Abandoned carts cleaned up after 24 hours
- Pending enrollments without payment removed

---

### 7. Discount System

**Description:**  
Database-managed discount system with automatic application and conflict prevention.

**Key Capabilities:**
- Free After Threshold discounts (e.g., "3rd class free")
- Percentage-based discounts
- Dollar amount discounts
- Time-limited discounts
- Automatic discount application at checkout
- Discount priority/stacking rules
- Usage tracking

**Admin User Flow (Creating Discount):**
1. Navigate to discount management
2. Click "Create Discount"
3. Select discount type:
   - Free After Threshold
   - Percentage Off
   - Dollar Amount
4. Configure parameters:
   - Threshold (e.g., 3 for "3rd class free")
   - Percentage or amount
   - Applicable classes (all or specific)
   - Start and end dates
5. Save discount
6. System auto-applies to eligible carts

**Parent User Flow (Receiving Discount):**
1. Parent adds 3 classes to cart
2. Cart total calculated
3. System detects "3rd class free" discount applies
4. Cheapest class removed from total
5. Parent sees discount in cart summary
6. Proceeds to checkout with discounted price

**Technical Details:**
- **Storage:** Database table for discounts
- **Application:** Server-side at checkout
- **Conflict Resolution:** Highest-value discount wins
- **Validation:** Check date range, usage limits

---

### 8. Staff Management & Invitations

**Description:**  
Automated staff onboarding with secure token-based invitations and role assignment.

**Key Capabilities:**
- Invite staff via email
- Secure invitation tokens
- Expiration handling (7 days)
- Role assignment (educator, schoolAdmin)
- Staff directory
- Permission management
- Automatic account creation on acceptance

**Admin User Flow (Inviting Staff):**
1. Navigate to staff management
2. Click "Invite Staff Member"
3. Enter:
   - Email address
   - Name (optional)
   - Role (educator or schoolAdmin)
4. Click "Send Invitation"
5. System:
   - Generates unique token
   - Creates invitation record
   - Sends email with link
6. Invitation appears in "Pending Invitations"

**Staff User Flow (Accepting Invitation):**
1. Receives email with invitation link
2. Clicks link (validates token)
3. Redirected to registration/login:
   - If account exists: Log in, role added
   - If new: Complete registration
4. Account automatically associated with school
5. Role assigned
6. Can log in immediately

**Technical Details:**
- **Tokens:** UUID v4, stored in database
- **Expiration:** 7 days from creation
- **Email:** Brevo/SendGrid
- **Security:** Token single-use, server-side validation

---

### 9. Parent & Student Profile Management

**Description:**  
Comprehensive profile management for parents and students with edit capabilities and data validation.

**Key Capabilities:**
- Parent profile editing
- Student profile management (create, edit)
- Emergency contact information
- Medical information storage
- Interest and learning style tracking
- Profile image upload
- Multi-child management
- Data export (planned)

**Parent User Flow (Managing Profiles):**
1. Navigate to profile
2. View/edit own information:
   - Name
   - Email (read-only, managed by auth)
   - Phone number
   - Address
3. Navigate to children section
4. View list of children
5. Add new child:
   - First and last name
   - Date of birth
   - Grade level
   - Gender (optional)
   - Allergies
   - Medical info
   - Emergency contact
   - Interests
   - Learning style
6. Edit existing child profiles
7. Upload child photo (optional)
8. Save changes

**Admin User Flow (Viewing Parent Profile):**
1. Navigate to user management
2. Search for parent
3. Click parent name
4. View profile:
   - Contact information
   - Associated children
   - Enrollment history
   - Payment history
   - Membership status
5. Can send messages or emails
6. Cannot edit parent data (parent edits own)

**Technical Details:**
- **Database:** users, children tables
- **Multi-Tenancy:** Admins only see parents at their school
- **Validation:** Age calculations, required fields
- **Privacy:** Parents control own data, view-only for admins

---

### 10. Student Management System

**Description:**  
Track students across schools with auto-sync for existing children and comprehensive student data.

**Key Capabilities:**
- Student creation and editing
- Auto-sync across schools (if student moves)
- Grade level tracking with age calculation
- Learning style preferences
- Medical and allergy tracking
- Interest tagging
- Emergency contacts
- Parent associations
- Enrollment history

**User Flow (Child Moving Schools):**
1. Child enrolls at School A (Year 1)
2. Parent registers child profile
3. Child completes classes at School A
4. Family moves, parent registers at School B (Year 2)
5. During registration, parent enters child info
6. System detects existing child record (matching name + DOB)
7. System links child to School B
8. Child's historical data accessible at School B
9. Both schools maintain separate enrollment records
10. Shared data: name, DOB, medical info

**Technical Details:**
- **Database:** children table
- **Matching:** Name + date of birth
- **Sync:** Automatic when match detected
- **Isolation:** Enrollment data remains school-specific

---

### 11. Notification System

**Description:**  
In-app notification system with PostgreSQL storage, real-time unread counts, and targeted delivery.

**Key Capabilities:**
- Create notifications
- Target by role (all parents, all admins)
- Target specific users
- Mark as read/unread
- Notification history
- Real-time badge counts
- Priority levels
- Action URLs (clickable notifications)
- Email fallback (planned)

**User Flow (Receiving Notifications):**
1. System event occurs (enrollment confirmed, payment received, etc.)
2. Backend creates notification record
3. Notification inserted into database
4. User sees badge count increase on notification icon
5. User clicks notification bell
6. Dropdown shows recent notifications
7. User clicks notification:
   - Marked as read
   - Redirected to action URL (e.g., view enrollment)
8. Badge count updates

**Admin User Flow (Sending Announcement):**
1. Navigate to notifications
2. Click "Create Announcement"
3. Enter:
   - Title
   - Message
   - Priority (normal, high)
   - Recipients (all parents, all staff, specific users)
   - Action URL (optional)
   - Expiration date (optional)
4. Click "Send"
5. Notification created for all recipients
6. Email sent (if configured)

**Technical Details:**
- **Database:** notifications table
- **Real-time:** Polling (5 seconds) or WebSockets (planned)
- **Badge Count:** Query for unread count
- **Targeting:** Role-based or user-specific

**Notification Types:**
- **Info:** General information (blue)
- **Success:** Positive confirmations (green)
- **Warning:** Important notices (yellow)
- **Error:** Issues requiring attention (red)

---

### 12. AI-Powered Content Generation

**Description:**  
AI features powered by Anthropic Claude for lesson generation, content analysis, and educational support.

**Key Capabilities:**
- AI Lesson Plan Generator
- Content analysis
- Educational insights
- Technical support assistance
- Coloring page generation (Stability AI)
- Text processing (Hugging Face)
- Token usage tracking

**User Flow (Educator Using Lesson Generator):**
1. Navigate to AI Tools
2. Select "Lesson Plan Generator"
3. Enter parameters:
   - Topic (e.g., "Introduction to Fractions")
   - Grade level
   - Duration
   - Learning objectives
   - Special considerations
4. Click "Generate"
5. AI (Claude) generates:
   - Lesson overview
   - Materials needed
   - Step-by-step activities
   - Assessment methods
   - Differentiation strategies
6. Educator reviews lesson
7. Options:
   - Edit content
   - Regenerate with adjustments
   - Save to curriculum library
   - Print or export

**Technical Details:**
- **Provider:** Anthropic (Claude Opus)
- **Model:** claude-opus-4-20250514
- **Cost:** ~$15 per 1M input tokens
- **Response Time:** 5-30 seconds
- **Token Limit:** 2048 output tokens typical

**Additional AI Features:**
- **Content Analysis:** Analyze uploaded documents
- **Coloring Pages:** Generate custom coloring sheets (Stability AI)
- **Text Processing:** NLP tasks via Hugging Face

---

### 13. Welcome Email Automation

**Description:**  
Automated, school-branded HTML welcome emails sent upon registration.

**Key Capabilities:**
- Triggered on new user registration
- School logo and branding
- Personalized content
- Next steps guide
- Contact information
- HTML templates
- Delivery tracking

**User Flow:**
1. Parent completes registration
2. Backend event triggers email service
3. Email composed with:
   - School logo
   - Personalized greeting
   - Welcome message
   - Next steps (add children, browse classes)
   - Contact info
   - Login link
4. Email sent via Brevo
5. Parent receives within 5 minutes
6. Email includes:
   - School-specific branding
   - Location information
   - Call-to-action buttons

**Technical Details:**
- **Provider:** Brevo (primary), SendGrid (backup)
- **Trigger:** User creation in database
- **Template:** HTML with dynamic content
- **Variables:** User name, school name, school logo URL

---

### 14. Content Management System

**Description:**  
Knowledge base management with file uploads and AI-powered content analysis.

**Key Capabilities:**
- Create knowledge bases
- Upload files (PDF, DOCX, images)
- AI content analysis
- Search functionality
- Categorization
- Version control (planned)
- Access permissions (school-scoped)
- View count tracking

**Admin User Flow (Creating Knowledge Base):**
1. Navigate to Knowledge Base
2. Click "Create New"
3. Enter:
   - Title
   - Description
   - Category
   - Tags
4. Upload files:
   - PDFs
   - Word documents
   - Images
5. Optional: Run AI analysis
   - Extracts key concepts
   - Generates summary
   - Suggests tags
6. Set status (draft or published)
7. Save knowledge base
8. Share with educators/staff

**Educator User Flow (Using Knowledge Base):**
1. Navigate to Knowledge Base library
2. Browse or search
3. Filter by category/tags
4. Click to view knowledge base
5. Read content
6. Download attached files
7. Use in lesson planning

**Technical Details:**
- **Database:** knowledge_bases, knowledge_base_files tables
- **File Storage:** Local filesystem
- **AI Analysis:** Anthropic Claude (optional)
- **Search:** PostgreSQL full-text search

---

### 15. Multi-Location Support

**Description:**  
Support for schools with multiple physical locations with location-specific features.

**Key Capabilities:**
- Create multiple locations
- Location-specific classes
- Location-based filtering
- Enrollment by location
- Location-specific staff
- Location-specific reporting

**Admin User Flow (Managing Locations):**
1. Navigate to school settings
2. Go to locations tab
3. View existing locations
4. Add new location:
   - Name
   - Address
   - City, state, zip
   - Phone number
   - Capacity (optional)
5. Assign classes to location
6. Assign staff to location
7. Save location

**Parent User Flow (Selecting Location):**
1. During registration, select preferred location
2. When browsing classes, filter by location
3. View classes only at selected location
4. Enroll children at any location
5. Can change preferred location

**Technical Details:**
- **Database:** locations table
- **Relationships:** Classes → location, users → locations (many-to-many)
- **Filtering:** All class queries include location filter option

---

### 16. Category Management

**Description:**  
School-level custom category system with dynamic dropdown integration and idempotent seeding.

**Key Capabilities:**
- Create custom categories
- School-specific categories
- Default category seeding
- Category assignment to classes
- Filter by category
- Category-based reporting
- Color coding
- Icon assignment

**Admin User Flow (Creating Category):**
1. Navigate to school settings
2. Go to categories tab
3. Click "Add Category"
4. Enter:
   - Category name (e.g., "STEM", "Arts", "Sports")
   - Description
   - Color (hex code)
   - Icon (optional)
5. Save category
6. Category appears in class creation dropdown

**Default Categories (Auto-Seeded):**
- STEM
- Arts & Crafts
- Language Arts
- Mathematics
- Science
- Physical Education
- Music
- Technology

**Technical Details:**
- **Database:** categories table
- **Seeding:** Idempotent script creates defaults on school creation
- **Customization:** Schools can add unlimited custom categories
- **Filtering:** Categories used in class browsing filters

---

## Planned Features (Phases 1-3)

### Phase 1: Parent Credit System

#### Feature: Credit Earning
**Description:**  
Parents earn credits for various actions that promote school growth and engagement.

**Earning Actions:**

**Referral Rewards:**
- Friend registers: $20
- Friend enrolls in class: $50
- Friend becomes member: $100
- 2nd tier referral: $10

**Marketing Engagement:**
- Share marketing piece: $1
- Comment on shared content: $0.50
- Create user testimonial: $5
- Video testimonial: $25

**Community Participation:**
- Attend parent event: $2
- Complete survey: $3
- Volunteer activity: $10
- Become mentor: $50

**Loyalty Rewards:**
- 1-year anniversary: $25
- Early renewal: $15
- Enroll sibling: $30

**User Flow (Earning Credits):**
1. Parent performs action (e.g., shares marketing piece)
2. System tracks action via unique link
3. Credit ledger entry created (status: pending)
4. Pending balance updated
5. After 7-day confirmation period:
   - If action valid, status → confirmed
   - Credits move from pending to available
   - Parent notified
6. Credits appear in dashboard balance

---

#### Feature: Credit Tier System
**Description:**  
Tier system with multipliers to incentivize higher engagement.

**Tiers:**

**Bronze (0-100 credits):**
- 1.0x multiplier
- Standard benefits

**Silver (101-500 credits):**
- 1.5x multiplier
- Early class access (24h before public)
- Exclusive parent events

**Gold (501-1,500 credits):**
- 2.0x multiplier
- Priority enrollment
- Free membership for 1 year
- Custom referral page

**Platinum (1,501+ credits):**
- 3.0x multiplier
- Revenue share beyond credits
- Advisory board invitation
- Founder token bonus (Phase 3)

**User Flow (Tier Progression):**
1. Parent earns credits
2. System calculates lifetime earned
3. If threshold crossed:
   - Tier updated automatically
   - Multiplier applied to future earnings
   - Benefits unlocked
   - Celebration notification sent
4. Parent sees tier badge in dashboard
5. Future earnings multiplied

---

#### Feature: Credit Redemption
**Description:**  
Parents can use credits to reduce tuition costs and purchase school items.

**Redemption Options:**
- Apply to tuition (1:1 ratio, $1 credit = $1 off)
- School merchandise
- Special event tickets
- Transfer to other families
- Lock for crypto conversion (Phase 3)

**User Flow (Redeeming Credits):**
1. Parent proceeds to checkout with enrollments
2. Cart shows total cost
3. "Use Credits" option displayed
4. Parent enters amount to redeem (up to available balance)
5. Discount applied to total
6. Remaining balance calculated
7. Parent completes payment
8. Credits deducted from balance
9. Transaction recorded in history

---

#### Feature: Marketing Hub
**Description:**  
Centralized hub for AI-generated marketing content with one-click sharing and performance tracking.

**User Flow (Parent Sharing Content):**
1. Parent navigates to Marketing Hub
2. Browses available marketing pieces:
   - Campaign ads
   - Announcements
   - Success stories
3. Selects piece to share
4. Chooses platform:
   - Facebook
   - Instagram
   - Twitter/X
   - Email to friends
   - SMS
5. System generates:
   - Personalized tracking URL (includes parent's referral code)
   - Pre-written caption
   - Optimized image
6. Parent clicks "Share to Facebook"
7. Facebook share dialog opens with content pre-populated
8. Parent posts
9. System tracks:
   - Share event ($1 credit earned immediately)
   - Clicks on link
   - Conversions (registration, enrollment)
10. Parent sees performance stats in dashboard

**Admin Flow (Creating Marketing Piece):**
1. Admin opens AI Co-Admin
2. Types: "Create a summer camp promotion"
3. AI generates:
   - 3 ad copy variations
   - 2 image designs (via Stability AI)
   - Suggested posting times
   - Target audience recommendations
4. Admin reviews and approves
5. Marketing piece published to hub
6. All parents can now share
7. Admin tracks overall performance

---

#### Feature: Referral Tracking
**Description:**  
Comprehensive referral tracking with unique links, conversion attribution, and performance analytics.

**User Flow (Parent Referring Friend):**
1. Parent navigates to referral dashboard
2. Sees unique referral link (e.g., `asa.com/register?ref=ABC123`)
3. Options to share:
   - Copy link
   - Email invite
   - Social media share
   - QR code download
4. Parent shares link with friend
5. Friend clicks link
   - Click tracked
   - Cookie set
6. Friend registers
   - System attributes registration to parent
   - $20 credit awarded (pending)
7. Friend enrolls in class
   - Additional $50 credit awarded (pending)
8. After 7 days:
   - If friend still active, credits confirmed
   - Parent notified
9. Parent sees referral in dashboard:
   - Friend's name (if consented)
   - Conversion date
   - Credits earned
   - Status

**Performance Analytics:**
Parent dashboard shows:
- Total referrals
- Click-through rate
- Conversion rate
- Top performing links
- Earnings breakdown
- Tier progress

---

### Phase 2: AI Co-Admin

#### Feature: Natural Language Command Interface
**Description:**  
Chat-based AI assistant that understands natural language commands and executes administrative tasks.

**User Flow (Admin Creating Discount via AI):**
1. Admin opens AI Co-Admin chat widget
2. Types: "Create a 20% discount for summer camp classes"
3. AI responds:
   ```
   I'll create a discount for summer camps. Let me clarify:
   1. Which summer camp classes? (You have 3 active)
   2. What's the expiration date?
   3. Should it apply to new enrollments only?
   ```
4. Admin responds: "All summer camps, expiring July 1st, all enrollments"
5. AI shows preview:
   ```
   Discount Summary:
   - Type: 20% off
   - Applies to: STEM Camp, Arts Camp, Sports Camp
   - Expiration: July 1, 2026
   - Estimated impact: $450 in discounts
   
   Proceed?
   ```
6. Admin clicks "Approve"
7. AI executes:
   - Creates discount in database
   - Applies to 3 classes
   - Sets expiration
8. AI confirms:
   ```
   ✓ Discount created successfully
   View it here: [Link to discount page]
   ```

---

#### Feature: Proactive Daily Brief
**Description:**  
AI-generated daily summary of important metrics, insights, and recommended actions.

**User Flow (Admin Morning Routine):**
1. Admin logs in at 8am
2. Daily brief appears in dashboard
3. Brief contains:

**Attention Needed:**
- "Art Class enrollment 40% below average"
  - Suggested action: Create 15% discount + email campaign

**Insights:**
- "Tuesday 6pm classes have 90% attendance"
  - Recommendation: Add more classes at this time

**Opportunities:**
- "12 parents visited Science Fair page 3+ times"
  - Suggested action: Send gentle reminder email

**Revenue:**
- Month-to-date: $15,240.50 (+12% vs last month)
- On track for goal: Yes

**Upcoming Actions:**
- 8 membership renewals due this week
  - Status: Reminders sent

4. Admin can:
   - Click suggested actions to execute
   - Dismiss items
   - Ask AI follow-up questions

---

#### Feature: Automated Campaign Creation
**Description:**  
AI creates complete marketing campaigns from simple prompts.

**User Flow:**
1. Admin types: "Summer camp promotion"
2. AI asks:
   ```
   I'll create a summer camp campaign. A few questions:
   - Target audience? (parents of kids age 8-14?)
   - Budget? ($500?)
   - Platforms? (Facebook, Instagram, Email?)
   ```
3. Admin answers
4. AI generates (in <2 minutes):
   - **Ad Copy (3 variations):**
     1. "Give your kids an unforgettable summer! Limited spots..."
     2. "STEM + Arts + Sports = Amazing Summer. Enroll now..."
     3. "Summer boredom? Not here! Join our action-packed camps..."
   - **Visual Assets (2 designs):**
     - Colorful summer-themed graphics via Stability AI
   - **Email Sequence (3 emails):**
     1. Introduction email
     2. Reminder (2 days later)
     3. Last chance (1 day before deadline)
   - **Tracking Setup:**
     - Unique URLs per platform
     - Conversion pixels
   - **Budget Allocation:**
     - Facebook: $300
     - Instagram: $150
     - Email: $50
   - **ROI Projection:**
     - Expected reach: 5,000
     - Estimated enrollments: 15
     - Revenue: $2,625
     - ROI: 425%
5. Admin reviews and approves
6. Campaign activated
7. AI monitors performance and suggests adjustments

---

### Phase 2: Student Credits & Achievements

#### Feature: Student Credit Earning
**Description:**  
Students earn credits for academic achievements, locked until graduation.

**Earning Actions:**

**Class Performance:**
- Complete class: $5
- Proficient rating: $8
- Mastery rating: $12
- Perfect attendance: $3 bonus

**Level Progression:**
- Complete grade level: $25
- Advance 2 levels in 1 year: $50
- Master all subjects: $100

**Academic Milestones:**
- Read 10 books: $10
- 100% final assessment: $15
- Peer teaching: $20
- Portfolio piece: $25

**Character & Citizenship:**
- Help another student: $2
- Community service hour: $5
- Leadership role: $10/month
- Conflict resolution: $3

**User Flow (Student Earning Credits):**
1. Student completes Python class with Mastery rating
2. Educator marks class complete in system
3. System detects achievement:
   - Base credit: $12 (mastery)
   - Tier multiplier: 1.25x (Rising Star)
   - Final credit: $15
4. Credit added to student balance
5. Balance remains locked
6. Student sees:
   - New achievement badge
   - Credits earned
   - Updated total
   - Progress toward next tier
7. Parent notified
8. NFT badge minted (Phase 3)

---

#### Feature: Quest Dashboard (Gamification)
**Description:**  
Game-like interface showing quests, progress, and leaderboards.

**User Flow (Student Portal):**
1. Student logs into student portal
2. Quest dashboard displays:

**Student Profile:**
- Name
- Level: 12
- XP: 2450/3000 to next level
- Tier: Rising Star

**Active Quests:**
- **Bookworm Challenge**
  - Read 10 books this semester
  - Progress: 7/10
  - Reward: $10 credits
  - Time left: 45 days

- **Helpful Hero**
  - Help 5 classmates
  - Progress: 3/5
  - Reward: $10 credits

**Completed Quests:**
- Python Pioneer ✓
  - Completed: Nov 20, 2025
  - Earned: $15

**Leaderboards:**
- Class Rank: #3 of 15
- Grade Rank: #12 of 80
- School Rank: #45 of 247

**AI Mentor Suggestions:**
- "You're close to the next tier! Complete 'Helpful Hero' quest."
- "Try the Science Fair - it's worth $20 and matches your interests!"

3. Student can:
   - View quest details
   - Track progress
   - See what friends are doing
   - Check NFT collection (Phase 3)

---

#### Feature: Student Tier System
**Description:**  
Tier progression for students with multipliers.

**Tiers:**
- **Apprentice Scholar (0-100):** 1.0x multiplier
- **Rising Star (101-500):** 1.25x multiplier
- **Excellence Scholar (501-1,500):** 1.5x multiplier
- **Master Scholar (1,501-3,000):** 2.0x multiplier
- **Legacy Builder (3,000+):** 2.5x multiplier

**Tier Benefits:**
- Higher multiplier on future earnings
- Exclusive badge designs
- Special recognition events
- Graduation ceremony honors

---

### Phase 3: NFT Achievement Badges

#### Feature: Automatic NFT Minting
**Description:**  
Achievements automatically minted as NFTs to student wallets.

**User Flow (NFT Minting):**
1. Student achieves milestone (e.g., completes Python class)
2. System triggers NFT minting service:
   
   **Step 1: Generate Badge Artwork**
   - AI (Stability AI) creates badge design
   - Prompt: "Achievement badge for Python Mastery, uncommon rarity, blue glowing border, school colors, professional design"
   - Image generated in ~30 seconds

   **Step 2: Upload to IPFS**
   - Image uploaded to Pinata (IPFS pinning service)
   - Returns IPFS URI: `ipfs://QmX7k2a...`

   **Step 3: Package Metadata**
   ```json
   {
     "name": "Python Master - Johnny Smith",
     "description": "Achieved mastery in Python programming",
     "image": "ipfs://QmX7k2a...",
     "attributes": [
       {"trait_type": "Achievement", "value": "Python Master"},
       {"trait_type": "Rarity", "value": "Uncommon"},
       {"trait_type": "School", "value": "ASA - Austin"},
       {"trait_type": "Date Earned", "value": "2025-11-20"},
       {"trait_type": "Grade", "value": "5th"}
     ]
   }
   ```

   **Step 4: Upload Metadata to IPFS**
   - Metadata uploaded to Pinata
   - Returns metadata URI: `ipfs://QmY8m3b...`

   **Step 5: Mint NFT**
   - Call smart contract: `ASABadgeNFT.mintBadge()`
   - Parameters:
     - Student wallet address
     - Metadata URI
     - Achievement ID
   - Transaction submitted to Polygon
   - Wait for confirmation (~3 seconds)

   **Step 6: Record in Database**
   - Store NFT details:
     - Token ID
     - Transaction hash
     - Contract address
   - Link to achievement

3. Notification sent to student and parent:
   ```
   🎉 New Achievement Badge Earned!
   
   Johnny earned "Python Master" badge!
   Rarity: Uncommon
   
   View your NFT collection →
   ```

4. Student views NFT in gallery
5. Badge is permanently theirs (locked until graduation)

---

#### Feature: NFT Gallery
**Description:**  
Visual gallery displaying all earned NFT badges.

**User Flow (Student Viewing Collection):**
1. Student navigates to NFT Gallery
2. Grid view shows all badges:
   - Badge image
   - Name
   - Rarity indicator
   - Date earned
3. Click badge for details:
   - Full metadata
   - Achievement story
   - Blockchain verification (transaction hash)
   - Share options
4. Filter by:
   - Rarity
   - Category (academic, character, special)
   - Date earned
5. Collection stats:
   - Total badges: 8
   - By rarity:
     - Common: 5
     - Uncommon: 2
     - Rare: 1
   - Estimated value: 0.24 ETH
   - Completion: 45% (of all possible badges)
6. Missing badges preview:
   - Shows achievable badges
   - Requirements to earn
   - Rarity

---

#### Feature: Badge Sharing
**Description:**  
Share NFT achievements on social media and with family.

**User Flow:**
1. Student selects badge
2. Clicks "Share"
3. Options:
   - Social media (Facebook, Twitter, Instagram)
   - Email to family
   - Print certificate
   - Copy link to gallery
4. Generates shareable link:
   - Public gallery page (if enabled)
   - Badge displayed with school branding
   - Blockchain verification
5. Share link with friends/family
6. Recipients see:
   - Badge image
   - Student name (if permitted)
   - Achievement details
   - "Verified on Polygon" badge

---

### Phase 3: Crypto Conversion & ASA Token

#### Feature: Credit to Token Conversion
**Description:**  
Convert locked credits to ASA tokens at graduation.

**User Flow (Graduation Ceremony):**
1. Student graduates (age 18 or completion)
2. Graduation package prepared:
   - Total credits earned: $2,850
   - NFT collection: 42 badges
   - Wallet status: Locked → Graduating

3. Graduation ceremony (in-person or virtual):
   - School celebrates student
   - Achievement slideshow
   - NFT collection showcase

4. Wallet unlock ceremony:
   - Admin clicks "Unlock Wallet"
   - System converts credits to tokens:
     - $2,850 credits → 2,850 ASA tokens
     - Conversion rate: 1:1
     - Transaction executed on blockchain
   - Tokens transferred to student wallet
   - Wallet control transferred to student

5. Educational session:
   - "Your Digital Assets" guide
   - Wallet management tutorial
   - Investment basics
   - Tax implications
   - How to use tokens for college tuition

6. Physical wallet gift (optional):
   - Hardware wallet (Ledger/Trezor)
   - Pre-loaded with ASA tokens
   - Recovery phrase securely provided

7. Student now controls:
   - 2,850 ASA tokens (~$5,700 value)
   - 42 NFT badges
   - Full wallet access

**Post-Graduation Options:**
- Hold tokens (investment)
- Use for college tuition at ASA schools
- Stake for rewards
- Vote in DAO governance
- Convert to USD/crypto
- Transfer to family

---

#### Feature: Token Utility
**Description:**  
ASA tokens have real utility within the ecosystem.

**Use Cases:**

**1. Pay Tuition:**
- Use ASA tokens to pay for classes
- Accepted at all ASA schools
- 2% burn on payment (deflationary)
- Instant settlement

**2. Staking:**
- Stake tokens for rewards
- APY: 5-10%
- Rewards paid in ASA tokens
- Minimum stake: 100 tokens

**3. Governance:**
- Token holders vote on proposals
- 1 token = 1 vote
- Proposals:
  - New curriculum additions
  - School expansions
  - Platform features
  - Scholarship funds

**4. Alumni Benefits:**
- Special discounts for token holders
- Priority class enrollment
- Exclusive events
- Networking opportunities

**5. Marketplace:**
- Buy school merchandise with tokens
- Purchase additional NFT badges
- Access premium content
- Event tickets

---

## User Workflows

### Parent: Complete Enrollment Journey

**Goal:** Enroll 2 children in summer camps

**Steps:**
1. **Registration:**
   - Visit landing page
   - Click "Register"
   - Enter email, password, name
   - Select school location
   - Enter school code
   - Submit registration
   - Receive welcome email

2. **Add Children:**
   - Log in to parent dashboard
   - Navigate to "My Children"
   - Click "Add Child"
   - Enter child 1 details (Johnny, age 10)
   - Upload photo
   - Save
   - Repeat for child 2 (Emma, age 8)

3. **Browse Classes:**
   - Navigate to "Classes"
   - Filter:
     - Location: Main Campus
     - Age: 8-12
     - Category: STEM
   - View 3 summer camps

4. **Enroll Children:**
   - Select "STEM Summer Camp"
   - Click "Enroll Johnny"
   - Added to cart
   - Continue shopping
   - Select "Arts & Crafts Camp"
   - Click "Enroll Emma"
   - Added to cart

5. **Review Cart:**
   - Click cart icon (badge shows "2")
   - See both enrollments
   - Johnny in STEM Camp: $200 (early bird)
   - Emma in Arts Camp: $150 (early bird)
   - Total: $350

6. **Checkout:**
   - Click "Proceed to Checkout"
   - Redirected to Stripe Checkout
   - Enter payment info
   - Complete payment

7. **Confirmation:**
   - Redirected to success page
   - See confirmed enrollments
   - Receive confirmation email
   - Notifications in dashboard

8. **Ongoing:**
   - View enrollments in dashboard
   - Track class progress
   - Receive updates
   - See invoices

---

### Admin: Create and Promote New Class

**Goal:** Launch new coding class with marketing campaign

**Steps:**
1. **Create Class:**
   - Navigate to "Classes" (admin)
   - Click "Create New Class"
   - Enter details:
     - Name: "Advanced Python for Teens"
     - Description: "College-level Python..."
     - Instructor: "Dr. Emily Chen"
     - Ages: 14-18
     - Capacity: 15
     - Price: $250
     - Early bird: $200 (until Dec 15)
     - Schedule: "Tue/Thu 3-4:30pm"
     - Dates: Jan 15 - May 15
   - Upload class image
   - Publish class

2. **Create Discount:**
   - Open AI Co-Admin
   - Type: "Create early bird discount for Advanced Python"
   - AI creates 20% discount
   - Approve

3. **Generate Marketing Campaign:**
   - Type in AI: "Create marketing campaign for Advanced Python class"
   - AI generates:
     - 3 ad copy variations
     - 2 visual designs
     - Email sequence
     - Social media posts
   - Review and approve
   - Campaign published to Marketing Hub

4. **Notify Parents:**
   - Create announcement notification
   - Target: All parents
   - Message: "New Advanced Python class now open!"
   - Send

5. **Monitor Enrollments:**
   - Check daily brief
   - AI reports: "5 enrollments in first 2 days"
   - AI suggests: "On track to fill. Consider waitlist."

6. **Track Performance:**
   - View class dashboard
   - 10 of 15 spots filled
   - $2,000 revenue
   - Add 5 more students before start date

---

## Administrative Workflows

### School Admin: Monthly Operations

**Typical Monthly Tasks:**

**Week 1: Planning**
1. Review previous month metrics (AI daily brief)
2. Check enrollment trends
3. Plan new classes for next season
4. Review staff feedback

**Week 2: Enrollment Management**
1. Follow up on pending enrollments
2. Send reminders for expiring early bird discounts
3. Process waitlist requests
4. Handle enrollment changes

**Week 3: Marketing**
1. Review marketing piece performance (Marketing Hub)
2. Create new campaigns for upcoming classes
3. Generate referral reports
4. Reward top referring parents

**Week 4: Financial**
1. Process membership renewals
2. Review payment success rate
3. Handle refund requests
4. Generate financial reports
5. Plan next month budget

**Ongoing Daily:**
- Check AI daily brief
- Respond to parent inquiries
- Approve discount requests
- Monitor class capacity
- Review notifications

---

### Educator: Teaching Workflow

**Pre-Class:**
1. Review class roster (student profiles)
2. Check attendance from previous sessions
3. Prepare lesson using AI Lesson Generator
4. Upload materials to knowledge base

**During Class:**
1. Take attendance (mobile app, planned)
2. Deliver lesson
3. Track student participation
4. Note achievements for credit awards

**Post-Class:**
1. Mark attendance
2. Award student achievements:
   - Class participation: $2
   - Helped peer: $2
   - Completed assignment: $5
3. Enter grades/ratings
4. Communicate with parents (if needed)
5. Plan next lesson

**End of Session:**
1. Mark class complete for all students
2. Assign completion ratings:
   - Proficient: $8
   - Mastery: $12
3. Trigger NFT minting
4. Generate report cards
5. Send completion emails

---

**Document Control**
- Document Type: Features and Functionality Guide
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: Product Team
- Approvers: Product Manager, UX Lead
