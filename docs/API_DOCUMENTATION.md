# ASA Learning Platform - API Documentation

**Version:** 2.0  
**Last Updated:** November 24, 2025  
**Base URL:** `https://asa-learning-platform.replit.app/api`  
**Status:** Active Development

---

## Table of Contents
1. [Authentication](#authentication)
2. [Error Handling](#error-handling)
3. [Current API Endpoints](#current-api-endpoints)
4. [Planned API Endpoints (Phases 1-3)](#planned-api-endpoints-phases-1-3)
5. [Webhook Endpoints](#webhook-endpoints)
6. [Rate Limiting](#rate-limiting)
7. [Pagination](#pagination)
8. [Best Practices](#best-practices)

---

## Authentication

### Authentication Methods

**1. JWT Bearer Token (Primary)**
```http
GET /api/protected-endpoint
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**2. Session Cookie (Alternative)**
```http
GET /api/protected-endpoint
Cookie: connect.sid=s%3A...
```

### Authentication Flow

1. User logs in via Supabase
2. Supabase returns JWT token
3. Frontend stores token in memory
4. Frontend includes token in `Authorization` header for all API requests
5. Backend validates token using `supabaseAuth` middleware
6. Backend populates `req.user` with user data from PostgreSQL

### User Object Structure

After authentication, `req.user` contains:

```typescript
interface AuthenticatedUser {
  id: number;                    // PostgreSQL user ID
  email: string;
  name?: string;
  supabaseId: string;            // Supabase UUID
  role: string;                  // 'parent' | 'educator' | 'schoolAdmin' | 'superAdmin'
  activeRoleId?: number;         // Current active user_role ID
  schoolId?: number;             // Current school context (for admins)
  permissions?: string[];        // Role-based permissions
}
```

### Protected Endpoints

Most endpoints require authentication. Exceptions:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/health`

---

## Error Handling

### Standard Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {...},
  "timestamp": "2025-11-24T10:30:00Z"
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Request completed successfully |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Validation error, invalid input |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, constraint violation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

### Common Error Codes

```typescript
// Authentication Errors
"AUTH_REQUIRED"         // No authentication provided
"INVALID_TOKEN"         // JWT token invalid or expired
"USER_NOT_FOUND"        // No database user for authenticated Supabase ID

// Authorization Errors
"INSUFFICIENT_PERMISSIONS"  // User doesn't have required role
"SCHOOL_CONTEXT_REQUIRED"   // School context missing for school-scoped operation
"ACCESS_DENIED"            // User cannot access this resource

// Validation Errors
"VALIDATION_ERROR"      // Input validation failed
"INVALID_INPUT"         // Request body doesn't match schema

// Business Logic Errors
"DUPLICATE_ENROLLMENT"  // Child already enrolled in class
"CLASS_FULL"           // Class capacity reached
"AGE_REQUIREMENT"      // Child doesn't meet age requirement
"INSUFFICIENT_CREDITS" // Not enough credits to redeem

// System Errors
"DATABASE_ERROR"       // Database operation failed
"EXTERNAL_SERVICE_ERROR" // Third-party API failed
```

### Error Response Examples

**Validation Error:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "email",
    "message": "Invalid email format"
  },
  "timestamp": "2025-11-24T10:30:00Z"
}
```

**Authorization Error:**
```json
{
  "error": "Insufficient permissions",
  "code": "INSUFFICIENT_PERMISSIONS",
  "details": {
    "required": ["schoolAdmin"],
    "current": "parent"
  },
  "timestamp": "2025-11-24T10:30:00Z"
}
```

---

## Current API Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "parent@example.com",
  "password": "SecurePassword123!",
  "name": "Jane Smith",
  "role": "parent",
  "locationId": 1,
  "schoolCode": "ASA2025"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": 123,
    "email": "parent@example.com",
    "name": "Jane Smith",
    "role": "parent"
  },
  "redirectUrl": "/parent"
}
```

---

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "parent@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 123,
    "email": "parent@example.com",
    "name": "Jane Smith",
    "roles": ["parent"]
  },
  "session": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2025-11-24T18:30:00Z"
  }
}
```

---

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 123,
  "email": "parent@example.com",
  "name": "Jane Smith",
  "role": "parent",
  "activeRole": "parent",
  "schoolId": 5,
  "profileImage": "/uploads/profile123.jpg",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

---

### User Roles

#### Get User Roles
```http
GET /api/user-roles
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "roles": [
    {
      "id": 1,
      "userId": 123,
      "schoolId": 5,
      "role": "parent",
      "isActive": true,
      "school": {
        "id": 5,
        "name": "American Seekers Academy - Austin"
      }
    },
    {
      "id": 2,
      "userId": 123,
      "schoolId": 7,
      "role": "educator",
      "isActive": true,
      "school": {
        "id": 7,
        "name": "American Seekers Academy - Dallas"
      }
    }
  ],
  "activeRole": {
    "id": 1,
    "role": "parent",
    "schoolId": 5
  }
}
```

---

#### Switch Active Role
```http
POST /api/user-roles/switch/:roleId
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Role switched successfully",
  "activeRole": {
    "id": 2,
    "role": "educator",
    "schoolId": 7
  }
}
```

---

### Classes

#### Get All Classes (Parent View)
```http
GET /api/classes?locationId=1&categoryId=2&ageMin=8&ageMax=12
Authorization: Bearer <token>
```

**Query Parameters:**
- `locationId` (optional): Filter by location
- `categoryId` (optional): Filter by category
- `ageMin` (optional): Filter by minimum age
- `ageMax` (optional): Filter by maximum age
- `search` (optional): Search in name/description

**Response (200):**
```json
{
  "classes": [
    {
      "id": 45,
      "name": "Introduction to Python Programming",
      "description": "Learn the basics of coding with Python",
      "instructorName": "Dr. Sarah Johnson",
      "ageMin": 10,
      "ageMax": 14,
      "capacity": 20,
      "currentEnrollment": 15,
      "price": 175.00,
      "earlyBirdPrice": 150.00,
      "earlyBirdDeadline": "2025-12-01T00:00:00Z",
      "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
      "startDate": "2026-01-15T00:00:00Z",
      "endDate": "2026-03-15T00:00:00Z",
      "status": "active",
      "category": {
        "id": 2,
        "name": "Technology",
        "color": "#3B82F6"
      },
      "location": {
        "id": 1,
        "name": "Main Campus",
        "city": "Austin"
      }
    }
  ],
  "total": 1
}
```

---

#### Get Class Details
```http
GET /api/classes/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 45,
  "name": "Introduction to Python Programming",
  "description": "Learn the basics of coding with Python...",
  "instructorName": "Dr. Sarah Johnson",
  "ageMin": 10,
  "ageMax": 14,
  "gradeMin": "4th",
  "gradeMax": "8th",
  "capacity": 20,
  "currentEnrollment": 15,
  "price": 175.00,
  "earlyBirdPrice": 150.00,
  "earlyBirdDeadline": "2025-12-01T00:00:00Z",
  "lateFee": 25.00,
  "lateRegistrationStart": "2026-01-01T00:00:00Z",
  "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
  "startDate": "2026-01-15T00:00:00Z",
  "endDate": "2026-03-15T00:00:00Z",
  "registrationDeadline": "2026-01-10T00:00:00Z",
  "prerequisites": "None",
  "materials": "Laptop with Python installed",
  "imageUrl": "/uploads/python-class.jpg",
  "status": "active",
  "spotsRemaining": 5,
  "enrollmentProgress": 75,
  "category": {...},
  "location": {...}
}
```

---

### Enrollments

#### Create Enrollment (Add to Cart)
```http
POST /api/enrollments
Authorization: Bearer <token>
Content-Type: application/json

