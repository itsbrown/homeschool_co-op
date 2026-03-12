# Product Requirements Document
## ASA Learning Platform
**Version**: 1.0  
**Last Updated**: March 2026  
**Status**: Active Production System

---

## 1. Product Vision

The ASA Learning Platform is a multi-tenant SaaS application that gives homeschool co-ops and learning academies a complete operational system — from class creation and enrollment to tuition collection and student progress tracking — under a single login. Each school operates in its own isolated environment while the platform operator (American Seekers Academy) manages the whole ecosystem from one superadmin interface.

**Core promise to school admins**: Run your entire school — scheduling, enrollment, payments, staff, and communications — without stitching together separate tools.

**Core promise to parents**: One place to browse classes, enroll children, pay tuition, track progress, and get answers.

---

## 2. Users & Personas

### 2.1 Super Administrator
The platform operator. Typically one person or a small internal team at ASA.

**Needs**:
- Create and configure schools on the platform
- Monitor all schools' activity and financials
- Resolve cross-school issues and access any record
- Import bulk data from legacy systems

**Pain points without this product**: Managing multiple schools across spreadsheets and email chains with no central view.

---

### 2.2 School Administrator
Runs day-to-day operations at one school. May manage a co-op of 20 families or an academy of 200.

**Needs**:
- Create and publish classes with flexible pricing
- Track who is enrolled, who has paid, and who owes money
- Issue refunds, comps, and payment adjustments
- Manage staff and educator assignments
- Communicate with families through the platform
- Run fundraisers
- See financial summaries at a glance

**Pain points without this product**: Collecting payments via Venmo/Zelle with no audit trail, manually tracking enrollment spreadsheets, no way to enforce membership fees, no automated payment reminders.

---

### 2.3 Educator
A teacher or instructor assigned to one or more classes at a school.

**Needs**:
- See their class schedule and roster
- Take attendance each session
- Create and manage lesson plans
- Log their work hours
- Access student information relevant to their class

**Pain points without this product**: Receiving rosters by email, no record of attendance, no structured lesson plan storage.

---

### 2.4 Parent / Guardian
A family member with one or more children enrolled (or seeking enrollment) at a school.

**Needs**:
- Browse available classes and understand pricing
- Enroll children without friction
- Pay tuition in a plan that fits their budget
- See what is owed and what has been paid
- Track children's attendance and assessments
- Get answers to questions without waiting for a human response
- Manage multiple guardians on a single family account

**Pain points without this product**: Emailing the school to find out what classes are available, paying via check with no record, no visibility into their own enrollment or payment history.

---

### 2.5 Student
A child with an account linked to their parent(s).

**Needs**:
- Access curriculum content for their enrolled classes
- Receive AI tutoring support
- Have their attendance and assessments tracked over time

---

## 3. Feature Requirements

---

### F-01: Authentication & Account Management

| ID | Requirement |
|---|---|
| F-01-01 | Users register and log in via email/password through Supabase authentication. No passwords are stored in the application database. |
| F-01-02 | Email verification is required before accessing the platform. |
| F-01-03 | Password reset flow is available via email link. |
| F-01-04 | A single user account may hold multiple roles (e.g., parent at one school and educator at another). |
| F-01-05 | Users switch active roles from a role-selection screen without logging out. Role context determines what data and menus are visible. |
| F-01-06 | All API endpoints verify the authenticated user's role before serving data. |
| F-01-07 | The server maps the Supabase user UUID to an integer ID for all internal database relationships. |

---

### F-02: Multi-Tenancy & School Isolation

| ID | Requirement |
|---|---|
| F-02-01 | Every piece of data (enrollments, payments, users, classes) is scoped to a `schoolId`. |
| F-02-02 | A school admin can only read and write data belonging to their school. |
| F-02-03 | A parent can only read their own family's data. |
| F-02-04 | Super admins bypass school-level isolation and can access all records. |
| F-02-05 | Cross-school data leakage must be impossible at the API layer, not just the UI layer. |

---

### F-03: School Configuration

| ID | Requirement |
|---|---|
| F-03-01 | Each school has a profile: name, description, logo, contact info, website URL. |
| F-03-02 | Schools define their own category taxonomy for organizing classes. |
| F-03-03 | Schools manage one or more physical locations with address and geolocation. |
| F-03-04 | Schools can configure annual membership fees that gate enrollment eligibility. |
| F-03-05 | Schools can require families to digitally accept a membership agreement before enrolling. |
| F-03-06 | Schools can build custom registration forms for enrollment or onboarding. |
| F-03-07 | Schools can post announcements visible to their enrolled families. |
| F-03-08 | School branding (colors, logo) is applied throughout the school-facing UI. |

