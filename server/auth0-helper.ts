/**
 * Auth0 Helper Functions
 * Utilities for working with Auth0 authentication and user information
 */

export interface Auth0UserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
}

/**
 * Fetch user information from Auth0's userinfo endpoint
 * @param accessToken - The Auth0 access token
 * @returns Promise<Auth0UserInfo | null>
 */
export async function getAuth0UserInfo(accessToken: string): Promise<Auth0UserInfo | null> {
  try {
    const response = await fetch(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`❌ Failed to fetch user info from Auth0: ${response.status} ${response.statusText}`);
      return null;
    }

    const userInfo = await response.json();
    console.log('✅ Successfully fetched Auth0 user info:', userInfo);
    return userInfo;
  } catch (error) {
    console.error('❌ Error fetching Auth0 user info:', error);
    return null;
  }
}

/**
 * Extract access token from Authorization header
 * @param authHeader - The Authorization header value
 * @returns The access token or null
 */
export function extractAccessToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}