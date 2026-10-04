import { z } from "zod";
import { COMPLETENESS_CATEGORIES, MESSAGE_ROLES, type MessageRole } from "./enums";

/**
 * Chat contracts: what the AI sends back, and how the UI renders it.
 *
 * Assistant messages carry a structured `payload` alongside their text: follow-up
 * questions with quick-reply options, a completeness snapshot, a generation
 * status card or a modification summary. The UI never has to guess what to show.
 */

export const QuestionInputTypeSchema = z.enum([
  "text",
  "long-text",
  "single",
  "multi",
  "boolean",
  "color",
  "url",
  "number",
]);
export type QuestionInputType = z.infer<typeof QuestionInputTypeSchema>;

export const InterviewQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  help: z.string().default(""),
  type: QuestionInputTypeSchema.default("text"),
  options: z.array(z.string()).default([]),
  allowOther: z.boolean().default(true),
  /** Requirements path this question fills, e.g. "business.targetAudience". */
  mapsTo: z.string().default(""),
  category: z.enum(COMPLETENESS_CATEGORIES).optional(),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

export const CompletenessSnapshotSchema = z.object({
  overall: z.number().int().min(0).max(100),
  readyForGeneration: z.boolean().default(false),
  blocking: z.array(z.string()).default([]),
  categories: z
    .array(
      z.object({
        key: z.enum(COMPLETENESS_CATEGORIES),
        label: z.string(),
        score: z.number().int().min(0).max(100),
        applicable: z.boolean().default(true),
        missing: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type CompletenessSnapshot = z.infer<typeof CompletenessSnapshotSchema>;

export const MessagePayloadSchema = z.object({
  /** Drives which card the chat renders for an assistant message. */
  kind: z.enum(["text", "question", "confirmation", "generation", "modification", "system"]).default("text"),
  questions: z.array(InterviewQuestionSchema).default([]),
  /**
   * Display heading for the question block. The opening question reads
   * "First: Which industry are you in?" as its heading while the message body
   * stays conversational prose - the composer placeholder still uses the raw
   * `questions[].question` text.
   */
  heading: z.string().optional(),
  suggestions: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
  completeness: CompletenessSnapshotSchema.optional(),
  readyForGeneration: z.boolean().default(false),
  requiresConfirmation: z.boolean().default(false),
  changeSummary: z.array(z.string()).default([]),
  affectedSections: z.array(z.string()).default([]),
  versionNumber: z.number().int().positive().optional(),
  provider: z.string().default(""),
  error: z.string().default(""),
  /** Free-form extras the UI can ignore safely. */
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type MessagePayload = z.infer<typeof MessagePayloadSchema>;

export function parseMessagePayload(value: unknown): MessagePayload {
  return MessagePayloadSchema.parse(value ?? {});
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export const ChatMessageSchema = z.object({
  role: z.enum(MESSAGE_ROLES),
  content: z.string(),
});

export const ChatHistorySchema = z.array(ChatMessageSchema).default([]);

export function toChatMessages(messages: Array<{ role: string; content: string }>): ChatMessage[] {
  return messages.map((message) => ({
    role: (MESSAGE_ROLES as readonly string[]).includes(message.role) ? (message.role as MessageRole) : "system",
    content: message.content,
  }));
}

/** Flattens the conversation into the transcript format used in prompts. */
export function transcript(messages: ChatMessage[], limit = 30): string {
  return messages
    .slice(-limit)
    .map((message) => `${message.role === "user" ? "Client" : "Consultant"}: ${message.content}`)
    .join("\n");
}
