# ASA Learning Platform — Requirements Overview

This document captures the full scope of what the platform does, who it serves, and what it needs to function. It is intended as the starting point for any rebuild or re-implementation.

---

## 1. What the Platform Is

A **multi-tenant SaaS platform** for homeschool co-ops and learning academies. Each school operates in its own isolated environment within the same system. Schools manage classes, enroll students, collect payments, and communicate with families — all through one platform.

The primary operator is **American Seekers Academy (ASA)**, but the architecture supports any number of schools being managed by a super-administrator.

---

## 2. User Roles

| Role | Description |
|---|---|
| **Super Admin** | Platform operator. Can see and manage all schools, users, and data across the system. |
| **School Admin** | Manages one school. Creates classes, manages enrollments, handles payments, invites staff. |
| **Educator** | A staff member at a school. Manages their assigned classes, attendance, lesson plans, and logs work hours. |
| **Parent** | A family member. Registers children, browses and enrolls in classes, pays tuition, communicates with the school. |
| **Student** | A child account linked to one or more parent/guardian accounts. Enrolled in classes. |

A single user account can hold **multiple roles** and can switch between them in context. A user who is both a parent at one school and an educator at another switches roles dynamically without logging out.

---

## 3. School & Organization Management

- Each school has a **profile**: name, description, logo, contact info, website, and custom branding colors.
- Schools have **physical locations** (address, geolocation for check-in verification).
- Schools can create **categories** to organize their class catalog.
- Schools can define **custom registration forms** for enrollment or onboarding.
- Schools can post **announcements** visible to enrolled families.
- A **school application workflow** allows prospective families to apply for membership before enrollment.
- Schools can set and enforce **annual membership fees** as a prerequisite for enrollment.
- A **membership agreement** system allows schools to require digital acceptance of terms.

---

## 4. Class & Session Management

- School admins create **classes** with: title, description, category, location, age range, capacity, session dates, and pricing.
- A class can have **multiple variants** (e.g., different days, grade levels, or pricing tiers).
- Classes can belong to a **session** (a named time period like "Fall 2025") for organizational grouping.
- Classes can have a **waitlist** with automatic promotion when a spot opens.
- A **schedule builder** tool allows admins to plan and visualize class schedules.
- Classes support a **proration system** for mid-session enrollment: the admin-set price is automatically reduced based on how many sessions have already passed.
- Educators are assigned to classes and have access to **class rosters**.

---

## 5. Student & Family Management

- Parents register **child profiles** with: name, date of birth, grade, photo, and relevant notes.
- A child can have **multiple guardians** linked to their account (multi-guardian system), all with shared access to the child's enrollment and payment data.
- A child can be enrolled across multiple schools.
- Admins can view a **student detail page** showing all enrollments, assessments, and attendance history.
- A **reading assessment tracking system** records McCall-Crabbs format scores, auto-averages grade-level results, and converts to Lexile scores for parent/admin reporting.

---

## 6. Enrollment System

- Parents browse the class catalog and add classes to a **cart**.
- The cart enforces **server-authoritative pricing**: the server calculates all totals, discounts, and payment plans — the client never trusts its own price calculations.
- Enrollment goes through states: `pending_payment` → `enrolled` → `completed` (or `cancelled`, `withdrawn`, `waitlist`, `failed`, `pending_admin_approval`).
- The system **prevents duplicate enrollments** (same child + class + variant).
- Admins can **comp** (forgive) part or all of a remaining enrollment balance, with the comp amount tracked separately from the amount paid.
- Admins can **unenroll** students with or without a refund workflow.
- Admins can view a **parent profile page** showing all enrollments, payments, credits, and membership status for a family in one place.

---

## 7. Payment System

The payment system is Stripe-only. No other payment processor is supported.

### Payment Plans
- **Full payment**: entire balance due at enrollment.
- **Deposit + biweekly**: a deposit up front, then equal installments on a biweekly schedule.
- **Custom**: admin-defined installment schedules.

### Scheduled Payments
- Upcoming installments are stored as **scheduled payment records** with a due date, amount, and enrollment link.
- An **auto-pay scheduler** runs on a background timer and automatically charges scheduled payments when due, using the parent's saved Stripe payment method.
- Auto-pay has 6 safety behaviours: stuck-payment recovery, 3-attempt retry cap, 14-day staleness cutoff, pre-charge notifications with dedup, webhook retry cap, and DB-level due-payment querying.

