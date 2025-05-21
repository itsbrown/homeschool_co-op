import React from 'react';
import { Button } from "@/components/ui/button";

/*
This is a React component that renders a development architecture diagram.
The diagram is built using HTML and CSS to create a responsive, accessible visualization.
*/

export const ArchitectureDiagram = () => {
  return (
    <div className="w-full overflow-auto bg-white p-6 rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-center">ASA Platform Architecture</h2>
      
      <div className="diagram-container min-w-[900px]" style={{ minHeight: '700px' }}>
        {/* Frontend Layer */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-blue-700 mb-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"></path></svg>
            Frontend Layer (React + TypeScript)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-blue-100 rounded p-3">
              <h4 className="font-semibold text-blue-800 mb-2">UI Components</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Shadcn/UI Components</li>
                <li>• Custom Components</li>
                <li>• Layout Components</li>
                <li>• Form Components</li>
              </ul>
            </div>
            <div className="bg-white border border-blue-100 rounded p-3">
              <h4 className="font-semibold text-blue-800 mb-2">State Management</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• React Query</li>
                <li>• Context API</li>
                <li>• React Hook Form</li>
                <li>• Local State</li>
              </ul>
            </div>
            <div className="bg-white border border-blue-100 rounded p-3">
              <h4 className="font-semibold text-blue-800 mb-2">Navigation</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Wouter Router</li>
                <li>• Route Guards</li>
                <li>• Role-based Routing</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-center mt-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>
          </div>
        </div>
        
        {/* API Layer */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-green-700 mb-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
            API Layer (Express + TypeScript)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-green-100 rounded p-3">
              <h4 className="font-semibold text-green-800 mb-2">API Routes</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Authentication Routes</li>
                <li>• School Admin Routes</li>
                <li>• Content Routes</li>
                <li>• AI Service Routes</li>
              </ul>
            </div>
            <div className="bg-white border border-green-100 rounded p-3">
              <h4 className="font-semibold text-green-800 mb-2">Middleware</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Authentication</li>
                <li>• Validation</li>
                <li>• Error Handling</li>
                <li>• CORS</li>
              </ul>
            </div>
            <div className="bg-white border border-green-100 rounded p-3">
              <h4 className="font-semibold text-green-800 mb-2">Controllers</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Request Handling</li>
                <li>• Response Formatting</li>
                <li>• Service Coordination</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-center mt-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>
          </div>
        </div>
        
        {/* Service Layer */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-purple-700 mb-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="12" r="10"></circle><path d="m4.93 4.93 14.14 14.14"></path></svg>
            Service Layer
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-purple-100 rounded p-3">
              <h4 className="font-semibold text-purple-800 mb-2">AI Services</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• OpenAI Service</li>
                <li>• Anthropic Service</li>
                <li>• HuggingFace Service</li>
                <li>• Document AI</li>
              </ul>
            </div>
            <div className="bg-white border border-purple-100 rounded p-3">
              <h4 className="font-semibold text-purple-800 mb-2">Storage</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• File Storage</li>
                <li>• Image Storage</li>
                <li>• Document Storage</li>
              </ul>
            </div>
            <div className="bg-white border border-purple-100 rounded p-3">
              <h4 className="font-semibold text-purple-800 mb-2">Document Generation</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• PDF Generation</li>
                <li>• Worksheet Creator</li>
                <li>• SVG Generator</li>
              </ul>
            </div>
            <div className="bg-white border border-purple-100 rounded p-3">
              <h4 className="font-semibold text-purple-800 mb-2">Payment</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Stripe Integration</li>
                <li>• Subscription Management</li>
                <li>• Payment Processing</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-center mt-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>
          </div>
        </div>
        
        {/* Data Layer */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-amber-700 mb-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
            Data Layer
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-amber-100 rounded p-3">
              <h4 className="font-semibold text-amber-800 mb-2">ORM / Data Access</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Drizzle ORM</li>
                <li>• Schema Definitions</li>
                <li>• Query Building</li>
                <li>• Repository Pattern</li>
              </ul>
            </div>
            <div className="bg-white border border-amber-100 rounded p-3">
              <h4 className="font-semibold text-amber-800 mb-2">Data Validation</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Zod Schemas</li>
                <li>• Type Validation</li>
                <li>• Schema Enforcement</li>
              </ul>
            </div>
            <div className="bg-white border border-amber-100 rounded p-3">
              <h4 className="font-semibold text-amber-800 mb-2">Migration</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Schema Migrations</li>
                <li>• Version Control</li>
                <li>• Data Seeding</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-center mt-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>
          </div>
        </div>
        
        {/* Infrastructure Layer */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-bold text-red-700 mb-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect><rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect><line x1="6" x2="6.01" y1="6" y2="6"></line><line x1="6" x2="6.01" y1="18" y2="18"></line></svg>
            Infrastructure Layer
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-red-100 rounded p-3">
              <h4 className="font-semibold text-red-800 mb-2">Database</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• PostgreSQL</li>
                <li>• Neon Serverless</li>
                <li>• Connection Pooling</li>
              </ul>
            </div>
            <div className="bg-white border border-red-100 rounded p-3">
              <h4 className="font-semibold text-red-800 mb-2">Hosting & Deployment</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Replit Deployments</li>
                <li>• Container Management</li>
                <li>• Environment Configuration</li>
              </ul>
            </div>
            <div className="bg-white border border-red-100 rounded p-3">
              <h4 className="font-semibold text-red-800 mb-2">External Services</h4>
              <ul className="text-sm space-y-1 text-gray-700">
                <li>• Google Cloud</li>
                <li>• Stripe</li>
                <li>• AI Service Providers</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="mt-8 border-t pt-4">
        <h3 className="text-lg font-semibold mb-3">Architecture Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 mr-2"></div>
            <span className="text-sm">Frontend Layer</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 mr-2"></div>
            <span className="text-sm">API Layer</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-purple-100 border border-purple-300 mr-2"></div>
            <span className="text-sm">Service Layer</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-amber-100 border border-amber-300 mr-2"></div>
            <span className="text-sm">Data Layer</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-100 border border-red-300 mr-2"></div>
            <span className="text-sm">Infrastructure Layer</span>
          </div>
        </div>
      </div>
      
      <div className="mt-6 text-center">
        <Button variant="outline" onClick={() => window.print()}>Export Diagram</Button>
      </div>
    </div>
  );
};

export default ArchitectureDiagram;