{
  "childId": 10,
  "classId": 45
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Class added to cart",
  "enrollment": {
    "id": 234,
    "childId": 10,
    "classId": 45,
    "status": "pending",
    "pricePaid": 150.00,
    "priceVariant": "early_bird",
    "enrolledAt": "2025-11-24T10:30:00Z"
  }
}
```

---

#### Get User's Enrollments
```http
GET /api/enrollments?status=confirmed&childId=10
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` (optional): Filter by status (pending, confirmed, cancelled, completed)
- `childId` (optional): Filter by specific child

**Response (200):**
```json
{
  "enrollments": [
    {
      "id": 234,
      "child": {
        "id": 10,
        "firstName": "Johnny",
        "lastName": "Smith",
        "gradeLevel": "5th"
      },
      "class": {
        "id": 45,
        "name": "Introduction to Python Programming",
        "instructorName": "Dr. Sarah Johnson",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM"
      },
      "status": "confirmed",
      "pricePaid": 150.00,
      "priceVariant": "early_bird",
      "paymentStatus": "paid",
      "enrolledAt": "2025-11-24T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

#### Cancel Enrollment
```http
DELETE /api/enrollments/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Enrollment cancelled successfully"
}
```

---

### Cart

#### Get Cart
```http
GET /api/cart
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "items": [
    {
      "enrollment": {
        "id": 234,
        "childId": 10,
        "classId": 45,
        "pricePaid": 150.00
      },
      "child": {
        "id": 10,
        "firstName": "Johnny",
        "lastName": "Smith"
      },
      "class": {
        "id": 45,
        "name": "Introduction to Python Programming",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM"
      }
    }
  ],
  "summary": {
    "subtotal": 150.00,
    "discounts": 0.00,
    "total": 150.00,
    "itemCount": 1
  }
}
```

---

#### Bulk Cancel Cart Items
```http
POST /api/cart/bulk-cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "enrollmentIds": [234, 235, 236]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "3 items cancelled successfully",
  "cancelled": [234, 235, 236],
  "failed": []
}
```

---

### Stripe Payment

#### Create Checkout Session
```http
POST /api/stripe/create-checkout-session
Authorization: Bearer <token>
Content-Type: application/json

{
  "enrollmentIds": [234, 235]
}
```

**Response (200):**
```json
{
  "sessionId": "cs_test_a1b2c3d4e5f6g7h8i9j0",
  "url": "https://checkout.stripe.com/pay/cs_test_a1b2c3d4e5f6g7h8i9j0"
}
```

**Usage:**
Frontend redirects user to Stripe Checkout URL. After payment, user redirected back to success/cancel page.

---

#### Payment Success Callback
```http
GET /api/stripe/payment-success?session_id=cs_test_a1b2c3d4e5f6g7h8i9j0
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "enrollments": [
    {
      "id": 234,
      "status": "confirmed",
      "paymentStatus": "paid"
    },
    {
      "id": 235,
      "status": "confirmed",
      "paymentStatus": "paid"
    }
  ]
}
```

---

### School Admin

#### Get My School
```http
GET /api/school-admin/my-school
Authorization: Bearer <token>
X-Required-Role: schoolAdmin
```

**Response (200):**
```json
{
  "id": 5,
  "name": "American Seekers Academy - Austin",
  "logo": "/uploads/school-logo.png",
  "address": "123 Learning Lane",
  "city": "Austin",
  "state": "Texas",
  "zipCode": "78701",
  "phoneNumber": "+1 (512) 555-1234",
  "email": "austin@asa.com",
  "website": "https://asa-austin.com",
  "membershipFee": 175.00,
  "membershipRenewalDate": "2025-08-01",
  "membershipGracePeriod": 30,
  "membershipRequired": true,
  "academicYearStart": "2025-08-15",
  "academicYearEnd": "2026-05-30",
  "stats": {
    "totalStudents": 247,
    "totalEnrollments": 512,
    "activeClasses": 28,
    "revenue": 45780.50
  }
}
```

---

#### Create Class
```http
POST /api/school-admin/classes
Authorization: Bearer <token>
X-Required-Role: schoolAdmin
Content-Type: application/json

{
  "name": "Advanced Mathematics",
  "description": "College-level math for gifted students",
  "instructorName": "Prof. Emily Chen",
  "locationId": 1,
  "categoryId": 3,
  "ageMin": 14,
  "ageMax": 18,
  "gradeMin": "9th",
  "gradeMax": "12th",
  "capacity": 15,
  "price": 250.00,
  "earlyBirdPrice": 200.00,
  "earlyBirdDeadline": "2025-12-15T00:00:00Z",
  "schedule": "Tuesdays and Thursdays, 3:00 PM - 4:30 PM",
  "startDate": "2026-01-15T00:00:00Z",
  "endDate": "2026-05-15T00:00:00Z"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Class created successfully",
  "class": {
    "id": 67,
    "name": "Advanced Mathematics",
    "status": "draft",
    ...
  }
}
```

---

#### Get All Users (School Context)
```http
GET /api/school-admin/users?role=parent&search=smith
Authorization: Bearer <token>
X-Required-Role: schoolAdmin
```

**Query Parameters:**
- `role` (optional): Filter by role (parent, educator)
- `search` (optional): Search in name/email
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response (200):**
```json
{
  "users": [
    {
      "id": 123,
      "email": "jane.smith@example.com",
      "name": "Jane Smith",
      "role": "parent",
      "phoneNumber": "+1234567890",
      "childrenCount": 2,
      "enrollmentsCount": 4,
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### Send Account Invite
```http
POST /api/school-admin/send-account-invite
Authorization: Bearer <token>
X-Required-Role: schoolAdmin
Content-Type: application/json

{
  "email": "newteacher@example.com",
  "role": "educator",
  "name": "John Doe"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "inviteToken": "abc123def456",
  "expiresAt": "2025-12-01T10:30:00Z"
}
```

---

### Parent

#### Get My Children
```http
GET /api/parent/children
Authorization: Bearer <token>
X-Required-Role: parent
```

**Response (200):**
```json
{
  "children": [
    {
      "id": 10,
      "firstName": "Johnny",
      "lastName": "Smith",
      "dateOfBirth": "2015-03-15",
      "age": 10,
      "gradeLevel": "5th",
      "gender": "male",
      "profileImage": "/uploads/child10.jpg",
      "interests": ["coding", "robotics", "soccer"],
      "learningStyle": "visual",
      "enrollments": [
        {
          "id": 234,
          "className": "Introduction to Python Programming",
          "status": "confirmed"
        }
      ],
      "enrollmentCount": 1
    },
    {
      "id": 11,
      "firstName": "Emma",
      "lastName": "Smith",
      "dateOfBirth": "2017-08-22",
      "age": 8,
      "gradeLevel": "3rd",
      "gender": "female",
      "enrollmentCount": 2
    }
  ],
  "total": 2
}
```

---

#### Create Child
```http
POST /api/parent/children
Authorization: Bearer <token>
X-Required-Role: parent
Content-Type: application/json

{
  "firstName": "Sophia",
  "lastName": "Smith",
  "dateOfBirth": "2018-05-10",
  "gradeLevel": "2nd",
  "gender": "female",
  "allergies": "Peanuts",
  "medicalInfo": "Asthma - requires inhaler",
  "emergencyContact": "Dad - Mike Smith",
  "emergencyPhone": "+1234567890",
  "interests": ["art", "music"],
  "learningStyle": "kinesthetic"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Child profile created successfully",
  "child": {
    "id": 12,
    "firstName": "Sophia",
    "lastName": "Smith",
    "age": 7,
    ...
  }
}
```

---

#### Update Child
```http
PATCH /api/parent/children/:id
Authorization: Bearer <token>
X-Required-Role: parent
Content-Type: application/json

{
  "gradeLevel": "3rd",
  "interests": ["art", "music", "dance"]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Child profile updated successfully",
  "child": {...}
}
```

---

### Notifications

#### Get My Notifications
```http
GET /api/notifications?unreadOnly=true
Authorization: Bearer <token>
```

**Query Parameters:**
- `unreadOnly` (optional): Show only unread notifications (default: false)
- `limit` (optional): Number of notifications (default: 20)

**Response (200):**
```json
{
  "notifications": [
    {
      "id": 789,
      "title": "Class Enrollment Confirmed",
      "message": "Johnny has been successfully enrolled in Introduction to Python Programming",
      "type": "success",
      "priority": "normal",
      "isRead": false,
      "actionUrl": "/enrollments/234",
      "actionLabel": "View Enrollment",
      "createdAt": "2025-11-24T10:30:00Z"
    }
  ],
  "unreadCount": 3,
  "total": 15
}
```

---

#### Mark Notification as Read
```http
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

---

#### Mark All as Read
```http
POST /api/notifications/mark-all-read
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "All notifications marked as read",
  "count": 3
}
```

---

### AI Features

#### Generate Lesson Plan
```http
POST /api/ai/generate-lesson
Authorization: Bearer <token>
Content-Type: application/json

{
  "topic": "Introduction to Fractions",
  "gradeLevel": "4th",
  "duration": "45 minutes",
  "learningObjectives": [
    "Understand what a fraction represents",
    "Identify numerator and denominator"
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "lesson": {
    "title": "Introduction to Fractions",
    "overview": "This lesson introduces students to the concept of fractions...",
    "materials": [
      "Fraction circles",
      "Whiteboard and markers",
      "Worksheets"
    ],
    "activities": [
      {
        "name": "Warm-up: Pizza Party",
        "duration": "10 minutes",
        "description": "Students imagine sharing pizzas equally..."
      },
      {
        "name": "Direct Instruction",
        "duration": "15 minutes",
        "description": "Introduce fraction terminology..."
      }
    ],
    "assessment": "Exit ticket with 5 fraction identification problems",
    "metadata": {
      "model": "claude-opus-4",
      "tokensUsed": 1247,
      "generatedAt": "2025-11-24T10:30:00Z"
    }
  }
}
```

---

## Planned API Endpoints (Phases 1-3)

### Phase 1: Credit System

#### Get Credit Balance
```http
GET /api/credits/balance
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "userId": 123,
  "availableBalance": 275.50,
  "pendingBalance": 45.00,
  "lifetimeEarned": 520.50,
  "lifetimeRedeemed": 200.00,
  "tierLevel": "silver",
  "tierMultiplier": 1.5,
  "nextTierAt": 500,
  "progressToNextTier": 0.85
}
```

---

#### Get Credit History
```http
GET /api/credits/history?page=1&limit=20
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "transactions": [
    {
      "id": 456,
      "transactionType": "earn",
      "amount": 20.00,
      "description": "Referral registration - friend@example.com joined",
      "balanceBefore": 255.50,
      "balanceAfter": 275.50,
      "createdAt": "2025-11-20T10:00:00Z",
      "relatedAction": {
        "type": "referral_registration",
        "refereeEmail": "friend@example.com"
      }
    },
    {
      "id": 455,
      "transactionType": "redeem",
      "amount": -100.00,
      "description": "Applied to tuition payment",
      "balanceBefore": 355.50,
      "balanceAfter": 255.50,
      "createdAt": "2025-11-18T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

#### Redeem Credits
```http
POST /api/credits/redeem
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 100.00,
  "redemptionType": "tuition",
  "targetEntityId": 234
}
```

**Request Body:**
- `amount`: Amount to redeem
- `redemptionType`: "tuition", "merchandise", "event"
- `targetEntityId`: Enrollment ID, product ID, etc.

**Response (200):**
```json
{
  "success": true,
  "message": "$100 credits redeemed successfully",
  "transaction": {
    "id": 789,
    "amount": -100.00,
    "newBalance": 175.50
  },
  "applied": {
    "entityType": "enrollment",
    "entityId": 234,
    "discountApplied": 100.00
  }
}
```

---

#### Get Referral Stats
```http
GET /api/referrals/stats
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "totalReferrals": 12,
  "successful": 8,
  "pending": 4,
  "totalEarned": 340.00,
  "breakdown": {
    "registrations": 5,
    "enrollments": 2,
    "memberships": 1
  },
  "topPerformingLinks": [
    {
      "trackingCode": "ABC123",
      "clicks": 45,
      "conversions": 3,
      "conversionRate": 0.067,
      "earned": 110.00
    }
  ]
}
```

---

#### Generate Referral Link
```http
POST /api/referrals/generate-link
Authorization: Bearer <token>
Content-Type: application/json

{
  "marketingPieceId": 15,
  "sourceChannel": "facebook"
}
```

**Response (200):**
```json
{
  "success": true,
  "trackingCode": "XYZ789",
  "referralUrl": "https://asa-platform.com/register?ref=XYZ789",
  "shortUrl": "https://asa.link/XYZ789",
  "qrCodeUrl": "/qr-codes/XYZ789.png"
}
```

---

#### Get Marketing Hub Pieces
```http
GET /api/marketing-hub/pieces?status=active
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "pieces": [
    {
      "id": 15,
      "title": "Summer Camp 2026 - Early Bird Special",
      "description": "Promote our summer camps with exclusive discount",
      "pieceType": "campaign",
      "imageUrl": "/marketing/summer-camp-2026.jpg",
      "content": "Give your kids an unforgettable summer! Join ASA Summer Camps...",
      "targetClass": {
        "id": 67,
        "name": "STEM Summer Camp"
      },
      "aiGenerated": true,
      "createdAt": "2025-11-15T10:00:00Z",
      "performance": {
        "shares": 47,
        "clicks": 234,
        "conversions": 12,
        "creditsEarned": 280.00
      }
    }
  ],
  "total": 8
}
```

---

#### Track Marketing Click
```http
GET /api/marketing-hub/track-click?code=XYZ789
```

**Note:** This is a public endpoint (no auth) to track anonymous clicks.

**Response (200):**
```json
{
  "success": true,
  "redirectUrl": "/register"
}
```

**Behavior:** Increments click count, then redirects user to registration page.

---

### Phase 2: AI Co-Admin

#### Send Chat Message
```http
POST /api/ai-co-admin/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Create a 20% discount for summer camp classes",
  "conversationId": null
}
```

**Response (200):**
```json
{
  "conversationId": "session-abc123",
  "assistantMessage": "I'll create a 20% discount for summer camp classes. Let me clarify a few details:\n\n1. Which summer camp classes specifically? (You have 3 active)\n2. What should be the expiration date?\n3. Should this apply to all students or only new enrollments?",
  "clarificationsNeeded": [
    {
      "question": "Which classes?",
      "options": [
        "All summer camps",
        "STEM Summer Camp only",
        "Arts & Crafts Camp only"
      ]
    },
    {
      "question": "Expiration date?",
      "type": "date"
    }
  ],
  "requiresApproval": false
}
```

---

#### Send Follow-up Message
```http
POST /api/ai-co-admin/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "All summer camps, expiring July 1st",
  "conversationId": "session-abc123"
}
```

**Response (200):**
```json
{
  "conversationId": "session-abc123",
  "assistantMessage": "Perfect! I'll create a 20% discount for all 3 summer camp classes, expiring July 1st, 2026.\n\nPreview:\n- Discount amount: 20%\n- Applies to: 3 classes (STEM Camp, Arts Camp, Sports Camp)\n- Expiration: July 1, 2026\n- Projected impact: $450 in discounts if all seats fill\n\nShould I proceed?",
  "task": {
    "id": 567,
    "taskType": "create_discount",
    "status": "pending_approval",
    "parameters": {
      "discountType": "percentage",
      "value": 20,
      "applicableClasses": [67, 68, 69],
      "expiresAt": "2026-07-01T00:00:00Z"
    }
  },
  "requiresApproval": true
}
```

---

#### Approve AI Task
```http
POST /api/ai-co-admin/task/:taskId/approve
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Task approved and executed successfully",
  "result": {
    "discountId": 89,
    "appliedToClasses": 3,
    "message": "Discount created successfully and applied to 3 summer camp classes"
  },
  "links": [
    {
      "label": "View Discount",
      "url": "/admin/discounts/89"
    }
  ]
}
```

---

#### Get Daily Brief
```http
GET /api/ai-co-admin/daily-brief
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "date": "2025-11-24",
  "summary": "Your school is performing well today! Here are the highlights:",
  "sections": {
    "attentionNeeded": [
      {
        "type": "enrollment_dip",
        "title": "Art Class enrollment 40% below average",
        "description": "Only 6 of 15 spots filled for 'Painting Basics' starting Dec 1",
        "severity": "medium",
        "suggestedActions": [
          {
            "action": "create_discount",
            "description": "20% discount + email to 47 interested parents"
          }
        ]
      }
    ],
    "insights": [
      {
        "type": "performance_pattern",
        "title": "Tuesday 6pm classes have 90% attendance",
        "description": "This is your best performing time slot",
        "recommendation": "Add 2 more classes at this time"
      }
    ],
    "opportunities": [
      {
        "type": "engagement_spike",
        "title": "12 parents visited Science Fair page 3+ times",
        "description": "High interest but no enrollments yet",
        "suggestedAction": "Send gentle reminder email"
      }
    ],
    "revenue": {
      "monthToDate": 15240.50,
      "vsLastMonth": "+12%",
      "onTrackForGoal": true
    },
    "upcomingActions": [
      {
        "title": "8 membership renewals due this week",
        "status": "Reminders sent",
        "dueDate": "2025-11-30"
      }
    ]
  }
}
```

---

#### Get AI Insights
```http
GET /api/ai-co-admin/insights?status=new
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "insights": [
    {
      "id": 123,
      "insightType": "opportunity",
      "title": "High conversion window detected",
      "description": "Last 3 Thursdays at 2pm saw 40% enrollment spike. Consider scheduling marketing emails for Thursdays.",
      "severity": "medium",
      "actionable": true,
      "suggestedActions": [
        {
          "type": "schedule_campaign",
          "description": "Schedule next email blast for Thursday 2pm"
        }
      ],
      "status": "new",
      "generatedAt": "2025-11-24T08:00:00Z",
      "expiresAt": "2025-11-30T00:00:00Z"
    }
  ],
  "total": 5
}
```

---

### Phase 2: Student Credits & Achievements

#### Get Student Credits
```http
GET /api/students/:studentId/credits/balance
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "studentId": 10,
  "availableBalance": 245.00,
  "lifetimeEarned": 245.00,
  "tierLevel": "rising",
  "tierMultiplier": 1.25,
  "graduationProjectedValue": 2850.00,
  "nextTierAt": 500,
  "progressToNextTier": 0.49,
  "locked": true,
  "unlockDate": "2033-06-01"
}
```

---

#### Get Student Achievement History
```http
GET /api/students/:studentId/achievements
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "achievements": [
    {
      "id": 789,
      "achievementType": "class_complete",
      "achievementName": "Python Programming Master",
      "description": "Completed Introduction to Python with Mastery rating",
      "creditValue": 12.00,
      "multiplierApplied": 1.25,
      "finalAmount": 15.00,
      "class": {
        "id": 45,
        "name": "Introduction to Python Programming"
      },
      "awardedAt": "2025-11-20T16:00:00Z",
      "nftBadge": {
        "id": 234,
        "tokenId": "1234",
        "rarity": "uncommon",
        "imageUrl": "/nfts/python-master-1234.png"
      }
    }
  ],
  "total": 8,
  "breakdown": {
    "classCompletions": 5,
    "characterAwards": 2,
    "specialAchievements": 1
  }
}
```

---

#### Award Achievement (Educator/Admin)
```http
POST /api/students/:studentId/achievements/award
Authorization: Bearer <token>
Content-Type: application/json

