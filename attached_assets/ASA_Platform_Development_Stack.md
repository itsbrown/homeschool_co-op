# ASA Platform Development Stack

## Overview

The Adaptive AI-Driven Curriculum Generation and Learning Management System (ASA Platform) is built on a modern, scalable technology stack designed to support personalized educational experiences through intelligent technology. This document outlines the complete technology stack, architecture, and implementation details.

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI library for building component-based interfaces |
| TypeScript | 5.x | Strongly typed programming language |
| Vite | 4.x | Build tool and development server |
| TanStack Query (React Query) | 5.x | Data fetching and state management |
| Wouter | 2.x | Client-side routing library |
| React Hook Form | 7.x | Form validation and handling |
| Zod | 3.x | Schema validation |
| Tailwind CSS | 3.x | Utility-first CSS framework |
| Shadcn/UI | 0.x | Component library built on Radix UI |
| Lucide React | 0.x | Icon library |
| React Icons | 4.x | Additional icon sets |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime environment |
| Express | 4.x | Web server framework |
| TypeScript | 5.x | Strongly typed programming language |
| Drizzle ORM | 0.x | Database ORM with TypeScript support |
| Drizzle Kit | 0.x | Migration and schema management tools |
| Express Session | 1.x | Session management |
| Passport.js | 0.x | Authentication middleware |
| connect-pg-simple | 8.x | PostgreSQL session store |
| Multer | 1.x | File upload handling |
| PDFKit | 0.x | PDF generation library |
| Sharp | 0.x | Image processing |

### Database

| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 15.x | Primary relational database |
| Neon Serverless Postgres | - | Managed database service for deployments |

### AI Services

| Technology | Version | Purpose |
|------------|---------|---------|
| OpenAI API | gpt-4o | Primary large language model for content generation |
| Anthropic/Claude API | claude-3-7-sonnet | Alternative LLM for fallback and specialized tasks |
| HuggingFace Inference API | - | AI model access for specific tasks |
| Google Cloud Document AI | - | OCR and document processing |

### Storage

| Technology | Version | Purpose |
|------------|---------|---------|
| Google Cloud Storage | - | Cloud storage for files and documents |
| Local File System | - | Development storage for files |

### Payment Processing

| Technology | Version | Purpose |
|------------|---------|---------|
| Stripe | - | Payment processing for subscriptions and one-time payments |

### Authentication & Authorization

| Technology | Version | Purpose |
|------------|---------|---------|
| Replit Auth | - | OpenID Connect authentication provider |
| Custom RBAC | - | Role-Based Access Control implementation |

### DevOps

| Technology | Version | Purpose |
|------------|---------|---------|
| Replit | - | Development and deployment platform |

## Architecture

The ASA Platform follows a modern web application architecture pattern with these key components:

### 1. Client Layer

The client layer is built with React and TypeScript, providing a responsive and interactive user interface. Key architectural patterns include:

- **Component-Based Structure**: Modular UI components organized by feature and responsibility
- **Custom Hooks**: Reusable logic encapsulated in custom React hooks
- **Context Providers**: Global state management for authentication, AI status, and theme
- **Route-Based Code Splitting**: Optimal loading performance through code splitting

### 2. API Layer

The API layer is implemented using Express.js and TypeScript, handling all HTTP requests from the client. Key patterns include:

- **RESTful API Design**: Standard HTTP methods and resource-oriented endpoints
- **Middleware Architecture**: Authentication, validation, error handling via middleware
- **Controller Pattern**: Request handlers separated by resource and responsibility

### 3. Service Layer

The service layer contains business logic and integrations with external services:

- **AI Service Integration**: Abstract interfaces for OpenAI, Anthropic, and HuggingFace
- **Storage Service**: Abstract interfaces for file storage (local and cloud)
- **Email Service**: Notification and communication services
- **Document Generation**: PDF and worksheet generation logic

### 4. Data Layer

The data layer handles data persistence and retrieval:

