import React from 'react';
import { Notification } from '@/components/ui/notification-center';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';

interface BackendNotification {
  id: number;
  subject: string;
  content: string;
  type: string;
  priority: string;
  status: string;
  recipientId?: number;
  deliveryType?: string;
  recipientStatus?: string;
  readAt?: string | null;
  createdAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
  unreadCount: number;
  isLoading: boolean;
}

const NotificationContext = React.createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [localNotifications, setLocalNotifications] = React.useState<Notification[]>([]);
  const [readOverrides, setReadOverrides] = React.useState<Set<string>>(new Set());

  // Fetch notifications from backend
  const { data: backendNotifications = [], isLoading } = useQuery<BackendNotification[]>({
    queryKey: ['/api/notifications'],
    enabled: isAuthenticated && !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Convert backend notifications to frontend format with optimistic read state
  const convertedNotifications = React.useMemo(() => {
    return backendNotifications.map((n): Notification => ({
      id: String(n.id),
      type: n.priority === 'urgent' ? 'error' : n.priority === 'high' ? 'warning' : 'info',
      title: n.subject,
      message: n.content,
      timestamp: new Date(n.createdAt),
      read: readOverrides.has(String(n.id)) || n.recipientStatus === 'read',
      actionable: false,
    }));
  }, [backendNotifications, readOverrides]);

  // Combine backend and local notifications
  const notifications = React.useMemo(() => {
    return [...convertedNotifications, ...localNotifications];
  }, [convertedNotifications, localNotifications]);

  const unreadCount = React.useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        await apiRequest('POST', `/api/notifications/${numericId}/read`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      // Don't clear overrides immediately - let useEffect handle it when backend data is updated
    },
  });

  // Clear read overrides when all backend notifications are confirmed as read
  React.useEffect(() => {
    const allBackendRead = backendNotifications.every(n => n.recipientStatus === 'read');
    if (allBackendRead && readOverrides.size > 0) {
      setReadOverrides(new Set());
    }
  }, [backendNotifications, readOverrides.size]);

  const addNotification = React.useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      read: false,
    };
    
    setLocalNotifications(prev => [newNotification, ...prev]);
  }, []);

  const markAsRead = React.useCallback((id: string) => {
    // Optimistically mark as read for both backend and local notifications
    setReadOverrides(prev => new Set([...prev, id]));
    setLocalNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    
    // Call backend API
    markAsReadMutation.mutate(id);
  }, [markAsReadMutation]);

  const clearAll = React.useCallback(() => {
    // Optimistically mark all backend notifications as read
    const allBackendIds = backendNotifications.map(n => String(n.id));
    setReadOverrides(new Set(allBackendIds));
    
    // Mark all local notifications as read
    setLocalNotifications(prev => 
      prev.map(n => ({ ...n, read: true }))
    );
    
    // Call backend API
    markAllAsReadMutation.mutate();
  }, [markAllAsReadMutation, backendNotifications]);

  const updateNotification = React.useCallback((id: string, updates: Partial<Notification>) => {
    setLocalNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, ...updates } : n)
    );
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      addNotification,
      markAsRead,
      clearAll,
      updateNotification,
      unreadCount,
      isLoading,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}