{
  "achievementType": "class_complete",
  "achievementName": "Math Master",
  "creditValue": 12.00,
  "classId": 45,
  "metadata": {
    "finalScore": 98,
    "rating": "mastery"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Achievement awarded successfully",
  "achievement": {
    "id": 790,
    "creditValue": 12.00,
    "multiplierApplied": 1.25,
    "finalAmount": 15.00
  },
  "newBalance": 260.00,
  "tierUpdate": null,
  "nftMinting": {
    "status": "queued",
    "message": "NFT badge will be minted within 24 hours"
  }
}
```

---

#### Get Quest Dashboard (Student Portal)
```http
GET /api/students/:studentId/quest-dashboard
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "student": {
    "id": 10,
    "firstName": "Johnny",
    "level": 12,
    "xp": 2450,
    "xpToNextLevel": 550
  },
  "activeQuests": [
    {
      "id": "read-10-books",
      "name": "Bookworm Challenge",
      "description": "Read 10 books this semester",
      "progress": 7,
      "target": 10,
      "reward": "$10 credits",
      "expiresAt": "2026-01-15T00:00:00Z"
    },
    {
      "id": "help-5-students",
      "name": "Helpful Hero",
      "description": "Help 5 classmates with their work",
      "progress": 3,
      "target": 5,
      "reward": "$10 credits"
    }
  ],
  "completedQuests": [
    {
      "id": "complete-python",
      "name": "Python Pioneer",
      "completedAt": "2025-11-20T16:00:00Z",
      "rewardEarned": 15.00
    }
  ],
  "leaderboard": {
    "classRank": 3,
    "classTotal": 15,
    "gradeRank": 12,
    "gradeTotal": 80,
    "schoolRank": 45,
    "schoolTotal": 247
  },
  "aiMentor": {
    "suggestions": [
      "You're close to the next tier! Complete 'Helpful Hero' quest to reach Excellence Scholar.",
      "Try the Science Fair - it's worth 20 credits and matches your interests!"
    ]
  }
}
```

---

### Phase 3: NFT & Crypto

#### Get Student NFT Gallery
```http
GET /api/nft/student/:studentId/badges
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "badges": [
    {
      "id": 234,
      "tokenId": "1234",
      "badgeName": "Python Programming Master",
      "rarity": "uncommon",
      "imageUrl": "/nfts/python-master-1234.png",
      "metadataUri": "ipfs://QmX7k2a...",
      "attributes": [
        {"trait_type": "Achievement", "value": "Python Master"},
        {"trait_type": "Rarity", "value": "Uncommon"},
        {"trait_type": "School", "value": "ASA - Austin"},
        {"trait_type": "Date Earned", "value": "2025-11-20"}
      ],
      "mintedAt": "2025-11-20T17:30:00Z",
      "transactionHash": "0xabc123..."
    }
  ],
  "collectionStats": {
    "totalBadges": 8,
    "byRarity": {
      "common": 5,
      "uncommon": 2,
      "rare": 1,
      "epic": 0,
      "legendary": 0
    },
    "estimatedValue": "0.24 ETH",
    "completionPercentage": 45
  },
  "missingBadges": [
    {
      "badgeName": "Science Fair Winner",
      "rarity": "rare",
      "requirements": "Win a category in the school science fair"
    }
  ]
}
```

---

#### Mint NFT Badge
```http
POST /api/nft/mint-badge
Authorization: Bearer <token>
Content-Type: application/json

