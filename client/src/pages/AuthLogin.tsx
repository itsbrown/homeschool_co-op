import React from 'react';
import { SupabaseLogin } from '@/components/auth/SupabaseLogin';

export default function AuthLogin() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: 'white',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999
    }}>
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1 style={{ color: 'black', fontSize: '24px', marginBottom: '20px' }}>
          Staff Login Portal
        </h1>
        <SupabaseLogin />
      </div>
    </div>
  );
}