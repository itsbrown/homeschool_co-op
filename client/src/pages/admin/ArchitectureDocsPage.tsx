import React, { useState } from 'react';
import { useNavigate } from 'wouter';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from '@/components/ui/button';
import { 
  FileDown, 
  FileText, 
  Globe, 
  Code, 
  Database, 
  Box, 
  Users, 
  Shield, 
  Zap,
  BookOpen,
  Settings,
  RefreshCw,
  ExternalLink,
  Search,
  Layers
} from 'lucide-react';
import { marked } from 'marked';

// Sample docs content - this would typically be fetched from an API or imported from MD files
const architectureDocsContent = `
# ASA Platform System Architecture

## Overview

The ASA Platform is an Adaptive AI-Driven Curriculum Generation and Learning Management System designed with a modern, layered architecture that emphasizes scalability, maintainability, and extensibility.

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

### 2. API Layer

The API layer acts as the interface between the client and the business logic, handling all HTTP requests.

**Key Components:**
- **Express.js Server**: Node.js server with TypeScript running Express 4.x
- **RESTful API Design**: Consistent endpoint structure following REST principles
- **Middleware Stack**: Authentication, validation, error handling, and logging
- **Request Handlers**: Controllers organized by resource and functionality
- **Response Formatting**: Standardized response structure with proper status codes

### 3. Service Layer

The service layer contains the core business logic and integrates with external services.

**Key Components:**
- **AI Service Adapters**: Abstraction over AI providers (OpenAI, Anthropic, HuggingFace)
- **Content Generation Services**: Lessons, worksheets, and educational activities
- **Document Processing**: PDF generation and OCR processing
- **Storage Services**: File and image storage management
- **Payment Services**: Integration with Stripe for billing and subscriptions

### 4. Data Layer

The data layer handles all aspects of data persistence and retrieval.

**Key Components:**
- **Drizzle ORM**: Type-safe database access and query building
- **Data Repositories**: Encapsulated data access logic by entity
- **Schema Validation**: Zod schemas for data validation and transformation
- **Migration Management**: Schema evolution and version control
`;

const devDocsContent = `
# ASA Platform Development Guidelines

## Development Setup

### Prerequisites

- Node.js 20.x or higher
- TypeScript 5.x
- PostgreSQL 15.x (or Neon Serverless access)
- Git

### Getting Started

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Set up environment variables (see \`.env.example\`)
4. Start the development server: \`npm run dev\`

## Coding Standards

### TypeScript Best Practices

- Use proper type definitions
- Avoid \`any\` type when possible
- Use interfaces for object shapes
- Use type guards for runtime type checking

### React Best Practices

- Use functional components with hooks
- Avoid prop drilling with context
- Use Suspense and error boundaries
- Implement proper cleanup in useEffect

### API Design

- Follow RESTful resource naming
- Provide consistent error responses
- Document all endpoints
- Implement versioning strategy

## Architecture Patterns

### Frontend Patterns

- Component composition for UI reusability
- Custom hooks for logic encapsulation
- Container/presenter pattern
- Error boundary implementation

### Backend Patterns

- Middleware chain for cross-cutting concerns
- Controller pattern for request handling
- Repository pattern for data access
- Service layer for business logic

## Testing Strategy

### Unit Testing

- Test business logic in isolation
- Mock external dependencies
- Test edge cases and error conditions
- Use Jest for testing framework

### Integration Testing

- Test API endpoints with database integration
- Test frontend components with API mocks
- Verify authentication and authorization flows
- Test error handling and recovery

### End-to-End Testing

- Test critical user flows
- Verify cross-component interactions
- Test browser compatibility
- Test responsive design
`;