---

### F-04: Class Management

| ID | Requirement |
|---|---|
| F-04-01 | School admins create classes with: title, description, category, location, age range, capacity, session dates, and base price. |
| F-04-02 | A class can have multiple pricing variants (e.g., different days or grade levels), each with its own price and capacity. |
| F-04-03 | Classes belong to a named session (e.g., "Spring 2026") for organizational grouping. |
| F-04-04 | Classes have a maximum capacity. Enrollment attempts beyond capacity are placed on a waitlist. |
| F-04-05 | When an enrolled student withdraws, the next student on the waitlist is automatically promoted and notified. |
| F-04-06 | Classes can be associated with a curriculum track. |
| F-04-07 | A schedule builder tool allows admins to visualize and manage class schedules to prevent conflicts. |
| F-04-08 | Educators are assigned to classes and can view their assigned classes from their dashboard. |

---

### F-05: Enrollment

| ID | Requirement |
|---|---|
| F-05-01 | Parents browse a class catalog and add classes to a cart. |
| F-05-02 | The system prevents duplicate enrollment (same child, class, and variant). |
| F-05-03 | Enrollment goes through defined states: `pending_payment` → `enrolled` → `completed`. Additional states: `cancelled`, `withdrawn`, `waitlist`, `failed`, `pending_admin_approval`. |
| F-05-04 | All cart pricing — including discounts, payment plans, and fees — is calculated server-side. The client never calculates a final price. |
| F-05-05 | Promo codes are validated server-side at checkout, not client-side. |
| F-05-06 | A **proration system** automatically reduces the enrollment cost for mid-session enrollments based on how many sessions have already occurred. |
| F-05-07 | Admins can enroll a student on behalf of a family (admin-side enrollment). |
| F-05-08 | Admins can **comp** (forgive) part or all of a remaining enrollment balance with a reason recorded. The comp tracks: original balance, comp percentage, comp amount in cents, and admin who approved it. |
| F-05-09 | Admins can cancel an enrollment with or without triggering a refund. |
| F-05-10 | The parent's enrollment view shows: class name, enrollment status, total cost, amount paid, and remaining balance — all computed server-side. |

---

### F-06: Payment Processing

| ID | Requirement |
|---|---|
| F-06-01 | All payments are processed through Stripe. No other payment processor is supported. |
| F-06-02 | Three payment plan types are available: **Full** (entire balance at checkout), **Deposit + Biweekly** (deposit upfront, remaining split into equal biweekly installments), and **Custom** (admin-defined schedule). |
| F-06-03 | Stripe payment methods (cards) are saved to the parent's Stripe customer profile for future auto-pay charges. |
| F-06-04 | Upcoming installments are stored as `scheduled_payment` records with a due date, amount, enrollment link, and status. |
| F-06-05 | Parents can view all upcoming scheduled payments grouped by due date. |
| F-06-06 | Parents can pay multiple installments due on the same date as a single combined Stripe charge ("consolidated family payment"). |
| F-06-07 | Every payment creates a `payment_history` record. Every payment is allocated to specific enrollments via a `payment_allocations` table for a full audit trail. |
| F-06-08 | Membership fees are allocated from a combined payment before tuition installments. |
| F-06-09 | The server verifies all Stripe payments server-side before updating enrollment records. The client never directly updates financial fields. |
| F-06-10 | iOS Safari requires a redirect-based payment flow (return_url) rather than the embedded confirmation flow used on desktop. |

---

### F-07: Auto-Pay Scheduler

| ID | Requirement |
|---|---|
| F-07-01 | A background scheduler runs on a timer and automatically charges due scheduled payments using the parent's saved Stripe payment method. |
| F-07-02 | Only payments with a due date within the past 14 days are considered (staleness cutoff prevents charging very old missed payments). |
| F-07-03 | Auto-pay retries failed charges up to 3 times total (retry cap). Payments exceeding 3 attempts are marked failed and require manual intervention. |
| F-07-04 | If a payment is stuck in `processing` state (no Stripe confirmation received), the scheduler reconciles with Stripe and either marks it completed or resets it to pending. |
| F-07-05 | Pre-charge notifications (in-app and email) are sent before auto-pay runs, with a 20-hour deduplication window to prevent duplicate notifications. |
| F-07-06 | The scheduler verifies the enrollment balance before charging — if the balance is already zero, the charge is skipped. |
| F-07-07 | The auto-pay scheduler requires a persistent long-running server process. Serverless or auto-scaling deployments are incompatible. |

