# ASA Learning Platform - Data Models Documentation

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Status:** Active Development

---

## Table of Contents
1. [Overview](#overview)
2. [Current Database Schema](#current-database-schema)
3. [Planned Database Schema (Phases 1-3)](#planned-database-schema-phases-1-3)
4. [Entity Relationship Diagrams](#entity-relationship-diagrams)
5. [Data Types & Constraints](#data-types--constraints)
6. [Migration Strategy](#migration-strategy)
7. [Indexes & Performance](#indexes--performance)
8. [Data Integrity Rules](#data-integrity-rules)

---

## Overview

### Database System
- **Database:** PostgreSQL 15+
- **ORM:** Drizzle ORM
- **Schema Location:** `shared/schema.ts`
- **Migration Tool:** Drizzle Kit
- **Hosting:** Neon (serverless PostgreSQL)

### Design Principles
1. **Database as Source of Truth** - All application state in PostgreSQL
2. **Type Safety** - Drizzle schema provides TypeScript types
3. **Referential Integrity** - Foreign keys enforce relationships
4. **Multi-Tenant Isolation** - School ID filtering for data separation
5. **Audit Trails** - Timestamps on all tables
6. **Normalization** - Third normal form (3NF) where practical

---

## Current Database Schema

### Core Tables

#### users
Primary user account table for all platform users.

```typescript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  supabaseId: varchar('supabase_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  role: varchar('role', { length: 50 }).notNull().default('parent'),
  activeRole: varchar('active_role', { length: 50 }),
  profileImage: varchar('profile_image', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 20 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  country: varchar('country', { length: 100 }).default('USA'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Has many: `user_roles`, `user_locations`, `children`, `notifications`, `credit_ledger` (planned)
- Referenced by: Most tables via `user_id` or `created_by_user_id`

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `supabase_id`
- UNIQUE on `email`
- INDEX on `role`

**Sample Data:**
```json
{
  "id": 1,
  "supabaseId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "parent@example.com",
  "name": "Jane Smith",
  "role": "parent",
  "activeRole": "parent",
  "phoneNumber": "+1234567890",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

---

#### schools
School/organization accounts.

```typescript
export const schools = pgTable('schools', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).unique(),
  logo: varchar('logo', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  country: varchar('country', { length: 100 }).default('USA'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  email: varchar('email', { length: 255 }),
  website: varchar('website', { length: 255 }),
  membershipFee: numeric('membership_fee', { precision: 10, scale: 2 }),
  membershipRenewalDate: date('membership_renewal_date'),
  membershipGracePeriod: integer('membership_grace_period').default(30),
  membershipRequired: boolean('membership_required').default(false),
  timezone: varchar('timezone', { length: 100 }).default('America/New_York'),
  academicYearStart: date('academic_year_start'),
  academicYearEnd: date('academic_year_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Has many: `user_roles`, `classes`, `locations`, `categories`, `membership_enrollments`
- Referenced by: Most school-scoped tables

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `domain`
- INDEX on `name`

---

#### user_roles
Junction table for multi-role support. Users can have different roles at different schools.

```typescript
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(), // 'parent', 'educator', 'schoolAdmin'
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users`, `schools`

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `(user_id, school_id, role)`
- INDEX on `user_id`
- INDEX on `school_id`

---

#### locations
Physical locations for multi-location schools.

```typescript
export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  phoneNumber: varchar('phone_number', { length: 20 }),
  capacity: integer('capacity'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `schools`
- Has many: `classes`, `user_locations`

---

#### children
Student records.

```typescript
export const children = pgTable('children', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  gradeLevel: varchar('grade_level', { length: 50 }),
  gender: varchar('gender', { length: 20 }),
  allergies: text('allergies'),
  medicalInfo: text('medical_info'),
  emergencyContact: varchar('emergency_contact', { length: 255 }),
  emergencyPhone: varchar('emergency_phone', { length: 20 }),
  interests: text('interests').array(),
  learningStyle: varchar('learning_style', { length: 100 }),
  profileImage: varchar('profile_image', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users` (as parent)
- Has many: `enrollments`, `student_achievements` (planned), `student_credits` (planned)

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `parent_id`
- INDEX on `(last_name, first_name)`

---

#### categories
Custom class categories per school.

```typescript
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 50 }), // Hex color code
  icon: varchar('icon', { length: 100 }),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `schools`
- Has many: `classes`

---

#### classes
Class offerings.

```typescript
export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  instructorName: varchar('instructor_name', { length: 255 }),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  gradeMin: varchar('grade_min', { length: 50 }),
  gradeMax: varchar('grade_max', { length: 50 }),
  capacity: integer('capacity'),
  currentEnrollment: integer('current_enrollment').default(0),
  price: numeric('price', { precision: 10, scale: 2 }),
  earlyBirdPrice: numeric('early_bird_price', { precision: 10, scale: 2 }),
  earlyBirdDeadline: timestamp('early_bird_deadline'),
  lateFee: numeric('late_fee', { precision: 10, scale: 2 }),
  lateRegistrationStart: timestamp('late_registration_start'),
  schedule: text('schedule'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  registrationDeadline: timestamp('registration_deadline'),
  prerequisites: text('prerequisites'),
  materials: text('materials'),
  imageUrl: varchar('image_url', { length: 255 }),
  status: varchar('status', { length: 50 }).default('draft'), // draft, active, full, archived
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `schools`, `locations`, `categories`
- Has many: `enrollments`, `marketing_pieces` (planned)

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `school_id`
- INDEX on `location_id`
- INDEX on `category_id`
- INDEX on `status`
- INDEX on `(school_id, status)` (composite for common queries)

---

#### enrollments
Student enrollments in classes.

```typescript
export const enrollments = pgTable('enrollments', {
  id: serial('id').primaryKey(),
  childId: integer('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).default('pending'), // pending, confirmed, cancelled, completed
  pricePaid: numeric('price_paid', { precision: 10, scale: 2 }),
  priceVariant: varchar('price_variant', { length: 50 }), // 'regular', 'early_bird', 'late'
  paymentStatus: varchar('payment_status', { length: 50 }).default('pending'), // pending, paid, refunded
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  completionRating: varchar('completion_rating', { length: 50 }), // 'proficient', 'mastery', 'incomplete'
  notes: text('notes'),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `children`, `classes`, `users` (parent), `schools`

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `child_id`
- INDEX on `class_id`
- INDEX on `parent_id`
- INDEX on `school_id`
- INDEX on `status`
- INDEX on `(child_id, status)` (composite)

---

#### membership_enrollments
Annual membership tracking.

```typescript
export const membershipEnrollments = pgTable('membership_enrollments', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  membershipYear: varchar('membership_year', { length: 10 }).notNull(), // '2025-2026'
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  remainingBalance: numeric('remaining_balance', { precision: 10, scale: 2 }),
  dueDate: date('due_date'),
  expirationDate: date('expiration_date'),
  gracePeriodEnd: date('grace_period_end'),
  paymentDate: date('payment_date'),
  status: varchar('status', { length: 50 }).default('pending'), // pending, active, expired, waived
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users` (parent), `schools`

---

#### notifications
In-app notification system.

```typescript
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  schoolId: integer('school_id').references(() => schools.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).default('info'), // info, success, warning, error
  priority: varchar('priority', { length: 50 }).default('normal'), // low, normal, high
  isRead: boolean('is_read').default(false),
  actionUrl: varchar('action_url', { length: 255 }),
  actionLabel: varchar('action_label', { length: 100 }),
  metadata: jsonb('metadata'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  readAt: timestamp('read_at'),
});
```

**Relationships:**
- Belongs to: `users`, `schools`

---

#### knowledge_bases
Content management system.

```typescript
export const knowledgeBases = pgTable('knowledge_bases', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  content: text('content'),
  category: varchar('category', { length: 100 }),
  tags: text('tags').array(),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).default('draft'), // draft, published, archived
  viewCount: integer('view_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `schools`, `users` (creator)
- Has many: `knowledge_base_files`

---

#### knowledge_base_files
File uploads for knowledge bases.

```typescript
export const knowledgeBaseFiles = pgTable('knowledge_base_files', {
  id: serial('id').primaryKey(),
  knowledgeBaseId: integer('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'), // bytes
  filePath: varchar('file_path', { length: 500 }).notNull(),
  uploadedByUserId: integer('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `knowledge_bases`, `users` (uploader)

---

## Planned Database Schema (Phases 1-3)

### Phase 1: Credit System Tables

#### credit_ledger
Detailed log of all credit-earning actions.

```typescript
export const creditLedger = pgTable('credit_ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actionType: varchar('action_type', { length: 100 }).notNull(), // 'share', 'referral', 'comment', etc.
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  sourceId: varchar('source_id', { length: 255 }), // Tracking reference
  relatedEntityType: varchar('related_entity_type', { length: 100 }), // 'marketing_piece', 'user', 'enrollment'
  relatedEntityId: integer('related_entity_id'),
  status: varchar('status', { length: 50 }).default('pending'), // pending, confirmed, reversed
  metadata: jsonb('metadata'), // Additional context
  createdAt: timestamp('created_at').defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at'),
});
```

**Relationships:**
- Belongs to: `users`
- Polymorphic relationships via `relatedEntityType` and `relatedEntityId`

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `user_id`
- INDEX on `action_type`
- INDEX on `status`
- INDEX on `created_at`
- INDEX on `(user_id, status)` (composite)

**Sample Data:**
```json
{
  "id": 1,
  "userId": 5,
  "actionType": "referral_registration",
  "amount": 20.00,
  "sourceId": "ABC123",
  "relatedEntityType": "user",
  "relatedEntityId": 42,
  "status": "confirmed",
  "metadata": {
    "referralCode": "ABC123",
    "refereeEmail": "friend@example.com"
  },
  "createdAt": "2025-11-20T10:00:00Z",
  "confirmedAt": "2025-11-27T10:00:00Z"
}
```

---

#### user_credits
Aggregated credit balance per user.

```typescript
export const userCredits = pgTable('user_credits', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  availableBalance: numeric('available_balance', { precision: 10, scale: 2 }).default('0'),
  pendingBalance: numeric('pending_balance', { precision: 10, scale: 2 }).default('0'),
  lifetimeEarned: numeric('lifetime_earned', { precision: 10, scale: 2 }).default('0'),
  lifetimeRedeemed: numeric('lifetime_redeemed', { precision: 10, scale: 2 }).default('0'),
  tierLevel: varchar('tier_level', { length: 50 }).default('bronze'), // bronze, silver, gold, platinum
  tierMultiplier: numeric('tier_multiplier', { precision: 3, scale: 2 }).default('1.00'),
  lastTierUpdate: timestamp('last_tier_update'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users` (one-to-one)

**Indexes:**
- PRIMARY KEY on `user_id`
- INDEX on `tier_level`
- INDEX on `available_balance` (for leaderboards)

---

#### referral_tracking
Track referral links and conversions.

```typescript
export const referralTracking = pgTable('referral_tracking', {
  id: serial('id').primaryKey(),
  referrerUserId: integer('referrer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refereeUserId: integer('referee_user_id').references(() => users.id, { onDelete: 'set null' }),
  trackingCode: varchar('tracking_code', { length: 50 }).notNull().unique(),
  sourceChannel: varchar('source_channel', { length: 100 }), // 'facebook', 'instagram', 'email'
  marketingPieceId: integer('marketing_piece_id').references(() => marketingPieces.id, { onDelete: 'set null' }),
  clickCount: integer('click_count').default(0),
  conversionType: varchar('conversion_type', { length: 100 }), // 'registration', 'enrollment', 'membership'
  conversionValue: numeric('conversion_value', { precision: 10, scale: 2 }),
  convertedAt: timestamp('converted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users` (referrer, referee), `marketing_pieces`

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `tracking_code`
- INDEX on `referrer_user_id`
- INDEX on `referee_user_id`
- INDEX on `conversion_type`

---

#### marketing_pieces
AI-generated marketing content.

```typescript
export const marketingPieces = pgTable('marketing_pieces', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  pieceType: varchar('piece_type', { length: 100 }).notNull(), // 'ad', 'campaign', 'announcement'
  targetClassId: integer('target_class_id').references(() => classes.id, { onDelete: 'set null' }),
  imageUrl: varchar('image_url', { length: 500 }),
  content: text('content'),
  trackingBaseUrl: varchar('tracking_base_url', { length: 500 }),
  aiGenerated: boolean('ai_generated').default(false),
  generationMetadata: jsonb('generation_metadata'), // AI model, prompt, etc.
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).default('draft'), // draft, active, archived
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `schools`, `classes`, `users` (creator)
- Has many: `referral_tracking`

---

#### credit_transactions
Audit trail of credit movements.

```typescript
export const creditTransactions = pgTable('credit_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  transactionType: varchar('transaction_type', { length: 50 }).notNull(), // 'earn', 'redeem', 'transfer', 'bonus'
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  balanceBefore: numeric('balance_before', { precision: 10, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 10, scale: 2 }).notNull(),
  description: text('description'),
  relatedLedgerId: integer('related_ledger_id').references(() => creditLedger.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users`, `credit_ledger`

---

### Phase 2: AI Co-Admin & Student Credits Tables

#### ai_conversations
AI Co-Admin conversation sessions.

```typescript
export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  context: jsonb('context'), // Conversation state
  intent: varchar('intent', { length: 255 }), // Detected user intent
  status: varchar('status', { length: 50 }).default('active'), // active, completed, abandoned
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users`
- Has many: `ai_conversation_messages`, `ai_tasks`

---

#### ai_conversation_messages
Individual messages in AI conversations.

```typescript
export const aiConversationMessages = pgTable('ai_conversation_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(), // 'user', 'assistant', 'system'
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // Tokens used, model, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `ai_conversations`

---

#### ai_tasks
Tasks generated by AI Co-Admin.

```typescript
export const aiTasks = pgTable('ai_tasks', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  taskType: varchar('task_type', { length: 100 }).notNull(), // 'create_discount', 'generate_ad', 'send_email'
  description: text('description'),
  parameters: jsonb('parameters'), // Task-specific data
  status: varchar('status', { length: 50 }).default('pending_approval'), // pending_approval, approved, executing, completed, failed
  approvalRequired: boolean('approval_required').default(true),
  approvedByUserId: integer('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at'),
  result: jsonb('result'), // Execution output
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
```

**Relationships:**
- Belongs to: `ai_conversations`, `users` (approver)

---

#### ai_insights
Proactive insights generated by AI.

```typescript
export const aiInsights = pgTable('ai_insights', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  insightType: varchar('insight_type', { length: 100 }).notNull(), // 'opportunity', 'warning', 'recommendation'
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  severity: varchar('severity', { length: 50 }).default('medium'), // low, medium, high, critical
  actionable: boolean('actionable').default(true),
  suggestedActions: jsonb('suggested_actions'),
  affectedEntities: jsonb('affected_entities'), // Related classes, users, etc.
  status: varchar('status', { length: 50 }).default('new'), // new, acknowledged, acted_on, dismissed
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});
```

**Relationships:**
- Belongs to: `schools`

---

#### student_credits
Student credit balances (locked until graduation).

```typescript
export const studentCredits = pgTable('student_credits', {
  studentId: integer('student_id').primaryKey().references(() => children.id, { onDelete: 'cascade' }),
  availableBalance: numeric('available_balance', { precision: 10, scale: 2 }).default('0'),
  lifetimeEarned: numeric('lifetime_earned', { precision: 10, scale: 2 }).default('0'),
  tierLevel: varchar('tier_level', { length: 50 }).default('apprentice'), // apprentice, rising, excellence, master, legacy
  tierMultiplier: numeric('tier_multiplier', { precision: 3, scale: 2 }).default('1.00'),
  graduationProjectedValue: numeric('graduation_projected_value', { precision: 10, scale: 2 }),
  lastTierUpdate: timestamp('last_tier_update'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `children` (one-to-one)

---

#### student_achievements
Individual student achievements.

```typescript
export const studentAchievements = pgTable('student_achievements', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
  achievementType: varchar('achievement_type', { length: 100 }).notNull(), // 'class_complete', 'level_master', 'character', 'special'
  achievementName: varchar('achievement_name', { length: 255 }).notNull(),
  description: text('description'),
  creditValue: numeric('credit_value', { precision: 10, scale: 2 }).notNull(),
  multiplierApplied: numeric('multiplier_applied', { precision: 3, scale: 2 }),
  classId: integer('class_id').references(() => classes.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'), // Score, date, details
  awardedAt: timestamp('awarded_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `children`, `classes`
- Has one: `nft_badges` (planned Phase 3)

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `student_id`
- INDEX on `achievement_type`
- INDEX on `awarded_at`

---

### Phase 3: NFT & Crypto Tables

#### nft_badges
NFT achievement badges.

```typescript
export const nftBadges = pgTable('nft_badges', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
  achievementId: integer('achievement_id').notNull().references(() => studentAchievements.id, { onDelete: 'cascade' }),
  badgeType: varchar('badge_type', { length: 100 }).notNull(), // Category
  badgeName: varchar('badge_name', { length: 255 }).notNull(),
  rarity: varchar('rarity', { length: 50 }).notNull(), // common, uncommon, rare, epic, legendary
  tokenId: varchar('token_id', { length: 255 }).unique(),
  contractAddress: varchar('contract_address', { length: 255 }),
  metadataUri: varchar('metadata_uri', { length: 500 }), // IPFS URI
  imageUrl: varchar('image_url', { length: 500 }), // Generated badge image
  attributes: jsonb('attributes'), // NFT metadata attributes
  mintingStatus: varchar('minting_status', { length: 50 }).default('queued'), // queued, minting, minted, failed
  transactionHash: varchar('transaction_hash', { length: 255 }),
  mintedAt: timestamp('minted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `children`, `student_achievements`

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `token_id`
- INDEX on `student_id`
- INDEX on `achievement_id`
- INDEX on `minting_status`

---

#### nft_collections
NFT collection contracts per school.

```typescript
export const nftCollections = pgTable('nft_collections', {
  id: serial('id').primaryKey(),
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  collectionName: varchar('collection_name', { length: 255 }).notNull(),
  contractAddress: varchar('contract_address', { length: 255 }).notNull().unique(),
  chainId: integer('chain_id').notNull(), // 137 for Polygon mainnet
  totalMinted: integer('total_minted').default(0),
  maxSupply: integer('max_supply'), // Nullable for unlimited
  collectionMetadata: jsonb('collection_metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `schools`

---

#### student_wallets
Blockchain wallet for each student.

```typescript
export const studentWallets = pgTable('student_wallets', {
  studentId: integer('student_id').primaryKey().references(() => children.id, { onDelete: 'cascade' }),
  walletAddress: varchar('wallet_address', { length: 255 }).notNull().unique(),
  walletProvider: varchar('wallet_provider', { length: 100 }).default('magic_link'), // magic_link, metamask, walletconnect
  magicLinkEmail: varchar('magic_link_email', { length: 255 }),
  walletStatus: varchar('wallet_status', { length: 50 }).default('locked'), // locked, active, graduated
  unlockDate: date('unlock_date'), // Graduation date or age 18
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastAccessed: timestamp('last_accessed'),
});
```

**Relationships:**
- Belongs to: `children` (one-to-one)

---

#### crypto_conversions
Credit-to-token conversions.

```typescript
export const cryptoConversions = pgTable('crypto_conversions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  creditsAmount: numeric('credits_amount', { precision: 10, scale: 2 }).notNull(),
  tokenAmount: numeric('token_amount', { precision: 18, scale: 8 }).notNull(), // Support 8 decimals
  conversionRate: numeric('conversion_rate', { precision: 18, scale: 8 }).notNull(),
  transactionHash: varchar('transaction_hash', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'), // pending, completed, failed
  initiatedAt: timestamp('initiated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
```

**Relationships:**
- Belongs to: `users`

---

#### asa_token_transactions
Blockchain token transaction history.

```typescript
export const asaTokenTransactions = pgTable('asa_token_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  transactionType: varchar('transaction_type', { length: 100 }).notNull(), // 'conversion', 'tuition_payment', 'transfer', 'stake'
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(),
  fromAddress: varchar('from_address', { length: 255 }),
  toAddress: varchar('to_address', { length: 255 }),
  transactionHash: varchar('transaction_hash', { length: 255 }).notNull().unique(),
  gasFee: numeric('gas_fee', { precision: 18, scale: 8 }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
```

**Relationships:**
- Belongs to: `users`

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `transaction_hash`
- INDEX on `user_id`
- INDEX on `transaction_type`
- INDEX on `timestamp`

---

## Entity Relationship Diagrams

### Current System ERD (Simplified)

```
┌────────────┐
│   users    │
└────┬───────┘
     │ 1
     │
     ├─────────┐
     │         │
     │ N       │ N
┌────┴────┐ ┌──┴─────────┐
│children │ │ user_roles │
└────┬────┘ └──┬─────────┘
     │ 1       │ N
     │         │
     │ N       │ 1
┌────┴──────┐ ┌┴────────┐
│enrollments│ │ schools │
└────┬──────┘ └┬────────┘
     │ N       │ 1
     │         │
     │ 1       ├─────────────┬──────────┐
┌────┴────┐   │             │          │
│ classes │◄──┘             │          │
└─────────┘       ┌─────────┴───┐ ┌────┴──────┐
                  │  locations  │ │categories │
                  └─────────────┘ └───────────┘
```

### Planned Credit System ERD

```
┌────────────┐
│   users    │
└────┬───────┘
     │ 1
     │
     ├─────────────────┬──────────────────┬───────────────┐
     │                 │                  │               │
     │ 1               │ N                │ N             │ N
┌────┴─────────┐ ┌────┴────────┐ ┌───────┴────────┐ ┌───┴─────────────┐
│ user_credits │ │credit_ledger│ │referral_tracking│ │credit_transactions│
│  (1-to-1)    │ └─────────────┘ └────────┬───────┘ └──────────────────┘
└──────────────┘                          │ N
                                          │
                                          │ 1
                                  ┌───────┴──────────┐
                                  │marketing_pieces  │
                                  └──────────────────┘
```

### Planned Student Achievement & NFT ERD

```
┌────────────┐
│  children  │
└────┬───────┘
     │ 1
     │
     ├────────────────────┬──────────────────┐
     │                    │                  │
     │ 1                  │ N                │ 1
┌────┴────────────┐ ┌─────┴────────────┐ ┌──┴──────────┐
│ student_credits │ │student_achievements│ │student_wallets│
│   (1-to-1)      │ └──────┬────────────┘ │   (1-to-1)    │
└─────────────────┘        │ 1            └───────────────┘
                           │
                           │ 1
                      ┌────┴──────┐
                      │nft_badges │
                      │ (1-to-1)  │
                      └───────────┘
```

### Complete Future State ERD (All Tables)

```
                    ┌────────────┐
                    │   schools  │◄───────────┐
                    └─┬──────────┘            │
                      │                       │
        ┌─────────────┼────────────┬──────────┼───────────┬──────────┐
        │             │            │          │           │          │
    ┌───┴────┐  ┌─────┴────┐  ┌───┴────┐  ┌──┴───────┐ ┌┴────────┐ │
    │classes │  │locations │  │categories│ │user_roles│ │nft_coll.│ │
    └───┬────┘  └──────────┘  └──────────┘ └──┬───────┘ └─────────┘ │
        │                                     │                      │
        │                                     │                      │
    ┌───┴──────────┐                    ┌─────┴────┐                │
    │ enrollments  │                    │  users   │◄───────────────┘
    └───┬──────────┘                    └─┬────────┘
        │                                 │
        │                                 ├─────────────┬─────────────┬────────────┐
        │                                 │             │             │            │
    ┌───┴────┐                    ┌───────┴──┐   ┌──────┴───┐ ┌──────┴──────┐ ┌──┴───────┐
    │children│                    │user_cred.│   │credit_led│ │referral_track│ │ai_conv.  │
    └───┬────┘                    └──────────┘   └──────────┘ └──────────────┘ └──┬───────┘
        │                                                                          │
        ├─────────────┬───────────────┐                                          │
        │             │               │                                          │
  ┌─────┴────┐  ┌─────┴──────┐  ┌────┴─────┐                             ┌──────┴────┐
  │stud_cred.│  │stud_achiev.│  │stud_wall.│                             │ai_tasks   │
  └──────────┘  └─────┬──────┘  └──────────┘                             └───────────┘
                      │
                ┌─────┴───────┐
                │  nft_badges │
                └─────────────┘
```

---

## Data Types & Constraints

### Numeric Types

**`serial`** - Auto-incrementing integer (used for primary keys)
```typescript
id: serial('id').primaryKey()
```

**`integer`** - 32-bit integer
```typescript
capacity: integer('capacity')
```

**`numeric(precision, scale)`** - Arbitrary precision decimal
```typescript
price: numeric('price', { precision: 10, scale: 2 }) // Max 99,999,999.99
amount: numeric('amount', { precision: 18, scale: 8 }) // For crypto (8 decimals)
```

### String Types

**`varchar(length)`** - Variable-length string with limit
```typescript
email: varchar('email', { length: 255 })
name: varchar('name', { length: 255 })
```

**`text`** - Unlimited length text
```typescript
description: text('description')
content: text('content')
```

### Date/Time Types

**`timestamp`** - Date and time
```typescript
createdAt: timestamp('created_at').defaultNow().notNull()
updatedAt: timestamp('updated_at').defaultNow().notNull()
```

**`date`** - Date only (no time)
```typescript
dateOfBirth: date('date_of_birth')
renewalDate: date('renewal_date')
```

### Boolean Types

**`boolean`** - True/false
```typescript
isActive: boolean('is_active').default(true)
aiGenerated: boolean('ai_generated').default(false)
```

### JSON Types

**`jsonb`** - Binary JSON (faster, supports indexing)
```typescript
metadata: jsonb('metadata')
attributes: jsonb('attributes')
context: jsonb('context')
```

### Array Types

**`array()`** - PostgreSQL array
```typescript
tags: text('tags').array()
interests: text('interests').array()
```

### Constraints

**NOT NULL:**
```typescript
email: varchar('email', { length: 255 }).notNull()
```

**UNIQUE:**
```typescript
email: varchar('email', { length: 255 }).unique()
supabaseId: varchar('supabase_id', { length: 255 }).unique()
```

**DEFAULT:**
```typescript
role: varchar('role', { length: 50 }).default('parent')
status: varchar('status', { length: 50 }).default('pending')
createdAt: timestamp('created_at').defaultNow()
```

**FOREIGN KEY:**
```typescript
userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' })
schoolId: integer('school_id').references(() => schools.id, { onDelete: 'cascade' })
```

**ON DELETE Actions:**
- `cascade` - Delete child records when parent deleted
- `set null` - Set foreign key to NULL when parent deleted
- `restrict` - Prevent deletion if child records exist

---

## Migration Strategy

### Current Migration Process

**Tool:** Drizzle Kit  
**Commands:**
- `npm run db:push` - Push schema changes to database (safe for small changes)
- `npm run db:push --force` - Force push (use for resolving conflicts)
- `npm run db:generate` - Generate migration files
- `npm run db:migrate` - Run pending migrations

### Phase Rollout Strategy

**Phase 1: Credit System**
1. Create migration file with all Phase 1 tables
2. Test in development environment
3. Backup production database
4. Run migration in production during low-traffic window
5. Verify data integrity
6. Seed default data (tier levels, etc.)

**Phase 2: AI & Student Credits**
1. Create migration file with Phase 2 tables
2. No changes to existing tables (additive only)
3. Test extensively in staging
4. Run migration in production
5. Backfill student credit records from existing enrollments

**Phase 3: NFT & Crypto**
1. Create migration file with Phase 3 tables
2. Deploy smart contracts to blockchain (separate process)
3. Run database migration
4. Create wallets for existing students (background job)
5. Backfill NFT badges from historical achievements

### Best Practices

1. **Never modify existing columns** - Add new columns instead
2. **Use default values** for new columns to avoid NULL issues
3. **Test migrations on copy of production data**
4. **Create rollback scripts** for each migration
5. **Monitor performance** after adding indexes
6. **Batch large data migrations** to avoid long locks

### Rollback Strategy

If migration fails:
1. Stop application immediately
2. Restore database from backup
3. Investigate issue in development
4. Fix migration script
5. Re-test thoroughly
6. Attempt migration again

---

## Indexes & Performance

### Existing Indexes

```sql
-- Primary keys (automatically indexed)
All tables have PRIMARY KEY on id

-- Unique constraints (automatically indexed)
users.email
users.supabase_id
schools.domain
referral_tracking.tracking_code
nft_badges.token_id

-- Foreign key indexes (recommended)
CREATE INDEX idx_enrollments_child_id ON enrollments(child_id);
CREATE INDEX idx_enrollments_class_id ON enrollments(class_id);
CREATE INDEX idx_enrollments_parent_id ON enrollments(parent_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_school_id ON user_roles(school_id);
CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_children_parent_id ON children(parent_id);

-- Composite indexes for common queries
CREATE INDEX idx_enrollments_child_status ON enrollments(child_id, status);
CREATE INDEX idx_classes_school_status ON classes(school_id, status) WHERE status = 'active';
CREATE INDEX idx_user_roles_user_school ON user_roles(user_id, school_id);
```

### Planned Indexes (Phases 1-3)

```sql
-- Phase 1: Credit System
CREATE INDEX idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX idx_credit_ledger_status ON credit_ledger(status);
CREATE INDEX idx_credit_ledger_user_status ON credit_ledger(user_id, status);
CREATE INDEX idx_credit_ledger_created_at ON credit_ledger(created_at);
CREATE INDEX idx_referral_tracking_referrer ON referral_tracking(referrer_user_id);
CREATE INDEX idx_referral_tracking_tracking_code ON referral_tracking(tracking_code);
CREATE INDEX idx_user_credits_available_balance ON user_credits(available_balance DESC); -- For leaderboards

-- Phase 2: AI & Student Credits
CREATE INDEX idx_student_achievements_student_id ON student_achievements(student_id);
CREATE INDEX idx_student_achievements_awarded_at ON student_achievements(awarded_at);
CREATE INDEX idx_ai_tasks_conversation_id ON ai_tasks(conversation_id);
CREATE INDEX idx_ai_tasks_status ON ai_tasks(status);
CREATE INDEX idx_ai_insights_school_id ON ai_insights(school_id);
CREATE INDEX idx_ai_insights_status ON ai_insights(status);

-- Phase 3: NFT & Crypto
CREATE INDEX idx_nft_badges_student_id ON nft_badges(student_id);
CREATE INDEX idx_nft_badges_achievement_id ON nft_badges(achievement_id);
CREATE INDEX idx_nft_badges_token_id ON nft_badges(token_id);
CREATE INDEX idx_nft_badges_minting_status ON nft_badges(minting_status);
CREATE INDEX idx_crypto_conversions_user_id ON crypto_conversions(user_id);
CREATE INDEX idx_asa_token_transactions_user_id ON asa_token_transactions(user_id);
CREATE INDEX idx_asa_token_transactions_transaction_hash ON asa_token_transactions(transaction_hash);
```

### Query Optimization Tips

1. **Use indexes for WHERE clauses:**
   ```sql
   -- Good (uses index)
   SELECT * FROM enrollments WHERE child_id = 123;
   
   -- Bad (full table scan)
   SELECT * FROM enrollments WHERE LOWER(status) = 'pending';
   ```

2. **Avoid SELECT * when possible:**
   ```sql
   -- Good
   SELECT id, name, email FROM users WHERE id = 123;
   
   -- Bad
   SELECT * FROM users WHERE id = 123;
   ```

3. **Use composite indexes for multi-column queries:**
   ```sql
   -- This query benefits from idx_enrollments_child_status
   SELECT * FROM enrollments 
   WHERE child_id = 123 AND status = 'confirmed';
   ```

4. **Use EXPLAIN ANALYZE to check query plans:**
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM classes 
   WHERE school_id = 5 AND status = 'active';
   ```

---

## Data Integrity Rules

### Referential Integrity

1. **Cascade Deletes:**
   - Deleting a user cascades to their children, enrollments, roles
   - Deleting a school cascades to classes, locations, categories
   - Deleting a child cascades to enrollments, achievements, wallet

2. **Set Null on Delete:**
   - Deleting a class sets `class_id` to NULL in student_achievements
   - Deleting a user sets `created_by_user_id` to NULL in knowledge_bases

3. **Prevent Deletion:**
   - Cannot delete a school with active enrollments (application-level check)
   - Cannot delete a user with confirmed payments (application-level check)

### Business Rules

1. **Enrollment Rules:**
   - Child must be within class age range
   - Class must not be full (currentEnrollment < capacity)
   - Parent must have active role at school
   - No duplicate enrollments (child + class unique)

2. **Credit Rules:**
   - Available balance cannot be negative
   - Pending balance ≥ 0
   - Lifetime earned ≥ lifetime redeemed
   - Credits can only be redeemed up to available balance

3. **NFT Rules:**
   - One NFT per achievement (one-to-one)
   - Token ID must be unique across all badges
   - Cannot mint NFT if achievement doesn't exist
   - Cannot transfer NFT if status = 'locked'

4. **Multi-Tenant Rules:**
   - All school-scoped queries MUST filter by school_id
   - Users can only access data from schools they have roles in
   - Cross-school data sharing only for specific cases (e.g., student sync)

### Validation Rules (Application Layer)

```typescript
// Example: Enrollment validation
async function validateEnrollment(childId: number, classId: number) {
  // Check child age
  const child = await getChild(childId);
  const childAge = calculateAge(child.dateOfBirth);
  
  const cls = await getClass(classId);
  if (childAge < cls.ageMin || childAge > cls.ageMax) {
    throw new Error('Child age not within class range');
  }
  
  // Check capacity
  if (cls.currentEnrollment >= cls.capacity) {
    throw new Error('Class is full');
  }
  
  // Check duplicate
  const existing = await db.select()
    .from(enrollments)
    .where(and(
      eq(enrollments.childId, childId),
      eq(enrollments.classId, classId)
    ));
  
  if (existing.length > 0) {
    throw new Error('Child already enrolled in this class');
  }
}
```

---

**Document Control**
- Document Type: Data Models Documentation
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: Database Team
- Approvers: CTO, Lead Developer
