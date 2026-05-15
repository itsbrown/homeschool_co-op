import OpenAI from "openai";
import { z } from "zod";

// Types for messages
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Check if OpenAI API key is available (do not construct client at import — crashes prod boot)
const isOpenAIAvailable = !!process.env.OPENAI_API_KEY?.trim();

let openaiClient: OpenAI | undefined;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

class OpenAIService {
  private static instance: OpenAIService;
  private available: boolean;
  private status: "operational" | "degraded" | "down";

  private constructor() {
    this.available = isOpenAIAvailable;
    this.status = isOpenAIAvailable ? "operational" : "down";
  }

  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  /**
   * Get the status of the OpenAI service
   */
  public getStatus() {
    return {
      available: this.available,
      status: this.status
    };
  }

  /**
   * Set the status of the OpenAI service
   */
  public setStatus(status: "operational" | "degraded" | "down") {
    this.status = status;
    this.available = status !== "down";
  }

  /**
   * Generate a chat completion
   */
  public async generateChatCompletion(messages: ChatMessage[], maxTokens = 1000): Promise<string> {
    if (!this.available) {
      throw new Error("OpenAI service is not available");
    }

    try {
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error("OpenAI returned empty response");
      }
      
      return content;
    } catch (error: any) {
      console.error("OpenAI API error:", error);
      
      // Handle rate limiting
      if (error.status === 429) {
        this.setStatus("degraded");
        throw new Error("OpenAI API rate limit exceeded. Please try again later.");
      }
      
      // Handle other errors
      this.setStatus("degraded");
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

export const openAIService = OpenAIService.getInstance();