import { noul } from "@typesafe-ai/sdk";
import type { JevIntent } from "../types";

export const INTENT_QUESTIONS: Record<JevIntent, string> = {
  product: "Is the customer asking about a product?",
  order: "Is the customer asking about an order?",
  logistics: "Is the customer asking about shipping or delivery?",
  refund: "Is the customer requesting or discussing a refund?",
  cancel: "Is the customer requesting cancellation?",
  payment: "Is the customer asking about payment?",
  complaint: "Is the customer making a complaint?",
};

export const NEEDS_HUMAN_REVIEW_QUESTION = "Does this conversation require human review?";
export const FRUSTRATED_QUESTION = "Is the customer frustrated or angry?";
export const TOPIC_CHANGED_QUESTION =
  "Has the customer's current topic changed from the preceding conversation?";

export function intentQuestionName(intent: JevIntent): string {
  return `intent${intent[0].toUpperCase()}${intent.slice(1)}`;
}

export function buildQuestions(): Record<string, ReturnType<typeof noul>> {
  const questions: Record<string, ReturnType<typeof noul>> = {};
  for (const [intent, text] of Object.entries(INTENT_QUESTIONS)) {
    questions[intentQuestionName(intent as JevIntent)] = noul(text);
  }
  questions.needsHumanReview = noul(NEEDS_HUMAN_REVIEW_QUESTION);
  questions.frustrated = noul(FRUSTRATED_QUESTION);
  questions.topicChanged = noul(TOPIC_CHANGED_QUESTION);
  return questions;
}
