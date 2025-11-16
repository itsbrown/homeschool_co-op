# Comprehensive Integration Testing Plan for ASA Platform
## Enhanced Coverage Analysis & Implementation Roadmap

> **Document Version:** 2.0  
> **Date:** November 16, 2025  
> **Status:** Planning Complete, Implementation Ready

---

## Executive Summary

This document outlines a comprehensive integration testing strategy for the American Seekers Academy (ASA) platform that covers **330 total test scenarios** across **14 implementation phases**. The enhanced plan addresses significant gaps identified in the original testing specification, expanding coverage from approximately 60-65% to 95%+ of the platform's user-facing functionality.

### Key Improvements Over Original Plan
- **+170 new test scenarios** covering previously untested features
- **11 new feature areas** including AI capabilities, custom forms, daily flows, and curriculum management
- **Enhanced coverage** for multi-location support, authentication flows, and real-time features
- **Organized implementation** across 14 prioritized phases

---

## Table of Contents

1. [Testing Infrastructure](#testing-infrastructure)
2. [Phase-by-Phase Test Coverage](#phase-by-phase-test-coverage)
3. [Coverage Metrics](#coverage-metrics)
4. [Implementation Priority Matrix](#implementation-priority-matrix)
5. [Test Data & Scenarios](#test-data--scenarios)
6. [Integration Test Examples](#integration-test-examples)
7. [CI/CD Integration](#cicd-integration)
8. [Success Criteria](#success-criteria)

---

## Testing Infrastructure

### Core Components

#### 1. Test Database Helper (`server/tests/helpers/testDatabase.ts`)
Provides utilities for:
- Creating test users, schools, locations, categories
- Generating mock enrollments, classes, and children
- Setting up complete test environments
- Automatic cleanup after test runs

#### 2. API Test Helper (`server/tests/helpers/apiHelpers.ts`)
Features:
- Authentication management (tokens, cookies)
- HTTP method helpers (GET, POST, PUT, PATCH, DELETE)
- File upload support
- Response assertions (expectSuccess, expectError, etc.)

#### 3. Mock Services (`server/tests/helpers/mockServices.ts`)
Mocked external integrations:
- **Stripe:** Payment processing, subscriptions, webhooks
- **Brevo:** Transactional email delivery
- **Twilio:** SMS messaging
- **OpenAI:** AI content generation
- **Supabase Storage:** File uploads and management
- **WebSocket:** Real-time notifications

#### 4. Mock Data Generators (`server/tests/helpers/mockData.ts`)
Pre-configured generators for:
- Users (all roles)
- Schools and locations
- Classes and enrollments
- Forms and templates
- Realistic test scenarios (multi-child families, multi-campus schools)

---

## Phase-by-Phase Test Coverage

### **PHASE 1: Core Platform Features** (57 tests)

#### 1.1 Class Management ✓ (Already Covered in Original Plan)
- ✅ Class CRUD operations
- ✅ Pricing and variants
- ✅ Filtering and sorting
- ✅ Enrollment counts
- ✅ Sharing functionality

#### 1.2 Staff Management ✓ + Enhancements
- ✅ Staff profile management
- ✅ Email invitations
- ✅ Class assignments
- ⚡ **NEW:** Multi-location staff assignments
- ⚡ **NEW:** Staff permission management

#### 1.3 Student Management ✓
- ✅ Student profile CRUD
- ✅ Enrollment management
- ✅ Roster pages
- ✅ Filtering by class/status/location

#### 1.4 User Management (Enhanced)
**Critical Tests:**
- User account creation for all roles
- ⚡ **NEW:** Multi-role user handling
- ⚡ **NEW:** Role selection interface
- ⚡ **NEW:** Role switching mechanics
- ⚡ **NEW:** Dashboard routing per role (Parent/Educator/School Admin/Super Admin)
- Profile editing
- ⚡ **NEW:** Enhanced auth flows (Auth0 + Supabase)

**Test Scenarios:**
```typescript
describe('Multi-Role User Management', () => {
  it('should display role selection for multi-role users on dashboard access');
  it('should maintain role context when switching between roles');
  it('should route parent users to ParentDashboard with ParentAppShell');
  it('should route educators to EducatorDashboard with AI tools');
  it('should route school admins to MySchoolPage');
  it('should handle super admin access correctly');
});
```

#### 1.5 School Settings ✓
- School profile editing
- Logo upload
- Location management
- Category management
- Staff positions customization
- Discount rules configuration

#### 1.6 Notification System ✓
- All notification types (individual, role-based, location-based, broadcast)
- Delivery methods (in-app, email, SMS)
- Real-time WebSocket delivery
- Notification center operations
- ⚡ **NEW:** Multi-location notifications

---

### **PHASE 2: Financial & Enrollment Features** (36 tests)

#### 2.1 Payment & Billing (Enhanced)
**Already Covered:**
- ✅ Enrollment payment flow
- ✅ Payment plan creation
- ✅ Discount application
- ✅ Manual payment entry
- ✅ Payment history

**New Critical Tests:**
- ⚡ Membership fee processing
- ⚡ Membership renewal automation
- ⚡ Grace period handling
- ⚡ "Free after X children" discount calculations
- ⚡ Membership status tracking

**Test Example:**
```typescript
describe('Membership System', () => {
  it('should calculate and apply "free after 3rd child" discount automatically', async () => {
    const { school, parent, children } = await testDb.setupMultiChildFamily(4);
    // Fourth child enrollment should be discounted
  });
  
  it('should send renewal reminders based on school membership settings', async () => {
    // Test grace period and renewal date calculations
  });
});
```

#### 2.2 Enrollment System (Enhanced)
- ✅ Cart-based enrollment
- ✅ Class enrollment with variants
- ⚡ **NEW:** Bulk sibling enrollments
- ⚡ **NEW:** Waitlist management
- ⚡ **NEW:** Enrollment status transitions
- ⚡ **NEW:** Cross-location enrollments

---

### **PHASE 3: AI-Powered Features** ⚡ NEW (32 tests)

#### 3.1 AI Content Generation
**Critical Features to Test:**

**AI Lesson Generator (`/lessons/ai-generator`)**
```typescript
describe('AI Lesson Generator', () => {
  it('should generate complete lesson plan with custom subject and grade level');
  it('should align with educational standards when requested');
  it('should export generated lesson to PDF format');
  it('should save lesson to user's curriculum library');
  it('should handle OpenAI API errors gracefully');
});
```

**AI Worksheet Generator (`/ai-generator/worksheet`)**
```typescript
describe('AI Worksheet Generator', () => {
  it('should generate worksheet with specified difficulty level');
  it('should include answer key in output');
  it('should support multiple question types (multiple choice, fill-in, essay)');
  it('should export to printable PDF format');
});
```

**OCR Worksheet Generator (`/ai-generator/ocr`)**
```typescript
describe('OCR Worksheet Generator', () => {
  it('should extract text from uploaded worksheet image');
  it('should preserve formatting and structure');
  it('should allow editing of extracted content');
  it('should handle poor quality images with appropriate messaging');
});
```

#### 3.2 AI Insights & Analytics
**AI Insights Dashboard (`/ai-insights`)**
```typescript
describe('AI Insights Dashboard', () => {
  it('should aggregate enrollment data and display trends');
  it('should generate recommendations for class scheduling');
  it('should identify at-risk students based on patterns');
  it('should update in real-time as new data arrives');
});
```

**AI Enrollment Assistant (`/enrollment-assistant`)**
```typescript
describe('AI Enrollment Assistant', () => {
  it('should conduct conversational enrollment process');
  it('should recommend classes based on child age and interests');
  it('should suggest payment plans based on family budget');
  it('should optimize multi-child enrollment with bulk discounts');
  it('should integrate with cart and payment flow');
});
```

#### 3.3 AI Support Assistant
```typescript
describe('AI Support Assistant', () => {
  it('should provide context-aware help based on current page');
  it('should search knowledge base for relevant articles');
  it('should escalate complex issues to human support');
  it('should maintain conversation history during session');
});
```

---

### **PHASE 4: Custom Forms & Workflows** ⚡ NEW (24 tests)

#### 4.1 Form Builder Integration
**Critical Flows:**

**Form Creation (`/schools/forms/builder`)**
```typescript
describe('Form Builder', () => {
  it('should create form with drag-and-drop field arrangement');
  it('should support all field types (text, select, file, date, etc.)');
  it('should configure validation rules for fields');
  it('should set up conditional logic (show field X if Y is selected)');
  it('should save form as template for reuse');
  it('should publish form and generate public URL');
});
```

#### 4.2 Dynamic Form Rendering
```typescript
describe('Dynamic Form Rendering', () => {
  it('should display form with all configured fields');
  it('should enforce client-side validation before submission');
  it('should handle file uploads within forms');
  it('should support multi-step forms with progress indicator');
  it('should be fully responsive on mobile devices');
});
```

#### 4.3 Form Submission & Processing
```typescript
describe('Form Submissions', () => {
  it('should save form submission to database');
  it('should attach uploaded files to submission record');
  it('should send confirmation email to submitter');
  it('should notify school admin of new submission');
  
  // Product Order Forms
  it('should process product order form with payment integration', async () => {
    const form = await testDb.createProductOrderForm(schoolId);
    const submission = await submitFormWithPayment(form.id, {
      quantity: 2,
      paymentMethod: 'stripe'
    });
    expect(submission.status).toBe('paid');
    expect(submission.stripePaymentIntentId).toBeDefined();
  });
  
  it('should export submissions to CSV');
});
```

---

### **PHASE 5: Daily Flows System** ⚡ NEW (20 tests)

**Background:** Daily flows allow educators to track daily student progress, mood, activities, etc.

#### 5.1 Daily Flow Template Management
```typescript
describe('Daily Flow Templates', () => {
  it('should allow school admin to create custom template');
  it('should define required vs optional fields');
  it('should support multiple field types (select, text, number, file)');
  it('should assign template to specific locations');
  it('should activate/deactivate templates');
  it('should version templates (edits create new version)');
});
```

#### 5.2 Daily Flow Entry Creation
```typescript
describe('Daily Flow Entries', () => {
  it('should allow educator to create entry for assigned students');
  it('should auto-populate template fields');
  it('should support photo/file attachments');
  it('should save draft entries');
  it('should submit complete entries');
  it('should prevent duplicate entries for same student/date');
});
```

#### 5.3 Daily Flow Reporting
```typescript
describe('Daily Flow Reports', () => {
  it('should generate report for date range');
  it('should filter by student, educator, or location');
  it('should display entries in timeline format');
  it('should export to PDF for parent viewing');
  it('should update in real-time as new entries are submitted');
});
```

---

### **PHASE 6: Curriculum & Knowledge Management** ⚡ NEW (20 tests)

#### 6.1 Curriculum Management
```typescript
describe('Curriculum CRUD', () => {
  it('should create curriculum with subject and grade level');
  it('should organize curriculum into units and lessons');
  it('should align curriculum to educational standards');
  it('should set prerequisites for sequential learning');
  it('should share curriculum publicly or keep private');
});
```

#### 6.2 Lessons Management
```typescript
describe('Lessons', () => {
  it('should create lesson with objectives and content');
  it('should attach resources (files, links, videos)');
  it('should integrate AI-generated lessons into curriculum');
  it('should sequence lessons within curriculum');
  it('should track lesson completion by students');
});
```

#### 6.3 Knowledge Base (Enhanced)
```typescript
describe('Knowledge Base', () => {
  // Document Management
  it('should upload PDF documents and extract text');
  it('should upload Word docs and convert to HTML');
  it('should process images with OCR');
  it('should generate document preview/thumbnail');
  
  // Search & Discovery
  it('should search by keywords across all documents');
  it('should perform semantic search using embeddings');
  it('should filter by category and tags');
  it('should rank results by relevance');
  
  // Editing & Versioning
  it('should allow editing of extracted content');
  it('should track document versions');
  it('should restore previous versions');
  
  // Organization
  it('should organize documents into categories');
  it('should create hierarchical structure (folders)');
  it('should tag documents with multiple labels');
});
```

---

### **PHASE 7: Multi-Location & Calendar Features** (22 tests)

#### 7.1 Multi-Location Support ⚡ NEW
```typescript
describe('Multi-Location Operations', () => {
  it('should filter classes by location');
  it('should filter students by location');
  it('should assign staff to multiple locations');
  it('should create classes at specific locations');
  it('should generate location-specific reports');
  it('should handle cross-location enrollments');
  it('should apply different pricing per location');
  it('should manage different categories per location');
});
```

#### 7.2 Calendar & Events (Enhanced)
```typescript
describe('Calendar System', () => {
  // Basic Features ✓
  it('should create events (classes, meetings, workshops, camps)');
  it('should display calendar with events from classes and custom events');
  it('should filter events by type and date');
  
  // New Features ⚡
  it('should display multi-location calendar views');
  it('should show educator-specific calendar with assigned classes');
  it('should show parent family schedule with all children');
  it('should send event reminders via notification system');
  it('should export calendar to iCal format');
  it('should export to Google Calendar');
  it('should handle recurring events');
});
```

---

### **PHASE 8: Parent & Student Portal Features** ⚡ NEW (21 tests)

#### 8.1 Parent Dashboard
```typescript
describe('Parent Dashboard', () => {
  it('should display overview of all enrolled children');
  it('should show upcoming classes for each child');
  it('should display recent daily flow entries');
  it('should show payment history and outstanding balances');
  it('should display notifications');
  it('should provide quick links to common actions');
});
```

#### 8.2 Program Browsing
```typescript
describe('Program Browsing', () => {
  it('should list all available programs with filters');
  it('should filter by location');
  it('should filter by category (Math, Science, Arts, etc.)');
  it('should filter by age group');
  it('should filter by schedule (weekday, weekend, time)');
  it('should display class details when selected');
  it('should show remaining spots available');
  it('should allow adding to cart for enrollment');
});
```

#### 8.3 Child Registration (Enhanced)
```typescript
describe('Child Registration', () => {
  it('should register single child with all required fields');
  it('should register multiple children in one flow');
  
  // Emergency Contacts ⚡ NEW
  it('should add emergency contact information');
  it('should validate emergency contact phone numbers');
  it('should require emergency contact relationship');
  
  it('should collect medical information securely');
  it('should display confirmation with all entered data');
  it('should send confirmation email after registration');
});
```

---

### **PHASE 9: School Application & Onboarding** ⚡ NEW (16 tests)

```typescript
describe('School Application Process', () => {
  // Application Submission
  it('should submit complete school application form', async () => {
    const applicationData = {
      schoolName: 'New Academy',
      schoolType: 'private',
      adminEmail: 'admin@newacademy.com',
      // ... all required fields
    };
    const application = await submitSchoolApplication(applicationData);
    expect(application.status).toBe('pending');
    expect(application.token).toBeDefined();
  });
  
  it('should send confirmation email with application token');
  it('should provide status tracking page');
  
  // Review Workflow (Super Admin)
  it('should list all pending applications for super admin');
  it('should display application details for review');
  it('should allow super admin to approve application', async () => {
    await approveApplication(applicationId, superAdminId);
    // Should trigger school account creation
  });
  it('should allow super admin to reject with reason');
  it('should send notification emails on approval/rejection');
  
  // Post-Approval Onboarding
  it('should create school account upon approval');
  it('should create admin user account');
  it('should send admin invitation email with setup link');
  it('should guide admin through initial setup wizard');
});
```

---

### **PHASE 10: Super Admin Features** ⚡ NEW (15 tests)

```typescript
describe('Super Admin Platform Management', () => {
  // School Management
  it('should list all schools with pagination');
  it('should filter schools by status (active/inactive/suspended)');
  it('should search schools by name or location');
  it('should display school details with key metrics');
  it('should show enrollment counts per school');
  it('should display revenue tracking per school');
  it('should view activity logs for each school');
  
  // School Administration
  it('should edit school information as super admin');
  it('should change school status (activate/suspend)');
  it('should add super admin notes to school record');
  
  // Platform Operations
  it('should send platform-wide announcements');
  it('should view platform analytics dashboard');
  it('should manage users across all schools');
  it('should access platform-wide reports');
});
```

---

### **PHASE 11: Marketing & Growth Features** ⚡ NEW (12 tests)

#### 11.1 Registration Code System
```typescript
describe('Registration Codes', () => {
  it('should generate unique registration code for school');
  it('should set expiration date for code');
  it('should set usage limit (e.g., max 50 uses)');
  it('should validate code during registration');
  it('should auto-associate user with school using code');
  it('should track code usage analytics');
  it('should display conversion rate per code');
});
```

#### 11.2 Marketing Links
```typescript
describe('Marketing Links', () => {
  it('should create custom marketing link with UTM parameters');
  it('should track clicks on marketing links');
  it('should track conversions (registrations from link)');
  it('should attribute enrollments to source');
  it('should generate analytics report for campaign');
});
```

---

### **PHASE 12: File Management & Bulk Imports** ⚡ NEW (15 tests)

#### 12.1 Bulk Import
```typescript
describe('CSV Import', () => {
  // Contact Import
  it('should import parent contacts from CSV');
  it('should validate required fields');
  it('should detect and handle duplicates');
  it('should display import preview before committing');
  it('should show error report for invalid rows');
  
  // Class Upload
  it('should bulk upload classes from CSV');
  it('should parse schedule strings correctly');
  it('should import pricing and capacity info');
  it('should assign instructors if specified');
});
```

#### 12.2 File Upload (Enhanced)
```typescript
describe('File Uploads', () => {
  it('should upload and resize school logo');
  it('should upload documents to knowledge base');
  it('should validate file types (PDF, DOCX, images only)');
  it('should enforce file size limits');
  it('should optimize images before storage');
  it('should store files in Supabase Storage');
  it('should track storage quota per school');
});
```

---

### **PHASE 13: Authentication & Security** ⚡ NEW (24 tests)

#### 13.1 Multi-Provider Authentication
```typescript
describe('Auth0 Integration', () => {
  it('should login using Auth0 email/password');
  it('should handle Auth0 OAuth callback');
  it('should refresh access tokens');
  it('should logout and clear Auth0 session');
});

describe('Supabase Authentication', () => {
  it('should login using Supabase email/password');
  it('should send magic link for passwordless login');
  it('should handle Google OAuth via Supabase');
  it('should manage session with refresh tokens');
});

describe('Unified Auth', () => {
  it('should map Auth0 users to database users');
  it('should map Supabase users to database users');
  it('should handle account linking (same email, different providers)');
});
```

#### 13.2 Invitation System (Enhanced)
```typescript
describe('Invitations', () => {
  // Staff Invitations ✓
  it('should send staff email invitation');
  
  // Educator Invitations ⚡ NEW
  it('should send educator-specific invitation with class assignments');
  it('should allow educator to accept and create account');
  
  // Parent Invitations ⚡ NEW
  it('should send parent invitation from school admin');
  it('should auto-enroll children upon parent acceptance');
  
  // Invitation Management
  it('should expire invitations after 7 days');
  it('should resend invitation if not accepted');
  it('should prevent duplicate invitations to same email');
});
```

#### 13.3 Password Management
```typescript
describe('Password Reset', () => {
  it('should send password reset email with token');
  it('should validate reset token');
  it('should allow setting new password');
  it('should enforce password strength requirements');
  it('should invalidate old sessions after password change');
});
```

---

### **PHASE 14: Real-Time Features** (16 tests - Enhanced)

```typescript
describe('WebSocket Integration', () => {
  it('should establish WebSocket connection on login');
  it('should reconnect automatically on disconnect');
  
  // Real-Time Updates
  it('should deliver notifications in real-time');
  it('should update billing totals across sessions');
  it('should update enrollment counts immediately');
  it('should update class rosters when student enrolls');
  
  // Daily Flows ⚡ NEW
  it('should notify parents when daily flow entry is created');
  it('should update daily flow reports in real-time');
  
  // Live Roster ⚡ NEW
  it('should show live roster changes to all viewers');
  it('should indicate which educators are viewing roster');
  
  it('should close connections gracefully on logout');
});
```

---

## Coverage Metrics

### Total Test Count by Phase

| Phase | Feature Area | Critical | Nice-to-Have | Total |
|-------|-------------|----------|--------------|-------|
| 1 | Core Platform | 45 | 12 | **57** |
| 2 | Financial | 28 | 8 | **36** |
| 3 | AI Features | 22 | 10 | **32** |
| 4 | Custom Forms | 18 | 6 | **24** |
| 5 | Daily Flows | 15 | 5 | **20** |
| 6 | Curriculum | 12 | 8 | **20** |
| 7 | Multi-Location | 16 | 6 | **22** |
| 8 | Parent Portal | 14 | 7 | **21** |
| 9 | School Apps | 12 | 4 | **16** |
| 10 | Super Admin | 10 | 5 | **15** |
| 11 | Marketing | 8 | 4 | **12** |
| 12 | File Management | 10 | 5 | **15** |
| 13 | Auth & Security | 18 | 6 | **24** |
| 14 | Real-Time | 12 | 4 | **16** |
| **TOTAL** | | **240** | **90** | **330** |

### Feature Coverage Analysis

**Original Plan Coverage:** ~60-65% of platform features  
**Enhanced Plan Coverage:** ~95% of platform features

**Features Now Covered (New):**
- ✅ All AI-powered functionality (5+ pages)
- ✅ Custom forms system (4 pages)
- ✅ Daily flows tracking (4 pages)
- ✅ Curriculum management (3+ pages)
- ✅ Knowledge base (enhanced from basic to comprehensive)
- ✅ Multi-role user flows (role selection, switching)
- ✅ Super admin interface (4 pages)
- ✅ Parent-specific features (dashboard, program browsing)
- ✅ School application process (3 pages)
- ✅ Marketing features (registration codes, links)
- ✅ Enhanced authentication flows (Auth0 + Supabase + invitations)

---

## Implementation Priority Matrix

### Priority 1: Critical User Flows (Weeks 1-2)
**Must be tested before any production deployment:**
- User authentication (all providers)
- Role selection and switching
- Class enrollment with payment
- Student registration
- Basic notification delivery

### Priority 2: Core Features (Weeks 3-4)
**Essential for platform stability:**
- Multi-location support
- Staff management
- School settings
- Calendar and events
- Payment plans and discounts

### Priority 3: Advanced Features (Weeks 5-6)
**Important for differentiation:**
- AI lesson/worksheet generators
- Custom forms system
- Daily flows tracking
- Curriculum management
- Knowledge base

### Priority 4: Growth & Administration (Weeks 7-8)
**Necessary for scaling:**
- School application process
- Super admin features
- Marketing tools
- Bulk imports
- Analytics and reporting

---

## Test Data & Scenarios

### Realistic Test Scenarios

#### Scenario 1: Multi-Child Family Enrollment
```typescript
const scenario = {
  parent: { email: 'parent@example.com', role: 'parent' },
  children: [
    { firstName: 'Alice', age: 10, grade: '5th' },
    { firstName: 'Bob', age: 8, grade: '3rd' },
    { firstName: 'Charlie', age: 6, grade: '1st' },
    { firstName: 'Diana', age: 6, grade: '1st' }
  ],
  // 4th child should trigger "free after 3" discount
  expectedDiscount: true
};
```

#### Scenario 2: School with Multiple Locations
```typescript
const scenario = {
  school: { name: 'Multi-Campus Academy' },
  locations: [
    { name: 'Main Campus', capacity: 500 },
    { name: 'East Campus', capacity: 300 },
    { name: 'West Campus', capacity: 200 }
  ],
  // Classes should be location-specific
  // Staff can be assigned to multiple locations
};
```

#### Scenario 3: Complete Enrollment Flow
```typescript
const scenario = {
  steps: [
    'Parent browses programs',
    'Parent adds class to cart',
    'Parent proceeds to checkout',
    'Parent selects payment plan',
    'Payment processed via Stripe',
    'Enrollment confirmed',
    'Welcome email sent',
    'Calendar event created',
    'Notification sent to educator'
  ]
};
```

---

## Integration Test Examples

### Example 1: Multi-Role Dashboard Routing

```typescript
import { testDb } from '../helpers/testDatabase';
import { api } from '../helpers/apiHelpers';

describe('Integration: Multi-Role User Management', () => {
  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('should display role selection for multi-role users', async () => {
    // Create user with multiple roles
    const user = await testDb.createTestUser({
      email: 'multirole@example.com',
      role: 'parent', // Primary role
      permissions: { 
        additionalRoles: ['educator', 'admin'] 
      }
    });

    // Login
    await api.loginAsUser(user.email);

    // Navigate to dashboard
    const response = await api.get('/dashboard');
    
    // Should see role selection component
    expect(response.body).toHaveProperty('showRoleSelection', true);
    expect(response.body.availableRoles).toContain('parent');
    expect(response.body.availableRoles).toContain('educator');
    expect(response.body.availableRoles).toContain('admin');
  });

  it('should route to correct dashboard based on selected role', async () => {
    const user = await testDb.createTestUser({
      email: 'multirole@example.com',
      permissions: { additionalRoles: ['educator'] }
    });

    await api.loginAsUser(user.email);

    // Select educator role
    await api.post('/api/user/select-role', { role: 'educator' });

    // Access dashboard
    const response = await api.get('/dashboard');
    
    // Should route to EducatorDashboard
    expect(response.body.dashboardType).toBe('educator');
    expect(response.body).toHaveProperty('classes');
    expect(response.body).toHaveProperty('students');
  });
});
```

### Example 2: AI Lesson Generator Integration

```typescript
import { testDb } from '../helpers/testDatabase';
import { mockOpenAIService } from '../helpers/mockServices';

describe('Integration: AI Lesson Generator', () => {
  beforeAll(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('should generate lesson plan and save to curriculum', async () => {
    const user = await testDb.createTestUser({ role: 'teacher' });
    const school = await testDb.createTestSchool(user.id);

    // Mock OpenAI response
    mockOpenAIService.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Introduction to Fractions',
            objectives: ['Understand numerator and denominator', 'Compare fractions'],
            content: '...'
          })
        }
      }]
    });

    await api.loginAsUser(user.email);

    // Generate lesson
    const response = await api.post('/api/ai/generate-lesson', {
      subject: 'Mathematics',
      grade: '4th Grade',
      topic: 'Fractions',
      standards: ['CCSS.MATH.CONTENT.4.NF.A.1']
    });

    expect(response.status).toBe(200);
    expect(response.body.lesson).toHaveProperty('title');
    expect(response.body.lesson).toHaveProperty('objectives');
    
    // Verify saved to database
    const savedLesson = await database.select()
      .from(lessons)
      .where(eq(lessons.id, response.body.lesson.id));
    
    expect(savedLesson).toBeDefined();
  });
});
```

### Example 3: Custom Form with Payment Integration

```typescript
describe('Integration: Product Order Form with Payment', () => {
  it('should process form submission with Stripe payment', async () => {
    const admin = await testDb.createTestUser({ role: 'schoolAdmin' });
    const school = await testDb.createTestSchool(admin.id);

    // Create product order form
    const form = await testDb.createCustomForm(school.id, admin.id, {
      title: 'T-Shirt Order Form',
      fields: [
        { id: 'size', type: 'select', label: 'Size', options: ['S', 'M', 'L', 'XL'] },
        { id: 'quantity', type: 'number', label: 'Quantity' }
      ],
      pricePerUnit: 2000, // $20
      requiresPayment: true
    });

    // Parent submits form
    const parent = await testDb.createTestUser({ role: 'parent' });
    await api.loginAsUser(parent.email);

    const response = await api.post(`/api/forms/${form.id}/submit`, {
      responses: {
        size: 'M',
        quantity: 3
      },
      paymentMethodId: 'pm_test_123'
    });

    expect(response.status).toBe(200);
    expect(response.body.submission).toHaveProperty('id');
    expect(response.body.payment).toHaveProperty('status', 'succeeded');
    expect(response.body.payment.amount).toBe(6000); // $60 (3 x $20)
    
    // Verify Stripe was called
    expect(mockStripeService.paymentIntents.create).toHaveBeenCalled();
  });
});
```

---

## CI/CD Integration

### Automated Test Execution

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: testpassword
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run database migrations
        run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:testpassword@localhost:5432/test
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://postgres:testpassword@localhost:5432/test
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
      
      - name: Block deployment on test failure
        if: failure()
        run: exit 1
```

### Test Organization

```
server/tests/
├── integration/
│   ├── phase1/
│   │   ├── user-management.test.ts
│   │   ├── class-management.test.ts
│   │   ├── staff-management.test.ts
│   │   └── notifications.test.ts
│   ├── phase2/
│   │   ├── payments.test.ts
│   │   ├── enrollments.test.ts
│   │   └── membership.test.ts
│   ├── phase3/
│   │   ├── ai-lesson-generator.test.ts
│   │   ├── ai-worksheet-generator.test.ts
│   │   └── ai-insights.test.ts
│   └── ... (phases 4-14)
├── helpers/
│   ├── testDatabase.ts
│   ├── apiHelpers.ts
│   ├── mockServices.ts
│   └── mockData.ts
└── fixtures/
    ├── sample-forms.json
    ├── sample-classes.csv
    └── sample-worksheets.pdf
```

---

## Success Criteria

### Phase 1 Success (Core Platform)
- ✅ All critical user flows have automated tests
- ✅ Multi-role user management fully tested
- ✅ Tests catch role routing issues
- ✅ Coverage > 80% for core features

### Phase 2 Success (Financial)
- ✅ Payment flows tested end-to-end
- ✅ Membership system tested including edge cases
- ✅ "Free after X" discount calculations verified
- ✅ Stripe integration mocked and tested

### Phase 3 Success (AI Features)
- ✅ All AI generators tested with mock responses
- ✅ Error handling tested (API failures, rate limits)
- ✅ Generated content saved correctly
- ✅ Export functionality verified

### Overall Success (All Phases)
- ✅ 330 integration tests implemented and passing
- ✅ Tests run in CI/CD pipeline before each deployment
- ✅ Test coverage > 80% for critical paths
- ✅ No production deployments without passing tests
- ✅ Real-time features verified in tests
- ✅ All user-facing pages have integration test coverage

---

## Implementation Timeline

### Recommended Approach

**Week 1-2:** Infrastructure + Phase 1 (Core Platform)  
**Week 3-4:** Phase 2 (Financial) + Phase 13 (Auth & Security)  
**Week 5-6:** Phase 3 (AI Features) + Phase 4 (Custom Forms)  
**Week 7-8:** Phase 5-12 (Remaining features)  
**Week 9:** CI/CD Integration + Documentation  
**Week 10:** Buffer for fixes and improvements

---

## Appendix: Quick Reference

### Test Command Reference
```bash
# Run all integration tests
npm run test:integration

# Run specific phase
npm run test:integration -- --testPathPattern=phase1

# Run with coverage
npm run test:integration -- --coverage

# Run in watch mode during development
npm run test:integration -- --watch
```

### Mock Service Configuration
```typescript
import { configureMockResponses } from '../helpers/mockServices';

beforeEach(() => {
  configureMockResponses({
    stripe: {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({ 
          id: 'pi_custom', 
          status: 'succeeded' 
        })
      }
    },
    openai: {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'Custom AI response' } }]
          })
        }
      }
    }
  });
});
```

---

**Document End**

For questions or clarifications on implementing this testing plan, refer to the test helper files in `server/tests/helpers/` or consult the inline test examples above.