---

### F-08: Refunds

| ID | Requirement |
|---|---|
| F-08-01 | Admins can issue full or pro-rated refunds through a structured workflow. |
| F-08-02 | Refunds require a structured reason code selection. |
| F-08-03 | Refunds are processed through Stripe and recorded against the original payment in `payment_history`. |
| F-08-04 | A pro-rated refund calculator shows the admin exactly how much would be refunded before they confirm. |

---

### F-09: Credit System

| ID | Requirement |
|---|---|
| F-09-01 | Credits are a platform currency that offset tuition balances. They are separate from cash payments. |
| F-09-02 | Six credit types exist: Volunteer, Referral, Achievement, Marketing, Manual, and Fundraiser. |
| F-09-03 | All credits require admin approval before they can be used by the parent. |
| F-09-04 | Credits are consumed in FIFO order (oldest approved credits are used first). |
| F-09-05 | Credits can be applied at checkout to reduce the Stripe charge amount. |
| F-09-06 | Credits can fully cover a scheduled installment (no Stripe charge required) or partially cover it (Stripe handles the remainder). |
| F-09-07 | Every credit application to an enrollment is recorded in a `credit_usage_log` table. |
| F-09-08 | Parents can view their credit balance and usage history. |

---

### F-10: Discount System

| ID | Requirement |
|---|---|
| F-10-01 | The platform supports 19+ discount types including: early-bird, sibling, multi-class, promo codes (single-use and reusable), staff/educator, and custom percentage or flat-amount discounts. |
| F-10-02 | Discounts can be scoped to a specific school, class, category, or applied platform-wide. |
| F-10-03 | All discounts are validated and applied server-side at checkout. |
| F-10-04 | Promo codes have configurable usage limits, expiry dates, and eligibility rules. |

---

### F-11: Membership System

| ID | Requirement |
|---|---|
| F-11-01 | Schools can require families to hold an active annual membership before enrolling in classes. |
| F-11-02 | Membership fees are paid through Stripe and tracked separately from tuition. |
| F-11-03 | Membership status transitions: active → expired → grace period. |
| F-11-04 | Families in the grace period may still enroll but are notified of the expiry. |
| F-11-05 | Membership agreements (digital terms of service) can be required per school. Acceptance is recorded with timestamp. |
| F-11-06 | A school application workflow allows prospective families to apply for membership before gaining enrollment access. |

---

### F-12: Family & Student Management

| ID | Requirement |
|---|---|
| F-12-01 | Parents register child profiles with: first name, last name, date of birth, grade level, photo, and notes. |
| F-12-02 | Multiple guardians can be linked to a single child account. All guardians have shared visibility into the child's enrollment, payments, and attendance. |
| F-12-03 | A child can be enrolled at multiple schools simultaneously. |
| F-12-04 | Admins have a **parent profile page** that shows a complete family snapshot: children, enrollments, payment history, outstanding balance, credits, and membership status. |
| F-12-05 | Emergency contacts are stored per child and accessible to school admins. |

---

### F-13: Attendance & Check-In

| ID | Requirement |
|---|---|
| F-13-01 | Educators take attendance for each class session, marking each student present, absent, or late. |
| F-13-02 | A QR code check-in system allows students to check in via mobile device by scanning a class-specific QR code. |
| F-13-03 | Geolocation verification confirms the student is physically at the correct location before accepting a check-in. |
| F-13-04 | Educator punctuality is tracked by recording the educator's arrival time relative to class start time. |
| F-13-05 | Attendance records are visible to parents (for their children) and admins (for all students). |

---

### F-14: Assessments & Progress Tracking

| ID | Requirement |
|---|---|
| F-14-01 | Reading assessment scores are recorded in McCall-Crabbs format. |
| F-14-02 | The system automatically averages multiple grade-level scores and converts the result to a Lexile score. |
| F-14-03 | Assessment history is visible to parents and school admins. |
| F-14-04 | Assessment reports can be generated per student. |

---

### F-15: Educator Tools

| ID | Requirement |
|---|---|
| F-15-01 | Educators have a dashboard showing all their assigned classes with schedule, roster, and status. |
| F-15-02 | Educators can create structured lesson plans associated with each class session. |
| F-15-03 | Educators log work hours through the platform for payroll or reimbursement tracking. |
| F-15-04 | School admins invite educators via a tokenized invitation link. The educator accepts and creates their account through the invite flow. |
| F-15-05 | School admins can view and manage all staff, their assigned classes, and logged hours. |

