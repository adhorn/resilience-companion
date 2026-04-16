/**
 * Simulated user for eval conversations.
 *
 * Uses a separate cheap LLM (Haiku) to play the role of a team member
 * being reviewed. The agent under test uses the production LLM — we only
 * use a second model here to generate realistic user responses.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { UserPersona } from "./types.js";

export class SimulatedUser {
  private client: Anthropic;
  private model: string;
  private persona: UserPersona;
  private history: Array<{ role: "user" | "assistant"; content: string }>;

  constructor(persona: UserPersona, apiKey: string) {
    this.client = new Anthropic({ apiKey });
    // Use Haiku — fast and cheap for role-playing, doesn't need deep reasoning
    this.model = "claude-haiku-4-5-20251001";
    this.persona = persona;
    this.history = [];
  }

  /**
   * Generate the next user message given the agent's latest response.
   * Returns null to signal the user wants to end the conversation.
   */
  async nextMessage(agentMessage: string): Promise<string | null> {
    // Add agent message as "assistant" from the simulated user's perspective
    this.history.push({ role: "assistant", content: agentMessage });

    const systemPrompt = this.buildSystemPrompt();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: systemPrompt,
      messages: this.history,
    });

    const content = response.content[0];
    if (content.type !== "text") return null;

    const text = content.text.trim();

    // Signal for conversation end
    if (
      text === "[DONE]" ||
      text.startsWith("[DONE]") ||
      text.toLowerCase().includes("nothing else to add") && text.length < 50
    ) {
      return null;
    }

    // Record the response as "user" from the simulated user's perspective
    this.history.push({ role: "user", content: text });
    return text;
  }

  /**
   * Generate the opening message to kick off the conversation.
   */
  async openingMessage(): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: "Start the conversation. Greet the reviewer briefly and let them know you're ready.",
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") return "Hi, I'm ready for the review.";

    const text = content.text.trim();
    this.history.push({ role: "user", content: text });
    return text;
  }

  private buildSystemPrompt(): string {
    return `You are playing the role of a software engineer being guided through an operational readiness review (ORR) by an AI facilitator.

Your persona:
${this.persona.systemPrompt}

Your knowledge about the system you're responsible for:
${this.persona.knowledge}

Your communication style: ${this.persona.style}

Rules:
- Answer questions about your system using the knowledge above
- Don't volunteer information unprompted — wait to be asked
- Stay in character throughout
- Keep responses concise (1-4 sentences typical)
- If the facilitator asks something you don't know, say so honestly
- If you have nothing more to add and the conversation feels complete, respond with just: [DONE]
- Never break character or acknowledge that this is a simulation`;
  }
}