{
  "studentId": 10,
  "achievementId": 789
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "NFT minting queued",
  "badge": {
    "id": 235,
    "mintingStatus": "queued",
    "estimatedMintTime": "Within 24 hours"
  },
  "note": "You'll receive a notification when minting is complete"
}
```

---

#### Get Student Wallet
```http
GET /api/wallet/student/:studentId
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "studentId": 10,
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "walletProvider": "magic_link",
  "walletStatus": "locked",
  "unlockDate": "2033-06-01",
  "assets": {
    "nftCount": 8,
    "tokenBalance": 0,
    "estimatedValue": "0.24 ETH"
  },
  "projectedGraduationValue": {
    "credits": 2850.00,
    "tokensAtConversion": 2850,
    "estimatedUSDValue": 5700.00
  },
  "parentControl": {
    "viewingEnabled": true,
    "emergencyUnlockAvailable": false
  }
}
```

---

#### Convert Credits to Tokens
```http
POST /api/token/convert-credits
Authorization: Bearer <token>
Content-Type: application/json

{
  "creditsAmount": 500.00
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Credit conversion initiated",
  "conversion": {
    "id": 123,
    "creditsAmount": 500.00,
    "tokenAmount": 500,
    "conversionRate": 1.0,
    "status": "pending",
    "estimatedCompletion": "2025-11-24T11:00:00Z"
  },
  "note": "Conversion typically completes within 30 minutes"
}
```

---

#### Pay Tuition with Tokens
```http
POST /api/token/pay-tuition
Authorization: Bearer <token>
Content-Type: application/json

