import OpenAI from "openai";
import { config } from "./config.js";

/**
 * Creates an OpenAI-compatible client pointed at the LiteLLM proxy.
 *
 * LiteLLM exposes an OpenAI-compatible `/v1` endpoint, so we reuse the
 * official `openai` SDK. The model string uses LiteLLM's provider prefix
 * format (e.g. "anthropic/claude-sonnet-4-20250514") — LiteLLM handles the
 * translation to the upstream provider.
 */
export function createClient(): OpenAI {
  return new OpenAI({
    baseURL: config.litellm.baseUrl + "/v1",
    apiKey: config.litellm.apiKey,
  });
}

export function getModel(): string {
  return config.litellm.model;
}