const aiDocsContent = `
# AI Integration in ASA Platform

## Overview

The ASA Platform leverages multiple AI providers to deliver intelligent educational content and features. This document outlines the AI integration architecture, providers, and implementation patterns.

## AI Providers

### OpenAI GPT Models

- **Primary Use**: Content generation, educational activities, text analysis
- **Model**: gpt-4o (latest multimodal model)
- **Alternative Models**: gpt-3.5-turbo for less complex tasks
- **Integration Point**: OpenAI API with Node.js client

### Anthropic Claude

- **Primary Use**: Backup content generation, specialized educational content
- **Model**: claude-3-7-sonnet (latest model)
- **Integration Point**: Anthropic API with Node.js client

### HuggingFace Models

- **Primary Use**: Specialized ML tasks, image recognition, sentiment analysis
- **Models**: Various task-specific models
- **Integration Point**: HuggingFace Inference API

### Google Document AI

- **Primary Use**: OCR, document understanding, content extraction
- **Integration Point**: Google Cloud client libraries

## Integration Patterns

### Adapter Pattern

Each AI provider is wrapped in an adapter to provide a consistent interface:

\`\`\`typescript
interface AIModelAdapter {
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  analyzeImage?(imageData: Buffer): Promise<AnalysisResult>;
  extractDocument?(document: Buffer): Promise<ExtractedContent>;
}
\`\`\`

### Fallback Strategy

The system implements a fallback strategy to handle API rate limits and service outages:

1. Attempt with primary provider (OpenAI)
2. On failure, retry with exponential backoff
3. If persistent failure, switch to secondary provider (Anthropic)
4. If all providers fail, use cached content or show error

### Content Enhancement Pipeline

Generated content passes through an enhancement pipeline:

1. Raw content generation from AI provider
2. Post-processing for formatting and structure
3. Educational quality checks
4. Metadata enrichment
5. Media generation (images, diagrams)
6. Final assembly into deliverable format

## Best Practices

### Prompt Engineering

- Use consistent prompt templates
- Include clear instructions and examples
- Implement system prompts for consistent behavior
- Test and iterate on prompts for quality

### Response Handling

- Validate AI responses for quality
- Implement content safety filters
- Process and format responses for consistency
- Handle and log unexpected outputs

### Performance Optimization

- Cache frequently requested content
- Implement request batching when appropriate
- Select appropriate models based on task complexity
- Monitor and optimize token usage
`;

const databaseDocsContent = `
# Database Schema and Design

## Overview

The ASA Platform uses PostgreSQL as its primary database, with Drizzle ORM for type-safe database access and schema management. This document outlines the database schema, relationships, and design patterns.

## Database Schema

### Users

\`\`\`typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
\`\`\`

### Schools

\`\`\`typescript
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
\`\`\`

### Classes

\`\`\`typescript
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
\`\`\`

### Knowledge Bases

\`\`\`typescript
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
\`\`\`

## Entity Relationships

- **Users to Schools**: Many-to-many through school_members table
- **Schools to Classes**: One-to-many
- **Users to Classes**: Many-to-many through enrollments table
- **Users to Knowledge Bases**: One-to-many (creator relationship)
- **Schools to Knowledge Bases**: One-to-many

## Data Access Patterns

### Repository Pattern

Each entity has a dedicated repository for data access:

\`\`\`typescript
interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  create(user: InsertUser): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | undefined>;
  delete(id: string): Promise<boolean>;
}
\`\`\`

### Query Optimization

- Proper indexing on frequently queried columns
- Eager loading of related data to avoid N+1 problems
- Pagination for large result sets
- Optimized join queries for complex data relationships

## Migration Strategy

- Schema changes are managed through Drizzle Kit
- Migrations are version-controlled and reversible
- Database changes are applied using \`npm run db:push\` command
- Data seeding for development and testing environments
`;

