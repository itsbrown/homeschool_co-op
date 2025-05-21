# ASA Platform System Architecture

## Overview

The ASA Platform is an Adaptive AI-Driven Curriculum Generation and Learning Management System designed with a modern, layered architecture that emphasizes scalability, maintainability, and extensibility. This document details the system architecture, its components, and their interactions.

## Architecture Layers

The system is structured into five primary layers:

### 1. Client Layer

The client layer provides the user interface and handles all user interactions.

**Key Components:**
- **React Frontend**: Built with React 18 and TypeScript 5.x for type safety and component reusability
- **UI Component System**: Utilizes Shadcn/UI components built on Radix UI primitives with Tailwind CSS
- **State Management**: Combination of React Query for server state and Context API for global UI state
- **Routing**: Wouter for client-side navigation with role-based access controls
- **Form Handling**: React Hook Form with Zod schema validation

**Design Patterns:**
- Component composition for UI reusability
- Custom hooks for encapsulating complex logic
- Container/presenter pattern for separating data and presentation concerns
- Proper error boundary implementation for resilience

### 2. API Layer

The API layer acts as the interface between the client and the business logic, handling all HTTP requests.

**Key Components:**
- **Express.js Server**: Node.js server with TypeScript running Express 4.x
- **RESTful API Design**: Consistent endpoint structure following REST principles
- **Middleware Stack**: Authentication, validation, error handling, and logging
- **Request Handlers**: Controllers organized by resource and functionality
- **Response Formatting**: Standardized response structure with proper status codes

**Design Patterns:**
- Middleware chain for cross-cutting concerns
- Controller pattern for request handling
- Repository pattern for data access abstraction
- Error handling middleware for consistent error responses

### 3. Service Layer

The service layer contains the core business logic and integrates with external services.

**Key Components:**
- **AI Service Adapters**: Abstraction over AI providers (OpenAI, Anthropic, HuggingFace)
- **Content Generation Services**: Lessons, worksheets, and educational activities
- **Document Processing**: PDF generation and OCR processing
- **Storage Services**: File and image storage management
- **Payment Services**: Integration with Stripe for billing and subscriptions

**Design Patterns:**
- Adapter pattern for AI service integration
- Strategy pattern for selecting appropriate AI models
- Factory pattern for creating appropriate content generators
- Facade pattern for simplifying complex service interactions

### 4. Data Layer

The data layer handles all aspects of data persistence and retrieval.

**Key Components:**
- **Drizzle ORM**: Type-safe database access and query building
- **Data Repositories**: Encapsulated data access logic by entity
- **Schema Validation**: Zod schemas for data validation and transformation
- **Migration Management**: Schema evolution and version control

**Design Patterns:**
- Repository pattern for data access abstraction
- Unit of work pattern for transaction management
- Schema-based validation for data integrity
- Query object pattern for complex queries

### 5. Infrastructure Layer

The infrastructure layer provides the foundational system components and external service integrations.

**Key Components:**
- **PostgreSQL Database**: Primary data store (using Neon Serverless Postgres)
- **Google Cloud Integration**: Document AI and Cloud Storage
- **Authentication Provider**: Replit Auth with OpenID Connect
- **Payment Processing**: Stripe API integration
- **Deployment Platform**: Replit deployment infrastructure

**Design Patterns:**
- Connection pooling for database efficiency
- Circuit breaker pattern for external service resilience
- Retry pattern with exponential backoff for transient failures
- Feature flagging for controlled rollouts

## Cross-Cutting Concerns

Several aspects span across multiple layers:

### Authentication & Authorization

- **Authentication**: OpenID Connect with Replit Auth
- **Session Management**: Express sessions with PostgreSQL session store
- **Authorization**: Role-based access control (RBAC) with six primary roles
- **Permission Enforcement**: Middleware-based permission checks at API level

### Error Handling

- **Client-Side Error Handling**: React error boundaries, query error states
- **API Error Standardization**: Consistent error response format
- **Service Layer Failures**: Proper exception handling with logging
- **External Service Errors**: Retry logic with exponential backoff

### Logging & Monitoring

- **Request Logging**: HTTP request/response logging
- **Error Logging**: Structured error logging with context
- **Performance Metrics**: Monitoring for critical operations
- **AI Service Usage**: Tracking of AI model usage and costs

## Key Data Flows

### User Authentication Flow

1. User submits login credentials
2. Authentication request is sent to API
3. API delegates to authentication middleware
4. Authentication provider validates credentials
5. On success, session is created and stored
6. Session token is returned to client
7. Client stores token for subsequent requests

### Content Generation Flow

1. User requests AI-generated content (lesson, worksheet, etc.)
2. Request parameters are sent to API
3. API validates request and authorizes user
4. Service layer selects appropriate AI provider
5. AI request is constructed and sent to provider
6. Response is processed and enhanced
7. Generated content is stored and organized
8. Content reference is returned to client

### Payment Processing Flow

1. User initiates payment or subscription
2. Frontend creates payment intent via API
3. API communicates with Stripe to create payment session
4. User completes payment in secured context
5. Stripe sends webhook notification of payment
6. API processes webhook and updates user access
7. User gains access to paid features

## System Integration Points

### AI Provider Integration

- **OpenAI API**: Primary LLM for content generation
- **Anthropic Claude API**: Secondary LLM for fallback and specialized tasks
- **HuggingFace Inference API**: Specialized model access
- **Google Document AI**: OCR and document understanding

### Storage Integration

- **Google Cloud Storage**: Cloud-based file storage
- **Local File System**: Development environment storage
- **Content Delivery**: Optimized file serving for educational content

### Payment Integration

- **Stripe API**: Payment processing and subscription management
- **Customer Management**: User-payment relationship tracking
- **Subscription Handling**: Recurring billing and access control

## Resilience Strategies

### Error Recovery

- **Graceful Degradation**: Fallback to alternative services when primary fails
- **Retry Mechanisms**: Automatic retry for transient failures
- **Circuit Breaking**: Preventing cascading failures
- **Fallback Content**: Pre-generated content when AI services are unavailable

### Data Integrity

- **Validation**: Schema-based validation at multiple levels
- **Transactions**: ACID compliance for critical operations
- **Audit Logging**: Tracking of significant data changes
- **Backup Strategy**: Regular database backups

## Performance Considerations

### Frontend Performance

- **Code Splitting**: Route-based lazy loading
- **Memoization**: Caching expensive computations
- **Virtualization**: Efficient rendering of large lists
- **Asset Optimization**: Image and static resource optimization

### Backend Performance

- **Database Indexing**: Optimized query performance
- **Connection Pooling**: Efficient database connection management
- **Caching**: Response caching for frequently accessed data
- **Async Processing**: Background processing for heavy tasks

### AI Service Optimization

- **Prompt Optimization**: Efficient prompts to minimize token usage
- **Model Selection**: Appropriate model choice based on task complexity
- **Caching Generated Content**: Reusing previously generated content
- **Batch Processing**: Combining similar requests when possible

## Conclusion

The ASA Platform employs a modern, layered architecture that balances flexibility, maintainability, and performance. The clear separation of concerns across layers facilitates easier development, testing, and evolution of the system while enabling powerful AI-driven educational capabilities.