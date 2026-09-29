/**
 * Ollama provider tests.
 *
 * These verify the local-provider contract: the exact request that reaches
 * localhost:11434 (and, crucially, that NO OpenRouter credential ever does),
 * how each local failure maps to an API error the UI can act on, and that the
 * provider is selected purely from `AI_PROVIDER`.
 *
 * No daemon and no database are needed: `fetch` is stubbed throughout.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIConfig } from "../src/services/ai/config";
import { AIError, aiToApiError } from "../src/services/ai/errors";
import { OllamaProvider } from "../src/services/ai/ollama";
import { getAIProvider, aiIsEnabled, usesRealProvider } from "../src/services/ai";

const CONFIG: AIConfig = {
  provider: "ollama",
  apiKey: "",
  model: "qwen3.5:4b",
  baseUrl: "http://localhost:11434/v1",
  timeoutMs: 5_000,
  maxRetries: 1,
  temperature: 0.6,
  maxTokens: 4_096,
  appUrl: "http://localhost:4000",
  appTitle: "Luvify",
  reasoningEffort: "none",
};

const provider = new OllamaProvider(CONFIG);

function okBody(text: string) {
  return {
    model: "qwen3.5:4b",
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function failureFrom(promise: Promise<unknown>): Promise<AIError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AIError);
  return error as AIError;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OllamaProvider request", () => {
  it("POSTs to {baseUrl}/chat/completions with the model and no credentials", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(okBody("hello")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.complete({
      operation: "page_content",
      projectId: "proj-hospital",
      messages: [{ role: "user", content: "write the page" }],
    });

    const call = fetchMock.mock.calls[0] as
      | [string, { headers: Record<string, string>; body: string }]
      | undefined;
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    // Local Ollama is unauthenticated: no bearer token, no OpenRouter headers.
    expect(init.headers.authorization).toBeUndefined();
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain("bearer");
    expect(init.headers["content-type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("qwen3.5:4b");
    expect(body.stream).toBe(false);
    expect(body.reasoning_effort).toBe("none");
    // The OpenRouter key must never travel to the local daemon.
    expect(init.body).not.toContain("sk-or-");

    expect(result.text).toBe("hello");
    expect(result.model).toBe("qwen3.5:4b");
  });

  it("sends the JSON response_format when structured output is requested", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(okBody("{}")));
    vi.stubGlobal("fetch", fetchMock);

    await provider.complete({ operation: "architecture_plan", messages: [], json: true });

    const call = fetchMock.mock.calls[0] as [string, { body: string }] | undefined;
    const body = JSON.parse(call?.[1]?.body ?? "{}");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("omits reasoning_effort when configured to auto", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(okBody("hi")));
    vi.stubGlobal("fetch", fetchMock);

    await new OllamaProvider({ ...CONFIG, reasoningEffort: "auto" }).complete({
      operation: "chat_reply",
      messages: [],
    });

    const call = fetchMock.mock.calls[0] as [string, { body: string }] | undefined;
    const body = JSON.parse(call?.[1]?.body ?? "{}");
    expect(body.reasoning_effort).toBeUndefined();
  });
});

describe("local failure classification", () => {
  it("says Ollama is not running when the connection is refused", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const error = await failureFrom(provider.complete({ operation: "page_content", messages: [] }));

    expect(error.kind).toBe("network_error");
    expect(error.message).toBe("Ollama is not running. Start Ollama and try again.");
    expect(error.retryable).toBe(true);
    const api = aiToApiError(error);
    expect(api.status).toBe(502);
    expect(api.code).toBe("ai_network_error");
  });

  it("names the model when Ollama reports it is not installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        jsonResponse({ error: { message: "model 'qwen3.5:4b' not found" } }, 404),
      ),
    );

    const error = await failureFrom(provider.complete({ operation: "page_content", messages: [] }));

    expect(error.kind).toBe("model_unavailable");
    expect(error.message).toContain("qwen3.5:4b is not installed in Ollama.");
    expect(error.message).toContain("ollama pull qwen3.5:4b");
    expect(aiToApiError(error).status).toBe(502);
  });

  it("reports a timeout without blaming the model", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const error = await failureFrom(provider.complete({ operation: "page_content", messages: [] }));

    expect(error.kind).toBe("timeout");
    expect(error.message).toContain("OLLAMA_TIMEOUT_MS");
    expect(aiToApiError(error).status).toBe(504);
  });

  it("explains an empty thinking-model completion instead of returning it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        jsonResponse({
          model: "qwen3.5:4b",
          choices: [{ message: { content: "", reasoning: "thinking..." }, finish_reason: "length" }],
        }),
      ),
    );

    const error = await failureFrom(provider.complete({ operation: "page_content", messages: [] }));

    expect(error.kind).toBe("invalid_output");
    expect(error.message).toContain("empty completion");
    expect(error.message).toContain("AI_MAX_TOKENS");
  });

  it("requires OLLAMA_MODEL instead of sending a request without one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await failureFrom(
      new OllamaProvider({ ...CONFIG, model: "" }).complete({ operation: "page_content", messages: [] }),
    );

    expect(error.kind).toBe("not_configured");
    expect(error.message).toContain("OLLAMA_MODEL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("provider selection", () => {
  it("treats ollama as a real provider", () => {
    expect(usesRealProvider("ollama")).toBe(true);
    expect(usesRealProvider("openrouter")).toBe(true);
    expect(usesRealProvider("mock")).toBe(false);
  });

  it("exposes an OllamaProvider when AI_PROVIDER=ollama", async () => {
    const { env } = await import("../src/env");
    const original = env.aiProvider;
    try {
      Object.defineProperty(env, "aiProvider", { value: "ollama", configurable: true, writable: true });
      expect(aiIsEnabled()).toBe(true);
      expect(getAIProvider()).toBeInstanceOf(OllamaProvider);
    } finally {
      Object.defineProperty(env, "aiProvider", { value: original, configurable: true, writable: true });
    }
  });
});
