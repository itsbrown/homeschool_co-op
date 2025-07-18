
interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ConversationHistory {
  parentId: string;
  messages: ConversationMessage[];
  lastUpdated: string;
  childrenMentioned: Array<{
    name: string;
    childId?: number;
    details?: any;
  }>;
}

class ConversationHistoryService {
  private conversations: Map<string, ConversationHistory> = new Map();

  /**
   * Get conversation history for a parent
   */
  getHistory(parentId: string): ConversationMessage[] {
    const conversation = this.conversations.get(parentId);
    return conversation?.messages || [];
  }

  /**
   * Add message to conversation history
   */
  addMessage(parentId: string, role: "user" | "assistant", content: string): void {
    let conversation = this.conversations.get(parentId);
    
    if (!conversation) {
      conversation = {
        parentId,
        messages: [],
        lastUpdated: new Date().toISOString(),
        childrenMentioned: []
      };
    }

    conversation.messages.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    // Keep only last 20 messages to prevent memory bloat
    if (conversation.messages.length > 20) {
      conversation.messages = conversation.messages.slice(-20);
    }

    conversation.lastUpdated = new Date().toISOString();
    this.conversations.set(parentId, conversation);
  }

  /**
   * Add mentioned child to conversation context
   */
  addMentionedChild(parentId: string, name: string, childId?: number, details?: any): void {
    let conversation = this.conversations.get(parentId);
    
    if (!conversation) {
      conversation = {
        parentId,
        messages: [],
        lastUpdated: new Date().toISOString(),
        childrenMentioned: []
      };
    }

    // Check if child already mentioned
    const existingChild = conversation.childrenMentioned.find(c => 
      c.name.toLowerCase() === name.toLowerCase()
    );

    if (existingChild) {
      // Update existing entry
      if (childId) existingChild.childId = childId;
      if (details) existingChild.details = { ...existingChild.details, ...details };
    } else {
      // Add new entry
      conversation.childrenMentioned.push({
        name,
        childId,
        details
      });
    }

    this.conversations.set(parentId, conversation);
  }

  /**
   * Get children mentioned in conversation
   */
  getMentionedChildren(parentId: string): Array<{name: string; childId?: number; details?: any}> {
    const conversation = this.conversations.get(parentId);
    return conversation?.childrenMentioned || [];
  }

  /**
   * Clear conversation history for a parent
   */
  clearHistory(parentId: string): void {
    this.conversations.delete(parentId);
  }
}

export const conversationHistory = new ConversationHistoryService();