### Consolidated Payments
- Parents can pay **multiple installments due on the same date** as a single Stripe charge rather than being charged multiple times.

### Cart & Checkout
- The cart supports adding multiple classes across a session.
- Checkout validates **promo codes** server-side.
- **Membership fees** can be bundled into cart checkout.
- Stripe payment methods are saved for auto-pay reuse.
- iOS Safari requires special handling (return_url redirect flow instead of embedded confirmation).

### Payment Records & Audit
- Every payment creates a `payment_history` record.
- Every payment is allocated to specific enrollments via a `payment_allocations` table for full audit trail.
- Membership fee amounts are allocated first when a combined payment includes both membership and tuition.

### Refunds
- Admins can issue full or pro-rated refunds through a structured refund workflow with reason codes.
- Refunds are processed through Stripe and recorded against the original payment.

### Payment Reminders
- Manual and automatic payment reminders are tracked in an audit log visible to school admins.

---

## 8. Credit System

Credits are a first-class currency within the platform — distinct from cash payments but can offset tuition balances.

### Credit Types
- **Volunteer** — earned by volunteering for school events.
- **Referral** — earned when a referred family enrolls.
- **Achievement** — awarded for academic milestones.
- **Marketing** — promotional credits.
- **Manual** — admin-issued for any reason.
- **Fundraiser** — earned through fundraiser sales.

### Credit Rules
- All credits require **admin approval** before they can be used.
- Credits are consumed in **FIFO order** (oldest first).
- Credits can be applied at checkout or used to pay individual scheduled installments.
- Credits can fully or partially cover a payment; Stripe handles any remaining balance.
- A **credit usage log** tracks every application of a credit to an enrollment.

---

## 9. Discount System

The platform supports **19+ discount types** including:
- Early-bird pricing
- Sibling discounts
- Multi-class discounts
- Promo codes (single-use or reusable)
- Staff/educator discounts
- Custom percentage or flat-amount discounts
- School-specific and class-specific discount scoping

All discounts are managed in the database and validated server-side at checkout.

---

## 10. Membership System

- Schools can require families to hold an **active annual membership** before enrolling.
- Membership fees are managed separately from class tuition.
- Membership status (active, expired, grace period) gates enrollment eligibility.
- Membership agreements with digital acceptance are tracked per family.
- Membership fees can be paid through Stripe and are tracked in payment history.

---

## 11. Fundraiser System

- School admins can create **product-based fundraising campaigns** with items and prices.
- Families can place orders through a **fundraiser storefront**.
- Orders are paid through Stripe.
- Fulfilled fundraiser participation earns the family **fundraiser credits** (after admin approval) applicable to tuition.

---

## 12. Attendance & Check-In

- Educators take **attendance** for each class session.
- A **QR code check-in** system allows students to check in via mobile device.
- **Geolocation verification** confirms the student is at the correct physical location.
- **Educator punctuality** is tracked (arrival time vs. class start time).
- Attendance records feed into **student reports** visible to parents and admins.

---

## 13. Educator Tools

- Educators have a dedicated **dashboard** showing their assigned classes.
- They can create and manage **lesson plans** for each class.
- They can record **work hours** for payroll or reimbursement purposes.
- They can view and manage their **class roster** and take attendance.
- Educators are invited to the platform via an **invitation link** generated by a school admin.

---

## 14. Content & Knowledge Management

- Admins can create **knowledge bases** — structured collections of documents, articles, and files associated with a school.
- Files can be uploaded, categorized, and managed through a unified file upload system backed by cloud object storage.
- AI can analyze uploaded content to generate summaries, extract topics, or answer questions based on the knowledge base.
- The **curriculum system** allows schools to define learning tracks and associate content with classes.

---

## 15. AI Features

All AI features use **Anthropic Claude** as the underlying model.

