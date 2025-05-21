import React from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import ArchitectureDiagram from '@/components/diagrams/ArchitectureDiagram';
import SystemArchitectureSVG from '@/components/diagrams/SystemArchitectureSVG';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from "@/components/ui/scroll-area";

const ArchitecturePage = () => {
  return (
    <AdminLayout pageTitle="Platform Architecture">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-2">ASA Platform Architecture</h1>
        <p className="text-muted-foreground mb-8">
          Comprehensive architectural overview of the Adaptive AI-Driven Curriculum Generation and Learning Management System
        </p>
        
        <Tabs defaultValue="visual">
          <TabsList className="mb-6">
            <TabsTrigger value="visual">Visual Architecture</TabsTrigger>
            <TabsTrigger value="tech-stack">Technology Stack</TabsTrigger>
            <TabsTrigger value="data-flow">Data Flow</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>
          
          {/* Visual Architecture Diagram Tab */}
          <TabsContent value="visual">
            <Card>
              <CardHeader>
                <CardTitle>Visual Architecture Diagram</CardTitle>
                <CardDescription>
                  The layered architecture of the ASA Platform showing all major components and their relationships
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ArchitectureDiagram />
                <div className="mt-8 pt-6 border-t">
                  <h3 className="text-xl font-bold mb-4">System Architecture Diagram</h3>
                  <p className="text-muted-foreground mb-4">
                    Comprehensive system architecture showing all layers and their interactions
                  </p>
                  <div className="mt-4">
                    <SystemArchitectureSVG />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Technology Stack Tab */}
          <TabsContent value="tech-stack">
            <Card>
              <CardHeader>
                <CardTitle>Technology Stack</CardTitle>
                <CardDescription>
                  The complete technology stack used in building the ASA Platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-6">
                    {/* Frontend Stack */}
                    <div>
                      <h3 className="text-xl font-bold mb-3">Frontend Stack</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-muted">
                              <th className="border p-2 text-left">Technology</th>
                              <th className="border p-2 text-left">Version</th>
                              <th className="border p-2 text-left">Purpose</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border p-2">React</td>
                              <td className="border p-2">18.x</td>
                              <td className="border p-2">UI library for building component-based interfaces</td>
                            </tr>
                            <tr>
                              <td className="border p-2">TypeScript</td>
                              <td className="border p-2">5.x</td>
                              <td className="border p-2">Strongly typed programming language</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Vite</td>
                              <td className="border p-2">4.x</td>
                              <td className="border p-2">Build tool and development server</td>
                            </tr>
                            <tr>
                              <td className="border p-2">TanStack Query</td>
                              <td className="border p-2">5.x</td>
                              <td className="border p-2">Data fetching and state management</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Wouter</td>
                              <td className="border p-2">2.x</td>
                              <td className="border p-2">Client-side routing library</td>
                            </tr>
                            <tr>
                              <td className="border p-2">React Hook Form</td>
                              <td className="border p-2">7.x</td>
                              <td className="border p-2">Form validation and handling</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Zod</td>
                              <td className="border p-2">3.x</td>
                              <td className="border p-2">Schema validation</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Tailwind CSS</td>
                              <td className="border p-2">3.x</td>
                              <td className="border p-2">Utility-first CSS framework</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Shadcn/UI</td>
                              <td className="border p-2">0.x</td>
                              <td className="border p-2">Component library built on Radix UI</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Backend Stack */}
                    <div>
                      <h3 className="text-xl font-bold mb-3">Backend Stack</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-muted">
                              <th className="border p-2 text-left">Technology</th>
                              <th className="border p-2 text-left">Version</th>
                              <th className="border p-2 text-left">Purpose</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border p-2">Node.js</td>
                              <td className="border p-2">20.x</td>
                              <td className="border p-2">Runtime environment</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Express</td>
                              <td className="border p-2">4.x</td>
                              <td className="border p-2">Web server framework</td>
                            </tr>
                            <tr>
                              <td className="border p-2">TypeScript</td>
                              <td className="border p-2">5.x</td>
                              <td className="border p-2">Strongly typed programming language</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Drizzle ORM</td>
                              <td className="border p-2">0.x</td>
                              <td className="border p-2">Database ORM with TypeScript support</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Express Session</td>
                              <td className="border p-2">1.x</td>
                              <td className="border p-2">Session management</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Passport.js</td>
                              <td className="border p-2">0.x</td>
                              <td className="border p-2">Authentication middleware</td>
                            </tr>
                            <tr>
                              <td className="border p-2">PDFKit</td>
                              <td className="border p-2">0.x</td>
                              <td className="border p-2">PDF generation library</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Sharp</td>
                              <td className="border p-2">0.x</td>
                              <td className="border p-2">Image processing</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* AI Services */}
                    <div>
                      <h3 className="text-xl font-bold mb-3">AI Services</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-muted">
                              <th className="border p-2 text-left">Technology</th>
                              <th className="border p-2 text-left">Model/Version</th>
                              <th className="border p-2 text-left">Purpose</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border p-2">OpenAI API</td>
                              <td className="border p-2">gpt-4o</td>
                              <td className="border p-2">Primary large language model for content generation</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Anthropic/Claude API</td>
                              <td className="border p-2">claude-3-7-sonnet</td>
                              <td className="border p-2">Alternative LLM for fallback and specialized tasks</td>
                            </tr>
                            <tr>
                              <td className="border p-2">HuggingFace Inference API</td>
                              <td className="border p-2">Various</td>
                              <td className="border p-2">AI model access for specific tasks</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Google Cloud Document AI</td>
                              <td className="border p-2">Latest</td>
                              <td className="border p-2">OCR and document processing</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {/* Infrastructure */}
                    <div>
                      <h3 className="text-xl font-bold mb-3">Infrastructure & External Services</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-muted">
                              <th className="border p-2 text-left">Technology</th>
                              <th className="border p-2 text-left">Type</th>
                              <th className="border p-2 text-left">Purpose</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border p-2">PostgreSQL</td>
                              <td className="border p-2">Database</td>
                              <td className="border p-2">Primary relational database</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Neon Serverless Postgres</td>
                              <td className="border p-2">Database Service</td>
                              <td className="border p-2">Managed database service for deployments</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Google Cloud Storage</td>
                              <td className="border p-2">Storage</td>
                              <td className="border p-2">Cloud storage for files and documents</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Stripe</td>
                              <td className="border p-2">Payment</td>
                              <td className="border p-2">Payment processing for subscriptions and one-time payments</td>
                            </tr>
                            <tr>
                              <td className="border p-2">Replit</td>
                              <td className="border p-2">Hosting</td>
                              <td className="border p-2">Development and deployment platform</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Data Flow Tab */}
          <TabsContent value="data-flow">
            <Card>
              <CardHeader>
                <CardTitle>Data Flow Diagram</CardTitle>
                <CardDescription>
                  How data flows through the system across different components
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-white p-6 rounded-lg">
                  <h3 className="text-xl font-bold mb-4">Key Data Flows</h3>
                  
                  <div className="space-y-8">
                    {/* Authentication Flow */}
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h4 className="text-lg font-semibold mb-2">Authentication Flow</h4>
                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>User submits login credentials to frontend</li>
                        <li>Frontend sends authentication request to API</li>
                        <li>API validates credentials with authentication middleware</li>
                        <li>On success, session is created and stored in database</li>
                        <li>Session token is returned to frontend and stored in cookies</li>
                        <li>Subsequent requests include session token for authentication</li>
                      </ol>
                    </div>
                    
                    {/* Content Creation Flow */}
                    <div className="border-l-4 border-green-500 pl-4">
                      <h4 className="text-lg font-semibold mb-2">Content Creation Flow</h4>
                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>User initiates content creation with parameters</li>
                        <li>Frontend sends request to API</li>
                        <li>API routes request to appropriate service</li>
                        <li>Service coordinates with AI providers (OpenAI/Anthropic)</li>
                        <li>AI-generated content is processed and enhanced</li>
                        <li>Content is formatted (PDF/SVG) and stored</li>
                        <li>Response with content reference is returned to frontend</li>
                      </ol>
                    </div>
                    
                    {/* Database Interaction Flow */}
                    <div className="border-l-4 border-amber-500 pl-4">
                      <h4 className="text-lg font-semibold mb-2">Database Interaction Flow</h4>
                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>API receives data operation request</li>
                        <li>Request is validated with Zod schemas</li>
                        <li>Drizzle ORM creates appropriate database query</li>
                        <li>Query is executed against PostgreSQL database</li>
                        <li>Results are processed and formatted</li>
                        <li>Response is returned to the client</li>
                      </ol>
                    </div>
                    
                    {/* Payment Processing Flow */}
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h4 className="text-lg font-semibold mb-2">Payment Processing Flow</h4>
                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>User initiates payment or subscription</li>
                        <li>Frontend creates Stripe payment intent via API</li>
                        <li>User completes payment in Stripe Elements</li>
                        <li>Stripe sends webhook with payment confirmation</li>
                        <li>API processes webhook and updates user subscription</li>
                        <li>User gains access to paid features</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>System Integrations</CardTitle>
                <CardDescription>
                  External services and APIs integrated with the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-6">
                    {/* AI Model Integrations */}
                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2H2v10h10V2Z"></path><path d="M22 12h-4v4h-4v4h8v-8Z"></path><path d="M12 22v-8h- v8"></path><path d="M9 11.33 7 9l2-2"></path><path d="m14 6 6 6"></path></svg>
                        AI Model Integrations
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">OpenAI</h4>
                          <p className="text-sm text-gray-700 mb-3">Primary LLM provider for content generation</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Model:</div>
                              <div>gpt-4o (latest multimodal model)</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Capabilities:</div>
                              <div>Text generation, image understanding, educational content creation</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Direct API with fallback mechanisms</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">Anthropic Claude</h4>
                          <p className="text-sm text-gray-700 mb-3">Secondary LLM for specialized tasks</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Model:</div>
                              <div>claude-3-7-sonnet (latest model)</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Capabilities:</div>
                              <div>Long-context understanding, fallback service</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>API with adapter pattern implementation</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">HuggingFace</h4>
                          <p className="text-sm text-gray-700 mb-3">Specialized AI models for specific tasks</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Models:</div>
                              <div>Various task-specific models</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Capabilities:</div>
                              <div>Image generation, specialized NLP tasks</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Inference API with model selection</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">Google Cloud Document AI</h4>
                          <p className="text-sm text-gray-700 mb-3">OCR and document understanding</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Service:</div>
                              <div>Document AI OCR Processor</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Capabilities:</div>
                              <div>Text extraction, document classification, entity extraction</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Google Cloud client libraries</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Storage Integrations */}
                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>
                        Storage Integrations
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">Google Cloud Storage</h4>
                          <p className="text-sm text-gray-700 mb-3">Cloud storage for application files</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Purpose:</div>
                              <div>File storage for worksheets, PDFs, and user uploads</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Features:</div>
                              <div>ACL management, temporary URLs, file organization</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Google Cloud client libraries</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">PostgreSQL</h4>
                          <p className="text-sm text-gray-700 mb-3">Relational database storage</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Service:</div>
                              <div>Neon Serverless Postgres</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Features:</div>
                              <div>Relational data storage, SQL queries, transaction support</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Drizzle ORM with schema management</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Authentication & Payment */}
                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="12" r="10"></circle><path d="m16 8-8 8"></path><path d="m8 8 8 8"></path></svg>
                        Authentication & Payment
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">Replit Auth</h4>
                          <p className="text-sm text-gray-700 mb-3">Authentication provider</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Protocol:</div>
                              <div>OpenID Connect</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Features:</div>
                              <div>User identity, profile information, secure sessions</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Passport.js middleware with custom strategy</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border rounded-lg p-4">
                          <h4 className="font-semibold mb-2">Stripe</h4>
                          <p className="text-sm text-gray-700 mb-3">Payment processing</p>
                          <div className="space-y-2">
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Services:</div>
                              <div>Payment Intents, Subscriptions, Customer management</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Features:</div>
                              <div>Subscription billing, payment method storage, invoicing</div>
                            </div>
                            <div className="flex items-start">
                              <div className="min-w-[100px] font-medium">Integration:</div>
                              <div>Stripe API & Elements with webhook processing</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default ArchitecturePage;