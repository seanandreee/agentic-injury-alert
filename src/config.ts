export const config = {
  litellm: {
    baseUrl: process.env.LITELLM_BASE_URL || "http://localhost:4000",
    apiKey: process.env.LITELLM_API_KEY || "",
    model: process.env.LITELLM_MODEL || "anthropic/claude-sonnet-4-20250514",
  },
  serpapi: {
    apiKey: process.env.SERPAPI_KEY || "",
  },
  agent: {
    maxIterations: 8,
    temperature: 0.2,
  },
} as const;
