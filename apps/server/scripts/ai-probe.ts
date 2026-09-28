/**
 * Live AI probe: `npx tsx apps/server/scripts/ai-probe.ts`
 *
 * Sends one real request through the same `OpenRouterProvider` the API routes
 * use, then reports exactly what happened - status, model, token usage or the
 * classified failure kind. Used to verify the integration end to end instead of
 * assuming the wiring is correct.
 *
 * Never prints the API key.
 */

import { readAIConfig, usesRealProvider } from "../src/services/ai/config";
import { AIError } from "../src/services/ai/errors";
import { OpenRouterProvider } from "../src/services/ai/openrouter";
import { logAI } from "../src/services/ai/logger";

async function main(): Promise<void> {
  const config = readAIConfig();

  logAI("probe_config", {
    operation: "probe",
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyPresent: config.apiKey.length > 0,
    timeoutMs: config.timeoutMs,
  });

  if (!usesRealProvider(config.provider)) {
    console.error(`AI_PROVIDER="${config.provider}" is not a real provider - nothing to probe.`);
    process.exitCode = 2;
    return;
  }

  const provider = new OpenRouterProvider(config);
  try {
    const result = await provider.complete({
      operation: "probe",
      messages: [
        { role: "system", content: "Reply with exactly the word PONG." },
        { role: "user", content: "Ping" },
      ],
      maxTokens: 20,
    });
    console.log(
      `[probe] OK provider=${provider.name} model=${result.model} attempts=${result.attempts} ` +
        `latencyMs=${result.latencyMs} tokens=${result.usage.totalTokens} reply=${JSON.stringify(result.text)}`,
    );
  } catch (error) {
    if (error instanceof AIError) {
      console.error(
        `[probe] FAILED kind=${error.kind} retryable=${error.retryable} ` +
          `upstreamStatus=${error.upstreamStatus ?? "n/a"} message=${error.message}`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

void main();