const apiDocsContent = `
# API Documentation

## Overview

The ASA Platform exposes a RESTful API for client-server communication. This document outlines the available endpoints, request/response formats, and authentication requirements.

## Authentication

All authenticated endpoints require a valid session token, obtained through the login process.

### Login

\`\`\`
POST /api/auth/login
\`\`\`

**Request Body:**
\`\`\`json
{
  "username": "string",
  "password": "string"
}
\`\`\`

**Response:**
\`\`\`json
{
  "message": "Login successful",
  "user": {
    "id": "string",
    "email": "string",
    "role": "string"
  }
}
\`\`\`

### Current User

\`\`\`
GET /api/auth/me
\`\`\`

**Response:**
\`\`\`json
{
  "id": "string",
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "role": "string"
}
\`\`\`

## Schools API

### List Schools

\`\`\`
GET /api/schools
\`\`\`

**Query Parameters:**
- \`page\`: Page number (default: 1)
- \`limit\`: Results per page (default: 10)
- \`search\`: Search term

**Response:**
\`\`\`json
{
  "items": [
    {
      "id": "number",
      "name": "string",
      "address": "string",
      "city": "string",
      "state": "string",
      "zipCode": "string",
      "phone": "string",
      "email": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "total": "number",
  "page": "number",
  "limit": "number",
  "totalPages": "number"
}
\`\`\`

### Get School

\`\`\`
GET /api/schools/:id
\`\`\`

**Response:**
\`\`\`json
{
  "id": "number",
  "name": "string",
  "address": "string",
  "city": "string",
  "state": "string",
  "zipCode": "string",
  "phone": "string",
  "email": "string",
  "website": "string",
  "logo": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
\`\`\`

## Classes API

### List Classes

\`\`\`
GET /api/classes
\`\`\`

**Query Parameters:**
- \`page\`: Page number (default: 1)
- \`limit\`: Results per page (default: 10)
- \`search\`: Search term
- \`category\`: Filter by category
- \`status\`: Filter by status

**Response:**
\`\`\`json
{
  "items": [
    {
      "id": "number",
      "title": "string",
      "description": "string",
      "category": "string",
      "gradeLevel": "string",
      "startDate": "string",
      "endDate": "string",
      "schedule": "string",
      "capacity": "number",
      "location": "string",
      "instructorName": "string",
      "price": "number",
      "status": "string",
      "enrollmentCount": "number",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "total": "number",
  "page": "number",
  "limit": "number",
  "totalPages": "number"
}
\`\`\`

## AI Services API

### Generate Lesson

\`\`\`
POST /api/ai/generate-lesson
\`\`\`

**Request Body:**
\`\`\`json
{
  "title": "string",
  "subject": "string",
  "gradeLevel": "string",
  "duration": "number",
  "objectives": ["string"],
  "knowledgeBaseIds": ["number"]
}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "string",
  "title": "string",
  "content": "string",
  "sections": [
    {
      "title": "string",
      "content": "string"
    }
  ],
  "activities": [
    {
      "title": "string",
      "type": "string",
      "content": "string"
    }
  ],
  "resources": [
    {
      "title": "string",
      "type": "string",
      "url": "string"
    }
  ]
}
\`\`\`

### Generate Worksheet

\`\`\`
POST /api/ai/generate-worksheet
\`\`\`

**Request Body:**
\`\`\`json
{
  "title": "string",
  "type": "coloring|crossword|word-search|spot-difference",
  "subject": "string",
  "gradeLevel": "string",
  "topic": "string",
  "knowledgeBaseIds": ["number"]
}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "string",
  "title": "string",
  "type": "string",
  "pdfUrl": "string",
  "previewUrl": "string"
}
\`\`\`

## Error Responses

All API endpoints return standardized error responses:

\`\`\`json
{
  "message": "Error message describing the issue",
  "code": "ERROR_CODE",
  "details": {
    // Optional additional error details
  }
}
\`\`\`

Common HTTP status codes:
- \`400\`: Bad Request - Invalid input
- \`401\`: Unauthorized - Authentication required
- \`403\`: Forbidden - Insufficient permissions
- \`404\`: Not Found - Resource not found
- \`500\`: Internal Server Error - Server failure
`;

