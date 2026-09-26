import {
  DEFAULT_JEV_BASE_URL,
  DEFAULT_JEV_MODEL,
  DEFAULT_REASONING_BASE_URL,
  DEFAULT_REASONING_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TIMEOUT_MS,
} from "./defaults";
import type {
  ClientConfigOverride,
  ExperimentConfig,
  JevConfig,
  ReasoningModelConfig,
} from "./types";

/**
 * Server-side defaults come from .env; keys are never sent back to the browser.
 * A key provided in the request (Model Settings) wins over the .env default for
 * that single request and is never persisted anywhere.
 */

export {
  DEFAULT_JEV_BASE_URL,
  DEFAULT_JEV_MODEL,
  DEFAULT_REASONING_BASE_URL,
  DEFAULT_REASONING_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TIMEOUT_MS,
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

const jevApiKey = env("JEV_API_KEY") ?? env("TYPESAFE_API_KEY") ?? "";
const reasoningApiKey = env("OPENAI_API_KEY") ?? env("REASONING_API_KEY") ?? "";

export const SERVER_JEV = {
  baseUrl: env("JEV_BASE_URL") ?? env("TYPESAFE_BASE_URL") ?? DEFAULT_JEV_BASE_URL,
  model: env("JEV_MODEL") ?? DEFAULT_JEV_MODEL,
  apiKey: jevApiKey,
  hasKey: Boolean(jevApiKey),
};

export const SERVER_REASONING = {
  baseUrl: env("OPENAI_BASE_URL") ?? env("REASONING_BASE_URL") ?? DEFAULT_REASONING_BASE_URL,
  model: env("OPENAI_MODEL") ?? env("REASONING_MODEL") ?? DEFAULT_REASONING_MODEL,
  apiKey: reasoningApiKey,
  hasKey: Boolean(reasoningApiKey),
};

export function resolveConfig(overrides?: ClientConfigOverride): ExperimentConfig {
  const timeoutMs =
    overrides?.timeoutMs && overrides.timeoutMs > 0 ? overrides.timeoutMs : DEFAULT_TIMEOUT_MS;

  const jev: JevConfig = {
    baseUrl: overrides?.jev?.baseUrl?.trim() || SERVER_JEV.baseUrl,
    apiKey: overrides?.jev?.apiKey?.trim() || SERVER_JEV.apiKey,
    model: overrides?.jev?.model?.trim() || SERVER_JEV.model,
    timeoutMs,
  };
  const reasoning: ReasoningModelConfig = {
    baseUrl: overrides?.reasoning?.baseUrl?.trim() || SERVER_REASONING.baseUrl,
    apiKey: overrides?.reasoning?.apiKey?.trim() || SERVER_REASONING.apiKey,
    model: overrides?.reasoning?.model?.trim() || SERVER_REASONING.model,
    timeoutMs,
  };
  const temperature =
    typeof overrides?.temperature === "number" && Number.isFinite(overrides.temperature)
      ? overrides.temperature
      : DEFAULT_TEMPERATURE;

  return { jev, reasoning, temperature };
}
