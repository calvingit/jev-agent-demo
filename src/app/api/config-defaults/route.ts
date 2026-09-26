import {
  DEFAULT_TEMPERATURE,
  DEFAULT_TIMEOUT_MS,
  SERVER_JEV,
  SERVER_REASONING,
} from "@/lib/server-config";
import type { ServerDefaults } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Non-secret defaults for the Model Settings UI. Booleans say whether a key is
 * configured server-side; key values themselves never leave the server.
 */
export async function GET() {
  const defaults: ServerDefaults = {
    jev: { baseUrl: SERVER_JEV.baseUrl, model: SERVER_JEV.model, hasKey: SERVER_JEV.hasKey },
    reasoning: {
      baseUrl: SERVER_REASONING.baseUrl,
      model: SERVER_REASONING.model,
      hasKey: SERVER_REASONING.hasKey,
    },
    temperature: DEFAULT_TEMPERATURE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  return Response.json(defaults);
}
