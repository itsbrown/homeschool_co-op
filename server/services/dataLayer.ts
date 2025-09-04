import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface ClientConnection {
  ws: WebSocket;
  userEmail: string;
  subscriptions: Set<string>;
}

interface DataUpdate {
  type: 'billing_update' | 'payment_complete' | 'enrollment_update';
  data: any;
  userEmail?: string;
  timestamp: string;
}

class DataLayer {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ClientConnection> = new Map();

  init(server: Server) {
    // Create WebSocket server on /ws path to avoid conflicts with Vite HMR
    this.wss = new WebSocketServer({ 
      server: server, 
      path: '/ws' 
    });

    this.wss.on('connection', (ws, request) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const userEmail = url.searchParams.get('email');
      
      if (!userEmail) {
        ws.close(1008, 'Missing user email');
        return;
      }

      const connectionId = `${userEmail}_${Date.now()}`;
      const connection: ClientConnection = {
        ws,
        userEmail,
        subscriptions: new Set(['billing', 'payments', 'enrollments'])
      };

      this.connections.set(connectionId, connection);
      console.log(`🔌 WebSocket connected: ${userEmail} (${this.connections.size} total)`);

      // Send initial connection confirmation
      this.sendToClient(ws, {
        type: 'connection_established',
        message: 'Real-time updates enabled',
        timestamp: new Date().toISOString()
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(connectionId, message);
        } catch (error) {
          console.error('❌ Invalid WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        this.connections.delete(connectionId);
        console.log(`🔌 WebSocket disconnected: ${userEmail} (${this.connections.size} total)`);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.connections.delete(connectionId);
      });
    });

    console.log('🔌 WebSocket server initialized on /ws');
  }

  private handleClientMessage(connectionId: string, message: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'subscribe':
        if (message.topics && Array.isArray(message.topics)) {
          message.topics.forEach((topic: string) => {
            connection.subscriptions.add(topic);
          });
        }
        break;

      case 'unsubscribe':
        if (message.topics && Array.isArray(message.topics)) {
          message.topics.forEach((topic: string) => {
            connection.subscriptions.delete(topic);
          });
        }
        break;

      case 'ping':
        this.sendToClient(connection.ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;
    }
  }

  private sendToClient(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // Broadcast billing updates to specific user
  broadcastBillingUpdate(userEmail: string, billingData: any) {
    const update: DataUpdate = {
      type: 'billing_update',
      data: billingData,
      userEmail,
      timestamp: new Date().toISOString()
    };

    this.broadcastToUser(userEmail, update);
    console.log(`📊 Broadcast billing update to ${userEmail}:`, billingData.totalBalanceFormatted);
  }

  // Broadcast payment completion
  broadcastPaymentComplete(userEmail: string, paymentData: any) {
    const update: DataUpdate = {
      type: 'payment_complete',
      data: paymentData,
      userEmail,
      timestamp: new Date().toISOString()
    };

    this.broadcastToUser(userEmail, update);
    console.log(`💳 Broadcast payment complete to ${userEmail}:`, paymentData.amount);
  }

  // Broadcast enrollment updates
  broadcastEnrollmentUpdate(userEmail: string, enrollmentData: any) {
    const update: DataUpdate = {
      type: 'enrollment_update',
      data: enrollmentData,
      userEmail,
      timestamp: new Date().toISOString()
    };

    this.broadcastToUser(userEmail, update);
    console.log(`📚 Broadcast enrollment update to ${userEmail}`);
  }

  private broadcastToUser(userEmail: string, update: DataUpdate) {
    let sentCount = 0;

    this.connections.forEach((connection, connectionId) => {
      if (connection.userEmail === userEmail && 
          connection.subscriptions.has(update.type.split('_')[0]) &&
          connection.ws.readyState === WebSocket.OPEN) {
        
        this.sendToClient(connection.ws, update);
        sentCount++;
      }
    });

    if (sentCount === 0) {
      console.log(`📡 No active connections found for ${userEmail}`);
    } else {
      console.log(`📡 Sent ${update.type} to ${sentCount} client(s) for ${userEmail}`);
    }
  }

  // Trigger data refresh for user
  async refreshUserData(userEmail: string) {
    try {
      // Import storage here to avoid circular dependencies
      const { storage } = await import('../storage.js');
      
      // Get fresh billing data
      const children = await storage.getChildrenByParentEmail(userEmail);
      const childIds = children.map(child => child.id);
      
      let totalBalance = 0;
      let enrollmentCount = 0;
      const enrollmentDetails = [];

      for (const childId of childIds) {
        const enrollments = await storage.getEnrollmentsByChildId(childId);
        
        for (const enrollment of enrollments) {
          if (enrollment.status === 'enrolled' && enrollment.remainingBalance > 0) {
            totalBalance += enrollment.remainingBalance;
            enrollmentCount++;
            
            enrollmentDetails.push({
              enrollmentId: enrollment.id,
              childName: enrollment.childName,
              className: enrollment.className,
              balance: enrollment.remainingBalance,
              status: enrollment.status,
              amountPaid: enrollment.amount || 0,
              classPrice: enrollment.totalCost || 0
            });
          }
        }
      }

      const billingData = {
        totalBalance,
        totalBalanceFormatted: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(totalBalance / 100),
        enrollmentCount,
        enrollmentDetails,
        parentEmail: userEmail
      };

      // Broadcast the fresh data
      this.broadcastBillingUpdate(userEmail, billingData);
      
      return billingData;
    } catch (error) {
      console.error('❌ Error refreshing user data:', error);
      return null;
    }
  }

  // Get connection stats
  getStats() {
    return {
      totalConnections: this.connections.size,
      connectionsByUser: Array.from(this.connections.values()).reduce((acc, conn) => {
        acc[conn.userEmail] = (acc[conn.userEmail] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

// Export singleton instance
export const dataLayer = new DataLayer();