---

### F-16: Content & Knowledge Management

| ID | Requirement |
|---|---|
| F-16-01 | Admins can create **knowledge bases** — structured collections of documents, articles, and files — associated with their school. |
| F-16-02 | Files can be uploaded through a unified upload interface backed by cloud object storage (Replit App Storage). |
| F-16-03 | Uploaded files are served via presigned URLs. Private files are never directly accessible without authentication. |
| F-16-04 | File categories are enforced with type-based validation (e.g., only PDFs for certain categories). |
| F-16-05 | AI can analyze uploaded documents to extract structured information and generate knowledge base entries. |
| F-16-06 | A curriculum system allows schools to define learning tracks and associate content with classes. |

---

### F-17: Fundraiser System

| ID | Requirement |
|---|---|
| F-17-01 | School admins create product-based fundraising campaigns with a catalog of items and prices. |
| F-17-02 | Families access a fundraiser storefront and place orders. |
| F-17-03 | Orders are paid through Stripe. |
| F-17-04 | Fulfilled fundraiser participation earns the family **fundraiser credits** (pending admin approval) which can be applied to tuition. |
| F-17-05 | Admins manage and approve credit awards from fundraiser participation. |

---

### F-18: AI Features

| ID | Feature | Requirement |
|---|---|---|
| F-18-01 | **Parent AI Concierge** | Default landing page for parents. A Claude-powered conversational assistant that can: look up classes, check enrollment status, check payment and credit balances, search the school knowledge base, add items to cart, and register children — through natural language. |
| F-18-02 | **AI Enrollment Assistant** | Step-by-step guided enrollment flow with AI answering questions along the way. |
| F-18-03 | **AI Payment Help** | Conversational help for parents understanding payment history, outstanding balances, and plan options. |
| F-18-04 | **AI Smart Tutorial** | Personalized learning support for students within curriculum content. |
| F-18-05 | **AI Schedule Builder** | Assists admins in constructing conflict-free class schedules. |
| F-18-06 | **AI Content Generation** | Generates lesson plans, class descriptions, and worksheet content from prompts. |
| F-18-07 | **Knowledge Base Analysis** | Analyzes uploaded documents to produce structured knowledge base entries. |
| F-18-08 | **Graceful degradation** | All AI features display an appropriate fallback state (not a broken page) when the AI API is unavailable. |

All AI features use Anthropic Claude. The Parent AI Concierge uses Claude's tool-use API to take real actions within the platform (not just answer questions).

---

### F-19: Notifications

| ID | Requirement |
|---|---|
| F-19-01 | In-app notifications with a real-time unread count badge are available to all users. |
| F-19-02 | Notifications are generated for: payment reminders, enrollment status changes, upcoming class dates, credit approvals, waitlist promotions, and admin-issued announcements. |
| F-19-03 | Email notifications are sent via Brevo SMTP or SendGrid (configurable). |
| F-19-04 | SMS notifications are sent via Twilio for high-priority events (payment failures, same-day reminders). |
| F-19-05 | Web push notification subscriptions are supported. |
| F-19-06 | Notification delivery is tracked in an audit log visible to admins. |
| F-19-07 | Payment reminder notifications deduplicate within a 20-hour window to prevent spamming. |

---

### F-20: Reporting & Analytics

| ID | Requirement |
|---|---|
| F-20-01 | School admins see a financial dashboard: total revenue, outstanding balances, payment plan breakdowns. |
| F-20-02 | The parent profile admin view shows a complete family financial snapshot in one screen. |
| F-20-03 | Enrollment analytics show capacity utilization and waitlist sizes per class. |
| F-20-04 | Attendance reports show per-student and per-class rates. |
| F-20-05 | Staff hours reports show educator logged hours by period. |
| F-20-06 | An AI insights dashboard surfaces AI-generated observations about school trends. |

---

### F-21: Admin & Operations Tools

| ID | Requirement |
|---|---|
| F-21-01 | CSV data import for bulk creation of students, classes, and payment records. |
| F-21-02 | Stripe payment import to reconcile historical Stripe transactions against enrollment records. |
| F-21-03 | Role invitation system — admins generate tokenized invitation links for educators and other admins. |
| F-21-04 | System error monitoring — all server errors are logged to the database and trigger admin notifications. |
| F-21-05 | Marketing link tracking — trackable URLs for enrollment campaigns with click and conversion data. |
| F-21-06 | A technical support channel where users can submit support requests within the platform. |
| F-21-07 | Super admins can create, configure, and manage any school on the platform. |

