import React from 'react';

const SystemArchitectureSVG = () => {
  return (
    <div className="w-full overflow-auto bg-white p-4 rounded-lg shadow-sm">
      <svg
        width="100%"
        height="720"
        viewBox="0 0 1200 720"
        xmlns="http://www.w3.org/2000/svg"
        style={{ maxWidth: '1200px', margin: '0 auto' }}
      >
        <defs>
          {/* Gradient definitions */}
          <linearGradient id="frontendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#bfdbfe" />
          </linearGradient>
          <linearGradient id="backendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dcfce7" />
            <stop offset="100%" stopColor="#bbf7d0" />
          </linearGradient>
          <linearGradient id="aiServicesGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f3e8ff" />
            <stop offset="100%" stopColor="#e9d5ff" />
          </linearGradient>
          <linearGradient id="dataStoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
          <linearGradient id="externalServicesGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fee2e2" />
            <stop offset="100%" stopColor="#fecaca" />
          </linearGradient>

          {/* Arrow marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          
          {/* Dashed arrow marker */}
          <marker
            id="dashedarrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Background & Title */}
        <rect width="1200" height="720" fill="white" rx="8" ry="8" />
        <text x="600" y="40" textAnchor="middle" fontSize="24" fontWeight="bold" fill="#111827">
          ASA Platform - System Architecture
        </text>
        <text x="600" y="70" textAnchor="middle" fontSize="14" fill="#6b7280">
          Adaptive AI-Driven Curriculum Generation and Learning Management System
        </text>

        {/* Client Layer */}
        <rect x="100" y="120" width="1000" height="90" rx="8" ry="8" fill="url(#frontendGradient)" stroke="#93c5fd" strokeWidth="2" />
        <text x="120" y="145" fontSize="18" fontWeight="bold" fill="#1e40af">Client Layer</text>
        
        <rect x="150" y="155" width="220" height="40" rx="4" ry="4" fill="white" stroke="#93c5fd" strokeWidth="1" />
        <text x="260" y="180" textAnchor="middle" fontSize="14" fill="#1e3a8a">React + TypeScript</text>
        
        <rect x="390" y="155" width="220" height="40" rx="4" ry="4" fill="white" stroke="#93c5fd" strokeWidth="1" />
        <text x="500" y="180" textAnchor="middle" fontSize="14" fill="#1e3a8a">Tailwind + Shadcn/UI</text>
        
        <rect x="630" y="155" width="220" height="40" rx="4" ry="4" fill="white" stroke="#93c5fd" strokeWidth="1" />
        <text x="740" y="180" textAnchor="middle" fontSize="14" fill="#1e3a8a">React Query + Wouter</text>
        
        <rect x="870" y="155" width="180" height="40" rx="4" ry="4" fill="white" stroke="#93c5fd" strokeWidth="1" />
        <text x="960" y="180" textAnchor="middle" fontSize="14" fill="#1e3a8a">React Hook Form</text>

        {/* API Layer */}
        <rect x="100" y="240" width="1000" height="90" rx="8" ry="8" fill="url(#backendGradient)" stroke="#86efac" strokeWidth="2" />
        <text x="120" y="265" fontSize="18" fontWeight="bold" fill="#166534">API Layer</text>
        
        <rect x="150" y="275" width="220" height="40" rx="4" ry="4" fill="white" stroke="#86efac" strokeWidth="1" />
        <text x="260" y="300" textAnchor="middle" fontSize="14" fill="#166534">Express + TypeScript</text>
        
        <rect x="390" y="275" width="220" height="40" rx="4" ry="4" fill="white" stroke="#86efac" strokeWidth="1" />
        <text x="500" y="300" textAnchor="middle" fontSize="14" fill="#166534">RESTful Endpoints</text>
        
        <rect x="630" y="275" width="220" height="40" rx="4" ry="4" fill="white" stroke="#86efac" strokeWidth="1" />
        <text x="740" y="300" textAnchor="middle" fontSize="14" fill="#166534">Middleware Stack</text>
        
        <rect x="870" y="275" width="180" height="40" rx="4" ry="4" fill="white" stroke="#86efac" strokeWidth="1" />
        <text x="960" y="300" textAnchor="middle" fontSize="14" fill="#166534">Error Handling</text>

        {/* Service Layer */}
        <rect x="100" y="360" width="1000" height="130" rx="8" ry="8" fill="url(#aiServicesGradient)" stroke="#d8b4fe" strokeWidth="2" />
        <text x="120" y="385" fontSize="18" fontWeight="bold" fill="#7e22ce">Service Layer</text>
        
        <rect x="150" y="395" width="220" height="40" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="260" y="420" textAnchor="middle" fontSize="14" fill="#7e22ce">AI Service Adapters</text>
        
        <rect x="150" y="445" width="100" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="200" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">OpenAI</text>
        
        <rect x="260" y="445" width="110" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="315" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">Anthropic</text>
        
        <rect x="390" y="395" width="220" height="40" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="500" y="420" textAnchor="middle" fontSize="14" fill="#7e22ce">Storage Services</text>
        
        <rect x="390" y="445" width="100" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="440" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">Files</text>
        
        <rect x="500" y="445" width="110" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="555" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">Images</text>
        
        <rect x="630" y="395" width="220" height="40" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="740" y="420" textAnchor="middle" fontSize="14" fill="#7e22ce">Document Generation</text>
        
        <rect x="630" y="445" width="100" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="680" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">PDFs</text>
        
        <rect x="740" y="445" width="110" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="795" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">Worksheets</text>
        
        <rect x="870" y="395" width="180" height="40" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="960" y="420" textAnchor="middle" fontSize="14" fill="#7e22ce">Payment Services</text>
        
        <rect x="890" y="445" width="140" height="30" rx="4" ry="4" fill="white" stroke="#d8b4fe" strokeWidth="1" />
        <text x="960" y="465" textAnchor="middle" fontSize="12" fill="#7e22ce">Stripe Integration</text>

        {/* Data Layer */}
        <rect x="100" y="520" width="670" height="90" rx="8" ry="8" fill="url(#dataStoreGradient)" stroke="#fcd34d" strokeWidth="2" />
        <text x="120" y="545" fontSize="18" fontWeight="bold" fill="#92400e">Data Layer</text>
        
        <rect x="150" y="555" width="180" height="40" rx="4" ry="4" fill="white" stroke="#fcd34d" strokeWidth="1" />
        <text x="240" y="580" textAnchor="middle" fontSize="14" fill="#92400e">Drizzle ORM</text>
        
        <rect x="350" y="555" width="180" height="40" rx="4" ry="4" fill="white" stroke="#fcd34d" strokeWidth="1" />
        <text x="440" y="580" textAnchor="middle" fontSize="14" fill="#92400e">Data Repositories</text>
        
        <rect x="550" y="555" width="180" height="40" rx="4" ry="4" fill="white" stroke="#fcd34d" strokeWidth="1" />
        <text x="640" y="580" textAnchor="middle" fontSize="14" fill="#92400e">Zod Validation</text>

        {/* External Services */}
        <rect x="800" y="520" width="300" height="160" rx="8" ry="8" fill="url(#externalServicesGradient)" stroke="#fca5a5" strokeWidth="2" />
        <text x="820" y="545" fontSize="18" fontWeight="bold" fill="#b91c1c">External Services</text>
        
        <rect x="820" y="555" width="120" height="35" rx="4" ry="4" fill="white" stroke="#fca5a5" strokeWidth="1" />
        <text x="880" y="578" textAnchor="middle" fontSize="13" fill="#b91c1c">OpenAI API</text>
        
        <rect x="950" y="555" width="130" height="35" rx="4" ry="4" fill="white" stroke="#fca5a5" strokeWidth="1" />
        <text x="1015" y="578" textAnchor="middle" fontSize="13" fill="#b91c1c">Anthropic API</text>
        
        <rect x="820" y="600" width="120" height="35" rx="4" ry="4" fill="white" stroke="#fca5a5" strokeWidth="1" />
        <text x="880" y="623" textAnchor="middle" fontSize="13" fill="#b91c1c">Stripe</text>
        
        <rect x="950" y="600" width="130" height="35" rx="4" ry="4" fill="white" stroke="#fca5a5" strokeWidth="1" />
        <text x="1015" y="623" textAnchor="middle" fontSize="13" fill="#b91c1c">Google Cloud</text>
        
        <rect x="820" y="645" width="260" height="25" rx="4" ry="4" fill="white" stroke="#fca5a5" strokeWidth="1" />
        <text x="950" y="662" textAnchor="middle" fontSize="13" fill="#b91c1c">Document AI OCR Service</text>

        {/* Database */}
        <rect x="100" y="640" width="670" height="40" rx="8" ry="8" fill="#f5f5f4" stroke="#d6d3d1" strokeWidth="2" />
        <text x="120" y="665" fontSize="16" fontWeight="bold" fill="#44403c">Database: PostgreSQL (Neon Serverless)</text>

        {/* Connection Arrows */}
        {/* Client to API Layer */}
        <path
          d="M 600 210 L 600 240"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          fill="none"
        />

        {/* API to Service Layer */}
        <path
          d="M 600 330 L 600 360"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          fill="none"
        />

        {/* Service to Data Layer */}
        <path
          d="M 450 490 L 450 520"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          fill="none"
        />

        {/* Data Layer to Database */}
        <path
          d="M 435 610 L 435 640"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          fill="none"
        />

        {/* Service Layer to External Services */}
        <path
          d="M 950 490 L 950 520"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          fill="none"
        />

        {/* OpenAI adapter to OpenAI API */}
        <path
          d="M 200 475 L 200 500 L 850 500 L 850 555"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="4"
          markerEnd="url(#dashedarrowhead)"
          fill="none"
        />

        {/* Anthropic adapter to Anthropic API */}
        <path
          d="M 315 475 L 315 510 L 1015 510 L 1015 555"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="4"
          markerEnd="url(#dashedarrowhead)"
          fill="none"
        />

        {/* Payment service to Stripe */}
        <path
          d="M 925 475 L 925 600"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="4"
          markerEnd="url(#dashedarrowhead)"
          fill="none"
        />

        {/* Document generation to Google Cloud */}
        <path
          d="M 795 475 L 795 538 L 990 538 L 990 600"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="4"
          markerEnd="url(#dashedarrowhead)"
          fill="none"
        />

        {/* Legend */}
        <rect x="100" y="700" width="1000" height="1" fill="#e5e7eb" />
        <text x="120" y="710" fontSize="12" fill="#6b7280">Architecture Legend:</text>
        
        <rect x="230" y="702" width="14" height="14" rx="2" ry="2" fill="url(#frontendGradient)" stroke="#93c5fd" strokeWidth="1" />
        <text x="250" y="713" fontSize="12" fill="#6b7280">Client Layer</text>
        
        <rect x="330" y="702" width="14" height="14" rx="2" ry="2" fill="url(#backendGradient)" stroke="#86efac" strokeWidth="1" />
        <text x="350" y="713" fontSize="12" fill="#6b7280">API Layer</text>
        
        <rect x="430" y="702" width="14" height="14" rx="2" ry="2" fill="url(#aiServicesGradient)" stroke="#d8b4fe" strokeWidth="1" />
        <text x="450" y="713" fontSize="12" fill="#6b7280">Service Layer</text>
        
        <rect x="530" y="702" width="14" height="14" rx="2" ry="2" fill="url(#dataStoreGradient)" stroke="#fcd34d" strokeWidth="1" />
        <text x="550" y="713" fontSize="12" fill="#6b7280">Data Layer</text>
        
        <rect x="630" y="702" width="14" height="14" rx="2" ry="2" fill="url(#externalServicesGradient)" stroke="#fca5a5" strokeWidth="1" />
        <text x="650" y="713" fontSize="12" fill="#6b7280">External Services</text>
        
        <line x1="750" y1="708" x2="780" y2="708" stroke="#64748b" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <text x="790" y="713" fontSize="12" fill="#6b7280">Direct API Call</text>
        
        <line x1="880" y1="708" x2="910" y2="708" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4" markerEnd="url(#dashedarrowhead)" />
        <text x="920" y="713" fontSize="12" fill="#6b7280">Integration</text>
      </svg>
    </div>
  );
};

export default SystemArchitectureSVG;