{
  "enrollmentId": 234,
  "tokenAmount": 175
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Tuition payment processed successfully",
  "transaction": {
    "id": 456,
    "transactionHash": "0xdef456...",
    "amount": 175,
    "fromAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "toAddress": "0x1234567890abcdef...",
    "gasFee": 0.05,
    "status": "confirmed"
  },
  "enrollment": {
    "id": 234,
    "paymentStatus": "paid"
  }
}
```

---

#### Get Graduation Package
```http
GET /api/graduation/package/:studentId
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "student": {
    "id": 10,
    "name": "Johnny Smith",
    "graduationDate": "2033-06-01"
  },
  "wallet": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "totalBalance": 2850,
    "nftCount": 42
  },
  "breakdown": {
    "classCompletions": 1200.00,
    "levelMastery": 750.00,
    "citizenshipAwards": 450.00,
    "specialAchievements": 350.00,
    "loyaltyBonus": 100.00
  },
  "nftCollection": [
    {
      "tokenId": "1234",
      "name": "Python Master",
      "rarity": "uncommon",
      "imageUrl": "/nfts/python-master-1234.png"
    }
  ],
  "tokenConversion": {
    "creditsConverted": 2850,
    "asaTokensReceived": 2850,
    "conversionRate": 1.0,
    "currentMarketValue": 5700.00
  },
  "educationResources": {
    "walletManagementGuide": "/resources/wallet-guide.pdf",
    "investmentBasics": "/resources/crypto-101.pdf",
    "collegeTuitionPayment": "/resources/tuition-crypto.pdf",
    "taxImplications": "/resources/crypto-taxes.pdf"
  }
}
```

---

## Webhook Endpoints

### Stripe Webhooks

#### Payment Events
```http
POST /api/stripe/webhook
Stripe-Signature: t=1234567890,v1=abc123def456...
Content-Type: application/json