| Feature | Description |
|---|---|
| **Parent AI Concierge** | Default landing page for parents. A conversational assistant that can look up classes, check enrollment status, check payments and credits, search the school knowledge base, add items to cart, and register children — all through natural language. |
| **AI Enrollment Assistant** | Guides parents through the enrollment process step-by-step, answering questions along the way. |
| **AI Payment Help Assistant** | Helps parents understand their payment history, outstanding balances, and payment plan options. |
| **AI Smart Tutorial System** | Provides personalized learning support to students within curriculum content. |
| **AI Schedule Builder** | Assists admins in constructing conflict-free class schedules. |
| **AI Content Generation** | Generates lesson plans, class descriptions, and worksheet content from prompts. |
| **Knowledge Base Analysis** | Analyzes uploaded documents to extract structured information for knowledge base entries. |

The platform degrades gracefully when the AI API is unavailable — all AI features show appropriate fallback states rather than breaking the user experience.

---

## 16. Notification System

- **In-app notifications** with real-time unread count badge.
- Notifications are generated for: payment reminders, enrollment status changes, upcoming class dates, credit approvals, waitlist promotions.
- **Email notifications** via Brevo SMTP or SendGrid.
- **SMS notifications** via Twilio.
- Push notification subscription support (web push).
- Notification delivery is tracked in an audit log.

---

## 17. Reporting & Analytics

- **Financial reports** for school admins: revenue by class, outstanding balances, payment plan summaries.
- **Parent profile view** for admins: complete financial snapshot of a family (total paid, amount due, enrollment list, payment history, credits, membership status).
- **Enrollment analytics**: capacity utilization, waitlist sizes, enrollment trends.
- **Attendance reports**: per-student and per-class attendance rates.
- **Staff hours reports**: educator work hours by period.
- **AI insights dashboard**: AI-generated observations about school performance.

---

## 18. Administrative Tools

- **Data import**: CSV upload for bulk student, class, and payment data.
- **Account import**: bulk creation of parent/student accounts from external records.
- **Payment import**: reconciliation of Stripe payments against enrollment records.
- **Superadmin school management**: create, edit, and manage any school on the platform.
- **Role invitations**: admins invite educators and other admins via tokenized invitation links.
- **Technical support portal**: a channel for users to submit support requests.
- **System error monitoring**: all server errors are logged to the database and trigger admin notifications.
- **Marketing link tracking**: trackable links for enrollment campaigns.

---

## 19. Security & Multi-Tenancy

- **Authentication**: Supabase handles all user identity. No passwords are stored in the application database.
- **Multi-tenant isolation**: every database query is scoped by `schoolId`. An admin can only see data belonging to their school(s). A parent can only see their own family's data.
- **Role-based access control**: every API endpoint checks the authenticated user's role before serving data.
- **Server-authoritative pricing**: all financial calculations happen server-side. Client-provided prices are never trusted.
- **Ownership verification**: before any payment is processed, the server verifies the parent owns the enrolled child.

---

## 20. External Services Required

| Service | Purpose |
|---|---|
| **Supabase** | User authentication, email verification, password reset |
| **Stripe** | Payment processing, saved payment methods, webhooks |
| **Anthropic Claude API** | All AI features |
| **Neon PostgreSQL** | Primary database |
| **Replit Object Storage** | File uploads (documents, images, attachments) |
| **Brevo SMTP** | Transactional email |
| **SendGrid** | Alternative transactional email |
| **Twilio** | SMS notifications |

---

## 21. Non-Functional Requirements

- **Mobile-first**: the parent experience must work well on phones. iOS Safari has known quirks that require specific handling (16px font on inputs, viewport height units, Stripe redirect flow).
- **Performance**: the server must respond to the platform health check within 250ms of startup, even before all routes are loaded.
- **Background jobs**: the platform runs persistent scheduled tasks (auto-pay, reminders, credit expiration). These require a long-running server process — serverless/auto-scaling deployments are incompatible.
- **File storage**: uploaded files must be served via presigned URLs, not publicly accessible paths. Private files must never be accessible without authentication.
- **Audit trail**: all financial transactions, credit applications, refunds, and comps must be traceable to a specific user action with a timestamp.

---

## 22. Scope Summary (by the numbers)

- **75+ API route files**
- **100+ frontend pages and page-level components**
- **50+ database tables**
- **19+ discount types**
- **6+ credit types**
- **7 AI-powered features**
- **5 user roles**
- **6 enrollment statuses**
- **3 payment plan types**
- **6 auto-pay safety behaviours**
