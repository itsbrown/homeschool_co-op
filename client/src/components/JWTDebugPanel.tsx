
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth0';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { decodeJWT, inspectJWT } from '@/utils/jwtDebugger';

export default function JWTDebugPanel() {
  const { inspectCurrentToken, isAuthenticated } = useAuth();
  const [manualToken, setManualToken] = useState('');
  const [decodedPayload, setDecodedPayload] = useState<any>(null);

  const handleInspectCurrentToken = async () => {
    console.log('🔍 Inspecting current Auth0 token...');
    await inspectCurrentToken();
  };

  const handleInspectManualToken = () => {
    if (!manualToken.trim()) {
      console.error('Please enter a token to inspect');
      return;
    }
    
    console.log('🔍 Inspecting manually entered token...');
    inspectJWT(manualToken);
    
    const payload = decodeJWT(manualToken);
    setDecodedPayload(payload);
  };

  const handleClearConsole = () => {
    console.clear();
    setDecodedPayload(null);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>JWT Token Inspector</CardTitle>
        <CardDescription>
          Debug and inspect JWT tokens for Auth0 authentication issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h4 className="font-medium">Current Session Token</h4>
          <Button 
            onClick={handleInspectCurrentToken}
            disabled={!isAuthenticated}
            className="w-full"
          >
            {isAuthenticated ? 'Inspect Current Token' : 'Not Authenticated'}
          </Button>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium">Manual Token Inspection</h4>
          <Textarea
            placeholder="Paste JWT token here (including Bearer prefix if present)..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            rows={4}
          />
          <div className="flex gap-2">
            <Button onClick={handleInspectManualToken} disabled={!manualToken.trim()}>
              Inspect Token
            </Button>
            <Button variant="outline" onClick={handleClearConsole}>
              Clear Console
            </Button>
          </div>
        </div>

        {decodedPayload && (
          <div className="space-y-2">
            <h4 className="font-medium">Decoded Payload</h4>
            <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-auto max-h-96">
              {JSON.stringify(decodedPayload, null, 2)}
            </pre>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium">Expected Values</h4>
          <div className="bg-blue-50 p-3 rounded-md text-sm">
            <p><strong>Audience (aud):</strong> {import.meta.env.VITE_AUTH0_API_IDENTIFIER}</p>
            <p><strong>Issuer (iss):</strong> https://{import.meta.env.VITE_AUTH0_DOMAIN}/</p>
            <p><strong>Required Role Claims:</strong> role, roles, or custom namespace claims</p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium">Instructions</h4>
          <div className="bg-yellow-50 p-3 rounded-md text-sm">
            <ol className="list-decimal list-inside space-y-1">
              <li>Click "Inspect Current Token" to analyze your current session</li>
              <li>Use browser dev tools (Network tab) to capture Authorization headers</li>
              <li>Paste captured tokens in the manual inspector above</li>
              <li>Check the browser console for detailed analysis results</li>
              <li>Verify audience, issuer, expiration, and role claims match expectations</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
