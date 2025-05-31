
export interface JWTPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  email?: string;
  role?: string;
  roles?: string[];
  [key: string]: any;
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    // Remove Bearer prefix if present
    const cleanToken = token.replace(/^Bearer\s+/, '');
    
    // Split the token into parts
    const parts = cleanToken.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format');
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    
    // Decode base64
    const decodedPayload = atob(paddedPayload);
    
    // Parse JSON
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

export function inspectJWT(token: string): void {
  console.log('🔍 JWT Token Inspection');
  console.log('Raw Token:', token);
  
  const payload = decodeJWT(token);
  if (!payload) {
    console.error('❌ Failed to decode JWT token');
    return;
  }

  console.log('📋 Decoded Payload:', payload);
  
  // Check required claims
  const expectedAudience = import.meta.env.VITE_AUTH0_API_IDENTIFIER;
  const expectedIssuer = `https://${import.meta.env.VITE_AUTH0_DOMAIN}/`;
  
  console.log('🎯 Audience Check:');
  console.log('  Expected:', expectedAudience);
  console.log('  Actual:', payload.aud);
  console.log('  Match:', payload.aud === expectedAudience || (Array.isArray(payload.aud) && payload.aud.includes(expectedAudience)) ? '✅' : '❌');
  
  console.log('🏢 Issuer Check:');
  console.log('  Expected:', expectedIssuer);
  console.log('  Actual:', payload.iss);
  console.log('  Match:', payload.iss === expectedIssuer ? '✅' : '❌');
  
  console.log('⏰ Expiration Check:');
  if (payload.exp) {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(payload.exp * 1000);
    console.log('  Expires at:', expiresAt.toISOString());
    console.log('  Current time:', new Date().toISOString());
    console.log('  Valid:', payload.exp > now ? '✅' : '❌ EXPIRED');
    console.log('  Time until expiry:', payload.exp > now ? `${payload.exp - now} seconds` : 'Already expired');
  } else {
    console.log('  No expiration claim found ❌');
  }
  
  console.log('👤 Role Claims:');
  // Check various possible role claim locations
  const possibleRoleClaims = [
    'role',
    'roles',
    `${expectedAudience}/roles`,
    'https://asa-platform.com/roles',
    'app_metadata.roles',
    'custom:role'
  ];
  
  possibleRoleClaims.forEach(claimPath => {
    const roleValue = getNestedValue(payload, claimPath);
    if (roleValue !== undefined) {
      console.log(`  ${claimPath}:`, roleValue);
    }
  });
  
  console.log('📧 User Info:');
  console.log('  Subject (sub):', payload.sub);
  console.log('  Email:', payload.email);
  console.log('  Name:', payload.name);
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Auto-inspect tokens when they're used
export function interceptAndInspectToken(token: string): string {
  if (token && !token.includes('INSPECTED')) {
    inspectJWT(token);
    // Mark as inspected to avoid duplicate logging
    return token + '_INSPECTED';
  }
  return token;
}
