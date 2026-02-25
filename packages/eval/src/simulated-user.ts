/**
 * Simulated user for eval conversations.
 *
 * Uses a separate cheap LLM (Haiku) to play the role of a team member
 * being reviewed. The agent under test uses the production LLM — we only
 * use a second model here to generate realistic user responses.
 *
 * Message history structure (Anthropic API convention):
 *   role: "user"      → agent's messages (what the engineer is responding to)
 *   role: "assistant" → engineer's responses (what the model generates)
 *
 * This is opposite to the harness perspective but correct for the API:
 * the model always generates the "assistant" turn.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { UserPersona } from "./types.js";

type ApiMessage = { role: "user" | "assistant"; content: string };

export class SimulatedUser {
  private client: Anthropic;
  private model: string;
  private persona: UserPersona;
  private history: ApiMessage[];

  constructor(persona: UserPersona, apiKey: string) {
    this.client = new Anthropic({ apiKey });
    // Haiku — fast and cheap for role-playing, doesn't need deep reasoning
    this.model = "claude-haiku-4-5-20251001";
    this.persona = persona;
    this.history = [];
  }

  /**
   * Generate the opening message to kick off the conversation.
   * Called before the agent has spoken — produces the engineer's greeting.
   */
  async openingMessage(): Promise<string> {
    const seedUserTurn = "Start the review session. Greet the facilitator briefly and let them know you're ready to discuss your service.";

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: this.buildSystemPrompt(),
      messages: [{ role: "user", content: seedUserTurn }],
    });

    const content = response.content[0];
    if (!content || content.type !== "text") return "Hi, I'm ready for the review.";

    const text = content.text.trim();

    // Store the seed prompt + engineer response so history is coherent
    this.history.push({ role: "user", content: seedUserTurn });
    this.history.push({ role: "assistant", content: text });

    return text;
  }

  /**
   * Generate the next engineer response given the agent's latest message.
   * Returns null to signal the engineer wants to end the conversation.
   */
  async nextMessage(agentMessage: string): Promise<string | null> {
    // Agent message is the "user" turn — the engineer responds as "assistant"
    const messages: ApiMessage[] = [
      ...this.history,
      { role: "user", content: agentMessage },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: this.buildSystemPrompt(),
      messages,
    });

    const content = response.content[0];
    if (!content || content.type !== "text") return null;

    const text = content.text.trim();

    // Signal for conversation end
    if (
      text === "[DONE]" ||
      text.startsWith("[DONE]") ||
      (text.toLowerCase().includes("nothing else to add") && text.length < 80)
    ) {
      return null;
    }

    // Commit to history only after we know we have a valid response
    this.history.push({ role: "user", content: agentMessage });
    this.history.push({ role: "assistant", content: text });

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