---

## 4. Non-Functional Requirements

### 4.1 Performance
- The server must pass a health check at `GET /` within **250ms of startup**, even before all routes have loaded. Heavy initialization (routers, schedulers) loads asynchronously in the background.
- API responses for standard data queries should return within **500ms** under normal load.

### 4.2 Availability & Infrastructure
- The platform requires a **persistent long-running server** (Reserved VM or equivalent). Serverless/auto-scaling deployments are incompatible because the platform runs persistent background schedulers, uses WebSocket connections, and maintains in-memory state.
- Background jobs (auto-pay, reminders, credit expiration, payment reconciliation) must run on a fixed schedule independent of incoming requests.

### 4.3 Security
- No passwords are stored in the application database. Supabase owns all authentication credentials.
- All financial calculations are server-authoritative. Client-provided price data is never trusted.
- File downloads use short-lived presigned URLs. Private files are never exposed via public paths.
- Multi-tenant isolation is enforced at the API layer on every query — not just in the UI.
- Ownership is verified before any payment: the server confirms the parent owns the enrolled child before processing a charge.

### 4.4 Mobile Compatibility
- The parent experience must be fully functional on iOS Safari on iPhone.
- Input fields must render at 16px minimum font size to prevent iOS auto-zoom.
- Stripe payment confirmation must use a redirect-based flow on iOS (return_url) rather than the embedded modal used on desktop.
- Viewport height must use `100dvh` or `100svh` units to handle the iOS browser chrome correctly.

### 4.5 Data Integrity
- All financial transactions, credit applications, refunds, and comps must have an audit trail traceable to a specific user with a timestamp.
- Enrollment financial fields (`totalPaid`, `remainingBalance`) are the single source of truth for display. Stripe is the source of truth for whether a charge succeeded — but the enrollment record is updated only after server-side verification.
- The `payment_allocations` table provides a complete disbursement record showing exactly which enrollment received what portion of every payment.

---

## 5. External Service Dependencies

| Service | Role | Required |
|---|---|---|
| **Supabase** | User authentication, email verification, password reset | Yes |
| **Stripe** | Payment processing, saved payment methods, webhooks | Yes |
| **Anthropic Claude** | All AI features | Yes (platform degrades gracefully without it) |
| **Neon PostgreSQL** | Primary database | Yes |
| **Replit Object Storage** | File uploads (documents, images, attachments) | Yes |
| **Brevo SMTP** | Transactional email (primary) | Yes |
| **SendGrid** | Transactional email (secondary/fallback) | Optional |
| **Twilio** | SMS notifications | Optional |

---

## 6. Out of Scope

The following are explicitly not supported and would require new design work to add:

- **Multiple payment processors**: Stripe only. PayPal, Square, ACH, or check payments are not supported.
- **Native mobile apps**: The platform is a responsive web app. There are no iOS or Android apps.
- **Real-time video/conferencing**: No built-in video class capability.
- **Student-to-student social features**: No messaging, forums, or social feeds between students.
- **Marketplace between schools**: Classes are listed per-school. There is no cross-school class discovery for parents (except where super admins configure it).
- **Automated grade reporting**: Grades are not formally tracked beyond reading assessment scores.
- **Third-party LMS integrations**: No Canvas, Google Classroom, or similar integrations.

---

## 7. Glossary

| Term | Definition |
|---|---|
| **Comp** | An admin action that forgives part or all of a remaining enrollment balance. The forgiven amount is tracked separately from cash payments. |
| **Scheduled Payment** | A future installment stored in the database with a due date and amount, tied to an enrollment. |
| **Auto-Pay** | The background scheduler that charges due scheduled payments automatically using a saved Stripe payment method. |
| **Consolidated Payment** | A single Stripe charge that covers multiple installments due on the same date. |
| **Credit** | A platform-internal currency earned through activities (volunteering, referrals, fundraising) that can offset tuition payments. |
| **Proration** | Automatic reduction of enrollment cost when a student joins a class mid-session. |
| **Effective Balance** | The true amount a family owes after accounting for cash paid, credits applied, and any comp. Computed as: `totalCost − totalPaid − compAmountCents`. |
| **School Session** | A named time period (e.g., "Spring 2026") used to group classes for organizational purposes. |
| **Variant** | A pricing or scheduling tier within a single class (e.g., "Monday/Wednesday" vs "Tuesday/Thursday"). |
| **Multi-tenant** | A software architecture where multiple organizations (schools) share the same application and database, each with isolated data. |
