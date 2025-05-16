import Anthropic from "@anthropic-ai/sdk";

// Types for messages
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Check if Anthropic API key is available
const isAnthropicAvailable = !!process.env.ANTHROPIC_API_KEY;

class AnthropicService {
  private static instance: AnthropicService;
  private available: boolean;
  private status: "operational" | "degraded" | "down";

  private constructor() {
    this.available = isAnthropicAvailable;
    this.status = isAnthropicAvailable ? "operational" : "down";
  }

  public static getInstance(): AnthropicService {
    if (!AnthropicService.instance) {
      AnthropicService.instance = new AnthropicService();
    }
    return AnthropicService.instance;
  }

  /**
   * Get the status of the Anthropic service
   */
  public getStatus() {
    return {
      available: this.available,
      status: this.status
    };
  }

  /**
   * Set the status of the Anthropic service
   */
  public setStatus(status: "operational" | "degraded" | "down") {
    this.status = status;
    this.available = status !== "down";
  }

  /**
   * Convert standard chat messages to Anthropic-specific format
   */
  private convertMessages(messages: ChatMessage[]) {
    const systemMessage = messages.find(msg => msg.role === "system");
    const conversationMessages = messages.filter(msg => msg.role !== "system");
    
    return {
      system: systemMessage?.content || "",
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };
  }

  /**
   * Generate a chat completion
   */
  public async generateChatCompletion(messages: ChatMessage[], maxTokens = 1000): Promise<string> {
    if (!this.available) {
      throw new Error("Anthropic service is not available");
    }

    try {
      const { system, messages: conversationMessages } = this.convertMessages(messages);
      
      // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        system: system,
        messages: conversationMessages,
        max_tokens: maxTokens,
      });

      const content = response.content[0].text;
      
      if (!content) {
        throw new Error("Anthropic returned empty response");
      }
      
      return content;
    } catch (error: any) {
      console.error("Anthropic API error:", error);
      
      // Handle rate limiting
      if (error.status === 429) {
        this.setStatus("degraded");
        throw new Error("Anthropic API rate limit exceeded. Please try again later.");
      }
      
      // Handle other errors
      this.setStatus("degraded");
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}

export const anthropicService = AnthropicService.getInstance();