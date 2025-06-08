import React from 'react';
import { Button } from '@/components/ui/button';

export function TempAuth() {
  const handleLogin = () => {
    // Set a test token for debugging
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImNvcmV5Y3JlYXRlc0BnbWFpbC5jb20iLCJzdWIiOiJ0ZXN0LXVzZXIiLCJpYXQiOjE1MTYyMzkwMjJ9.Ks_BdfH4CKhKXjZc4tBSWqHhAv4s3Hz9nJKPTp9WvtI';
    localStorage.setItem('supabase_token', testToken);
    window.location.reload();
  };

  const handleLogout = () => {
    localStorage.removeItem('supabase_token');
    window.location.reload();
  };

  const hasToken = localStorage.getItem('supabase_token');

  return (
    <div className="fixed top-4 right-4 z-50 bg-white border rounded-lg p-2 shadow-lg">
      <div className="text-xs mb-2">Debug Auth</div>
      {hasToken ? (
        <Button size="sm" variant="destructive" onClick={handleLogout}>
          Logout
        </Button>
      ) : (
        <Button size="sm" onClick={handleLogin}>
          Login as Parent
        </Button>
      )}
    </div>
  );
}