const ArchitectureDocsPage = () => {
  const [, navigate] = useState();
  const [currentDoc, setCurrentDoc] = useState('architecture');

  // Render markdown content to HTML
  const renderMarkdown = (content: string) => {
    return { __html: marked(content) };
  };

  // Get the appropriate content based on the current tab
  const getDocContent = () => {
    switch(currentDoc) {
      case 'architecture':
        return architectureDocsContent;
      case 'development':
        return devDocsContent;
      case 'ai':
        return aiDocsContent;
      case 'database':
        return databaseDocsContent;
      case 'api':
        return apiDocsContent;
      default:
        return architectureDocsContent;
    }
  };

  return (
    <AdminLayout pageTitle="Architecture Documentation">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-2">Architecture Documentation</h1>
        <p className="text-muted-foreground mb-8">
          Comprehensive documentation of the ASA Platform architecture, development guidelines, and implementation details
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Documentation</CardTitle>
                <CardDescription>Browse documentation topics</CardDescription>
              </CardHeader>
              <CardContent>
                <nav className="space-y-1">
                  <Button 
                    variant={currentDoc === 'architecture' ? 'default' : 'ghost'} 
                    className="w-full justify-start"
                    onClick={() => setCurrentDoc('architecture')}
                  >
                    <Layers className="h-4 w-4 mr-2" />
                    System Architecture
                  </Button>
                  <Button 
                    variant={currentDoc === 'development' ? 'default' : 'ghost'} 
                    className="w-full justify-start"
                    onClick={() => setCurrentDoc('development')}
                  >
                    <Code className="h-4 w-4 mr-2" />
                    Development Guidelines
                  </Button>
                  <Button 
                    variant={currentDoc === 'ai' ? 'default' : 'ghost'} 
                    className="w-full justify-start"
                    onClick={() => setCurrentDoc('ai')}
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    AI Integration
                  </Button>
                  <Button 
                    variant={currentDoc === 'database' ? 'default' : 'ghost'} 
                    className="w-full justify-start"
                    onClick={() => setCurrentDoc('database')}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Database Schema
                  </Button>
                  <Button 
                    variant={currentDoc === 'api' ? 'default' : 'ghost'} 
                    className="w-full justify-start"
                    onClick={() => setCurrentDoc('api')}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    API Documentation
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start mt-6"
                    onClick={() => navigate('/admin/architecture')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Architecture Diagrams
                  </Button>
                </nav>
              </CardContent>
            </Card>
            
            <div className="mt-4">
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-lg">Additional Resources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="ghost" className="w-full justify-start">
                    <FileDown className="h-4 w-4 mr-2" />
                    Download Documentation
                  </Button>
                  <Button variant="ghost" className="w-full justify-start">
                    <Search className="h-4 w-4 mr-2" />
                    Search Documentation
                  </Button>
                  <Button variant="ghost" className="w-full justify-start">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Version History
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {currentDoc === 'architecture' && 'System Architecture'}
                    {currentDoc === 'development' && 'Development Guidelines'}
                    {currentDoc === 'ai' && 'AI Integration'}
                    {currentDoc === 'database' && 'Database Schema'}
                    {currentDoc === 'api' && 'API Documentation'}
                  </CardTitle>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
                <CardDescription>
                  {currentDoc === 'architecture' && 'Core system architecture and components'}
                  {currentDoc === 'development' && 'Guidelines for development and coding standards'}
                  {currentDoc === 'ai' && 'AI service integration patterns and implementation'}
                  {currentDoc === 'database' && 'Database schema design and relationships'}
                  {currentDoc === 'api' && 'API endpoints and usage instructions'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div 
                    className="prose max-w-none dark:prose-invert prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg"
                    dangerouslySetInnerHTML={renderMarkdown(getDocContent())}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default ArchitectureDocsPage;