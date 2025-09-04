import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/SupabaseProvider';

interface DataUpdate {
  type: 'billing_update' | 'payment_complete' | 'enrollment_update';
  data: any;
  userEmail?: string;
  timestamp: string;
}

export function useRealTimeUpdates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const update: DataUpdate = JSON.parse(event.data);
      console.log('📡 Received real-time update:', update.type, update);

      switch (update.type) {
        case 'billing_update':
          // Force refresh billing data
          queryClient.setQueryData(['billing-summary'], update.data);
          queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
          console.log('✅ Updated billing cache with real-time data');
          break;

        case 'payment_complete':
          // Refresh payment history and billing
          queryClient.invalidateQueries({ queryKey: ['payment-history'] });
          queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
          console.log('✅ Payment complete - refreshed cache');
          break;

        case 'enrollment_update':
          // Refresh enrollment data
          queryClient.invalidateQueries({ queryKey: ['enrollments'] });
          queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
          console.log('✅ Enrollment update - refreshed cache');
          break;

        case 'connection_established':
          console.log('🔌 WebSocket connection established:', update.message);
          reconnectAttemptsRef.current = 0;
          break;

        case 'pong':
          console.log('🏓 WebSocket pong received');
          break;
      }
    } catch (error) {
      console.error('❌ Failed to parse WebSocket message:', error);
    }
  }, [queryClient]);

  const connect = useCallback(() => {
    if (!user?.email) {
      console.log('⏳ No user email, skipping WebSocket connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket already connected');
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?email=${encodeURIComponent(user.email)}`;
      
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected for:', user.email);
        reconnectAttemptsRef.current = 0;
        
        // Send initial subscription message
        ws.send(JSON.stringify({
          type: 'subscribe',
          topics: ['billing', 'payments', 'enrollments']
        }));
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        wsRef.current = null;

        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };

      // Send periodic ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
    }
  }, [user?.email, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
  }, []);

  // Connect when user is available, disconnect when not
  useEffect(() => {
    if (user?.email) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user?.email, connect, disconnect]);

  // Manual refresh function
  const forceRefresh = useCallback(async () => {
    console.log('🔄 Force refreshing all billing data...');
    await queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    await queryClient.invalidateQueries({ queryKey: ['payment-history'] });
    await queryClient.invalidateQueries({ queryKey: ['enrollments'] });
  }, [queryClient]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnectAttempts: reconnectAttemptsRef.current,
    forceRefresh,
    connect,
    disconnect
  };
}