{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_...",
      "payment_intent": "pi_...",
      "customer": "cus_...",
      "amount_total": 30000,
      "metadata": {
        "enrollmentIds": "234,235"
      }
    }
  }
}
```

**Handled Event Types:**
- `checkout.session.completed` - Confirm enrollments
- `payment_intent.succeeded` - Update payment status
- `payment_intent.payment_failed` - Handle failed payments
- `charge.refunded` - Process refunds, reverse credits

**Response (200):**
```json
{
  "received": true
}
```

---

## Rate Limiting

### General API Limits
- **Standard endpoints:** 100 requests per 15 minutes per user
- **AI endpoints:** 10 requests per minute per user
- **NFT minting:** 5 requests per minute per user
- **Public endpoints (tracking):** 1000 requests per 15 minutes per IP

### Rate Limit Headers

All API responses include rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1700834567
```

### Rate Limit Exceeded Response

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 100,
    "retryAfter": 867
  },
  "timestamp": "2025-11-24T10:30:00Z"
}
```

---

## Pagination

### Query Parameters
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

### Pagination Response Format

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 157,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## Best Practices

### Request Best Practices

1. **Always include authentication** for protected endpoints
2. **Use appropriate HTTP methods:**
   - GET: Retrieve data
   - POST: Create resources
   - PATCH: Partial update
   - PUT: Full update
   - DELETE: Remove resources

3. **Set correct Content-Type:**
   ```http
   Content-Type: application/json
   ```

4. **Handle rate limits gracefully:**
   ```javascript
   if (response.status === 429) {
     const retryAfter = response.headers['X-RateLimit-Reset'];
     // Wait and retry
   }
   ```

5. **Implement retry logic for network errors**

6. **Validate input before sending requests**

### Response Best Practices

1. **Check HTTP status codes first**
2. **Parse error responses properly**
3. **Log errors for debugging**
4. **Handle loading and error states in UI**

### Example API Client (TypeScript)

```typescript
class ASAAPIClient {
  private baseURL = 'https://asa-platform.com/api';
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.error, error.code, error.details);
    }

    return response.json();
  }

  // Convenience methods
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async patch<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Usage
const api = new ASAAPIClient();
api.setToken('your-jwt-token');

const balance = await api.get<CreditBalance>('/credits/balance');
const newChild = await api.post<Child>('/parent/children', {
  firstName: 'Sophia',
  lastName: 'Smith',
  dateOfBirth: '2018-05-10'
});
```

---

**Document Control**
- Document Type: API Documentation
- Version: 2.0
- Status: Draft
- Created: November 24, 2025
- Last Updated: November 24, 2025
- Next Review: December 1, 2025
- Owner: API Team
- Approvers: CTO, Backend Lead