- **ORM Abstraction**: Drizzle ORM for database operations
- **Repository Pattern**: Data access logic separated by entity
- **Schema Validation**: Zod schemas for data validation
- **Migration Management**: Drizzle Kit for schema evolution

## Database Schema

The primary entities in the database schema include:

### Users

```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Schools

```typescript
export const schools = pgTable("schools", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  address: varchar("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  phone: varchar("phone"),
  email: varchar("email"),
  website: varchar("website"),
  logo: varchar("logo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Classes

```typescript
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  category: varchar("category").notNull(),
  gradeLevel: varchar("grade_level"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  schedule: varchar("schedule"),
  capacity: integer("capacity"),
  location: varchar("location"),
  instructorName: varchar("instructor_name"),
  instructorId: integer("instructor_id").references(() => users.id),
  price: numeric("price"),
  status: varchar("status").default("draft"),
  schoolId: integer("school_id").references(() => schools.id),
  enrollmentCount: integer("enrollment_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Knowledge Bases

```typescript
export const knowledgeBases = pgTable("knowledge_bases", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  subjectArea: varchar("subject_area").notNull(),
  gradeLevels: varchar("grade_levels").array().notNull(),
  visibility: varchar("visibility").default("private").notNull(),
  status: varchar("status").default("draft").notNull(),
  creatorId: integer("creator_id").references(() => users.id),
  schoolId: integer("school_id").references(() => schools.id),
  fileCount: integer("file_count").default(0),
  sizeInBytes: bigint("size_in_bytes").default(0),
  tags: varchar("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Sessions (for authentication)

```typescript
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
```

## API Endpoints

The platform exposes these primary API endpoint groups:

### Authentication

- `POST /api/auth/login` - Authenticate user
- `GET /api/auth/me` - Get current user information
- `POST /api/auth/logout` - Log out user
- `GET /api/auth/callback` - OAuth callback handler

### Users

- `GET /api/users` - List users (admin only)
- `GET /api/users/:id` - Get user details
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Schools

- `GET /api/schools` - List schools
- `GET /api/schools/:id` - Get school details
- `POST /api/schools` - Register new school
- `PUT /api/schools/:id` - Update school
- `DELETE /api/schools/:id` - Delete school

### Classes

- `GET /api/classes` - List classes
- `GET /api/classes/:id` - Get class details
- `POST /api/classes` - Create new class
- `PUT /api/classes/:id` - Update class
- `DELETE /api/classes/:id` - Delete class

### Knowledge Base

- `GET /api/knowledge-bases` - List knowledge bases
- `GET /api/knowledge-bases/:id` - Get knowledge base details
- `POST /api/knowledge-bases` - Create knowledge base
- `PUT /api/knowledge-bases/:id` - Update knowledge base
- `DELETE /api/knowledge-bases/:id` - Delete knowledge base

### AI Services

- `POST /api/ai/generate-lesson` - Generate lesson plan
- `POST /api/ai/generate-worksheet` - Generate worksheet
- `POST /api/ai/ocr-document` - Process document with OCR
- `GET /api/ai/status` - Check AI service status

### School Admin

- `GET /api/school-admin/my-school` - Get current admin's school
- `GET /api/school-admin/classes` - Get classes for admin's school
- `POST /api/school-admin/classes` - Create class in admin's school
- `GET /api/school-admin/staff` - Get staff for admin's school
- `POST /api/school-admin/staff/invite` - Invite staff to school
- `GET /api/school-admin/staff/positions` - Get staff positions
- `POST /api/school-admin/staff/positions` - Create staff position

## Integration Points

The platform integrates with several external services:

### AI Model Integration

Integration with OpenAI, Anthropic, and HuggingFace is handled through abstracted service classes that provide a consistent interface for:

- Text generation
- Image analysis
- Document understanding
- Content summarization

Each AI provider has a dedicated client implementation with appropriate error handling, rate limiting, and fallback mechanisms.

### Document AI Integration

Google Cloud Document AI is integrated for OCR and document processing capabilities:

- PDF document analysis
- Text extraction from images
- Document classification
- Entity extraction

### Payment Integration

Stripe integration handles payment processing:

- Subscription management
- One-time payments
- Payment method storage
- Invoicing

### Authentication Integration

Replit Auth provides OpenID Connect authentication:

- User identity verification
- Session management
- Profile information retrieval

## Development Workflow

The development workflow follows these patterns:

1. **Feature Development**:
   - Create feature branch
   - Implement backend endpoints
   - Implement frontend components
   - Write integration tests
   - PR review and merge

2. **Deployment Pipeline**:
   - PR merge triggers deployment
   - Database migrations run automatically
   - Static assets are built and deployed
   - Services are restarted

3. **Testing Strategy**:
   - Unit tests for core business logic
   - Integration tests for API endpoints
   - E2E tests for critical user flows

## Performance Considerations

Key performance optimizations include:

1. **Query Optimization**:
   - Proper indexing on database tables
   - Eager loading of related data
   - Pagination for large result sets

2. **Frontend Performance**:
   - Code splitting by route
   - Lazy loading of components
   - Memoization of expensive computations
   - Optimistic UI updates

3. **API Performance**:
   - Response caching
   - Request debouncing
   - Batch processing for bulk operations

4. **AI Integration Performance**:
   - Background processing for long-running AI tasks
   - Caching of AI-generated content
   - Progressive loading of AI content

## Security Considerations

The platform implements these security measures:

1. **Authentication Security**:
   - OAuth 2.0 / OpenID Connect for authentication
   - Secure cookie handling
   - CSRF protection
   - Session expiration and renewal

2. **Authorization Security**:
   - Role-based access control
   - Resource-level permissions
   - Input validation on all endpoints

3. **Data Security**:
   - Database encryption
   - Secure transmission over HTTPS
   - Sensitive data handling according to GDPR/FERPA

4. **Infrastructure Security**:
   - Regular security updates
   - Access control for infrastructure
   - Security monitoring and alerts

## Scalability Considerations

The architecture supports scalability through:

1. **Horizontal Scaling**:
   - Stateless API design
   - Database connection pooling
   - Load balancing capability

2. **Vertical Scaling**:
   - Efficient resource utilization
   - Performance monitoring
   - Resource allocation optimization

3. **Data Scaling**:
   - Database indexing strategy
   - Data archiving for historical data
   - Query optimization for large datasets

## Future Extension Points

The platform architecture is designed for extensibility in these areas:

1. **Additional AI Providers**:
   - The AI service abstraction allows for easy integration of additional AI providers

2. **Additional Content Types**:
   - The content model is extensible to support new educational content types

3. **Integration Expansion**:
   - Additional third-party integrations can be added through the service layer

4. **Mobile Applications**:
   - The API is designed to support mobile clients in the future

5. **Analytics Expansion**:
   - The data model supports additional analytics and reporting capabilities

## Development Guidelines

### Coding Standards

1. **TypeScript Best Practices**:
   - Use proper type definitions
   - Avoid any type when possible
   - Use interfaces for object shapes
   - Use type guards for runtime type checking

2. **React Best Practices**:
   - Use functional components with hooks
   - Avoid prop drilling with context
   - Use suspense and error boundaries
   - Implement proper cleanup in useEffect

3. **API Design**:
   - RESTful resource naming
   - Consistent error responses
   - Comprehensive documentation
   - Versioning strategy

### Documentation

The codebase is documented through:

1. **Code Comments**:
   - JSDoc style comments for functions
   - Complex logic explanation
   - Interface and type documentation

2. **API Documentation**:
   - OpenAPI/Swagger documentation
   - Example requests and responses
   - Error documentation

3. **Architecture Documentation**:
   - High-level architecture diagrams
   - Component interaction documentation
   - Decision records for major choices

## Conclusion

The ASA Platform development stack combines modern frontend technologies with a robust backend infrastructure, leveraging AI capabilities to deliver an adaptive learning management system. The architecture is designed for maintainability, scalability, and extensibility, allowing for future growth and enhancement of the platform's capabilities.