// Shared types for the Jev Feasibility Lab experiment.
// Both experiment paths (WITHOUT JEV / WITH JEV) use these types; the two model
// protocols stay separate: Jev = TypeSafe System One, Reasoning = OpenAI-compatible.

export type Intent =
  | "product"
  | "order"
  | "logistics"
  | "refund"
  | "cancel"
  | "payment"
  | "complaint"
  | "other";

export const INTENTS: readonly Intent[] = [
  "product",
  "order",
  "logistics",
  "refund",
  "cancel",
  "payment",
  "complaint",
  "other",
];

// Intents covered by dedicated Jev Noul questions. "other" has no Noul question:
// it is only meaningful as the absence of every other intent.
export const JEVD_INTENTS = [
  "product",
  "order",
  "logistics",
  "refund",
  "cancel",
  "payment",
  "complaint",
] as const;
export type JevIntent = (typeof JEVD_INTENTS)[number];

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
  // 非中文模拟内容的中文翻译，仅用于展示，不参与任何模型调用。
  translation?: string;
}

export interface JevConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface ReasoningModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface ExperimentConfig {
  jev: JevConfig;
  reasoning: ReasoningModelConfig;
  temperature: number;
}

// What the browser is allowed to send: same shape, keys optional.
export interface ClientConfigOverride {
  jev?: Partial<Pick<JevConfig, "baseUrl" | "apiKey" | "model">>;
  reasoning?: Partial<Pick<ReasoningModelConfig, "baseUrl" | "apiKey" | "model">>;
  temperature?: number;
  timeoutMs?: number;
}

// Client-side settings state. Empty apiKey ⇒ server (.env) default is used.
export interface ClientConfig {
  jev: { baseUrl: string; apiKey: string; model: string };
  reasoning: { baseUrl: string; apiKey: string; model: string };
  temperature: number;
  timeoutMs: number;
}

export interface JevSignal {
  value: boolean;
  probability: number;
}

export interface JevSignals {
  intents: Record<JevIntent, JevSignal>;
  needsHumanReview: JevSignal;
  frustrated: JevSignal;
  topicChanged: JevSignal;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type RunErrorType =
  | "network"
  | "timeout"
  | "http"
  | "invalid_response"
  | "schema_validation"
  | "unknown";

export interface RunError {
  type: RunErrorType;
  message: string;
  status?: number;
}

export interface JevRunResult {
  signals?: JevSignals;
  rawAnswers?: unknown;
  latencyMs: number;
  usage?: TokenUsage;
  modelCalls: number;
  retryCount: number;
  error?: RunError;
}

export type Route = "agent" | "human";

export interface AgentDecision {
  intents: Intent[];
  route: Route;
  response: string;
}

// Raw reasoning-model output before the shared routing policy is applied.
export interface ReasoningOutput {
  intents: Intent[];
  needsHumanReview: boolean;
  response: string;
}

export interface BaselineResult {
  decision?: AgentDecision;
  // The reasoning model's own escalation assessment; feeds deriveRoute() on the baseline path.
  needsHumanReviewRaw?: boolean;
  reasoningLatencyMs: number;
  totalLatencyMs: number;
  usage?: TokenUsage;
  modelCalls: number;
  retryCount: number;
  error?: RunError;
}

export interface WithJevResult {
  jev: JevRunResult;
  decision?: AgentDecision;
  reasoningLatencyMs?: number;
  totalLatencyMs: number;
  reasoningUsage?: TokenUsage;
  modelCalls: number;
  retryCount: number;
  error?: RunError;
}

export interface Expected {
  intents?: Intent[];
  route?: Route;
  needsHumanReview?: boolean;
  frustrated?: boolean;
  topicChanged?: boolean;
}

export interface TestCase {
  id: string;
  name: string;
  messages: ChatMessage[];
  expected?: Expected;
}

// 批量测试中的数据集：内置一个，导入的追加进列表（仅保存在页面会话中）。
export interface DatasetMeta {
  id: string;
  name: string;
  source: "builtin" | "imported";
  createdAt: string;
  cases: TestCase[];
}

export type CaseOutcome = "improved" | "worse" | "same" | "different" | "error";

export interface CaseComparison {
  outcome: CaseOutcome;
  hasGroundTruth: boolean;
  baselineRouteCorrect: boolean | null;
  withJevRouteCorrect: boolean | null;
  baselineIntentsF1: number | null;
  withJevIntentsF1: number | null;
  routeChanged: boolean;
  intentSetChanged: boolean;
  humanEscalationChanged: boolean;
}

export interface CaseResult {
  caseId: string;
  baseline: BaselineResult;
  withJev: WithJevResult;
  comparison: CaseComparison;
}

export interface ExperimentSnapshot {
  id: string;
  startedAt: string;
  jev: {
    baseUrl: string;
    model: string;
    noulThreshold: number;
  };
  reasoning: {
    baseUrl: string;
    model: string;
  };
  temperature: number;
  promptVersion: string;
  caseCount: number;
}

export interface EvaluateRequest {
  messages: ChatMessage[];
  expected?: Expected;
  caseId?: string;
  config?: ClientConfigOverride;
}

export interface EvaluateResponse {
  baseline: BaselineResult;
  withJev: WithJevResult;
  comparison: CaseComparison;
}

export interface ServerDefaults {
  jev: { baseUrl: string; model: string; hasKey: boolean };
  reasoning: { baseUrl: string; model: string; hasKey: boolean };
  temperature: number;
  timeoutMs: number;
}
