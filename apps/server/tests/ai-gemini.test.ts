/**
 * Google Gemini provider tests.
 *
 * Verifies the same contract the OpenRouter tests cover, for the Gemini side:
 * message mapping onto `contents`/`systemInstruction`, SDK JSON mode for
 * structured stages, retry behaviour, and how each SDK failure maps onto the
 * shared `AIError` taxonomy.
 *
 * `@google/genai` is mocked, so no network call and no real key is involved.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import type { AIConfig } from "../src/services/ai/config";
import { AIError, aiToApiError } from "../src/services/ai/errors";
import { GeminiProvider, parseRetryAfterMs, retryDelayFor } from "../src/services/ai/gemini";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Constructor signature matches the real client; only the call is faked.
    GoogleGenAI: class {
      models = { generateContent: (params: unknown) => generateContent(params) };
    },
  };
});

const CONFIG: AIConfig = {
  provider: "gemini",
  apiKey: "AIza-test-key-not-real",
  model: "gemini-2.5-flash",
  baseUrl: "https://generativelanguage.googleapis.com",
  timeoutMs: 5_000,
  maxRetries: 1,
  temperature: 0.6,
  maxTokens: 4_096,
  appUrl: "http://localhost:4000",
  appTitle: "Luvify",
};

const provider = new GeminiProvider(CONFIG);

function okResponse(text: string, modelVersion = "gemini-2.5-flash") {
  return {
    text,
    modelVersion,
    candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  };
}

function apiError(status: number, message: string): ApiError {
  return new ApiError({ status, message: JSON.stringify({ error: { message, code: status } }) });
}

/** Config for backoff tests: unique timeoutMs so abort timers are filterable. */
const SCHEDULE_CONFIG: AIConfig = { ...CONFIG, timeoutMs: 7_777, maxRetries: 4 };

/**
 * Runs `setTimeout` callbacks immediately (like the OpenRouter tests do) so
 * retry backoff never costs real waiting time, and returns every delay that
 * was requested, in order.
 */
function recordTimers(): number[] {
  const delays: number[] = [];
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: (...args: unknown[]) => void, ms?: number) => {
    if (typeof ms === "number") delays.push(ms);
    fn();
    return 0 as unknown as NodeJS.Timeout;
  }) as typeof setTimeout);
  return delays;
}

/** Same as `recordTimers`, without keeping the delays. */
function mockImmediateTimers(): void {
  recordTimers();
}

afterEach(() => {
  generateContent.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GeminiProvider request", () => {
  it("maps system/user/assistant messages onto systemInstruction and contents", async () => {
    generateContent.mockResolvedValue(okResponse("hello"));

    const result = await provider.complete({
      operation: "page_content",
      projectId: "proj-1",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
        { role: "assistant", content: "earlier reply" },
      ],
      temperature: 0.7,
      maxTokens: 1_024,
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    const params = generateContent.mock.calls[0]?.[0] as {
      model: string;
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      config: Record<string, unknown>;
    };
    expect(params.model).toBe("gemini-2.5-flash");
    expect(params.config.systemInstruction).toBe("system prompt");
    expect(params.contents).toEqual([
      { role: "user", parts: [{ text: "user prompt" }] },
      { role: "model", parts: [{ text: "earlier reply" }] },
    ]);
    expect(params.config.temperature).toBe(0.7);
    expect(params.config.maxOutputTokens).toBe(1_024);
    // Plain (non-JSON) calls must not force JSON mode.
    expect(params.config.responseMimeType).toBeUndefined();

    expect(result.text).toBe("hello");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(result.attempts).toBe(1);
  });

  it("enables the SDK JSON mode when structured output is requested", async () => {
    generateContent.mockResolvedValue(okResponse("{}"));

    await provider.complete({ operation: "architecture_plan", messages: [{ role: "user", content: "go" }], json: true });

    const params = generateContent.mock.calls[0]?.[0] as { config: Record<string, unknown> };
    expect(params.config.responseMimeType).toBe("application/json");
  });

  it("never logs or returns the API key", async () => {
    generateContent.mockResolvedValue(okResponse("hi"));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await provider.complete({ operation: "chat_reply", projectId: "p", messages: [{ role: "user", content: "hi" }] });

    const logged = (spy.mock.calls ?? []).flat().join("\n");
    expect(logged).not.toContain(CONFIG.apiKey);
    expect(JSON.stringify(spy.mock.calls ?? [])).not.toContain("AIza-");
  });
});

describe("GeminiProvider failure classification", () => {
  it("reports a missing key as ai_not_configured without sending a request", async () => {
    const noKey = new GeminiProvider({ ...CONFIG, apiKey: "" });

    const error = await noKey
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe("missing_api_key");
    expect(generateContent).not.toHaveBeenCalled();
    expect(aiToApiError(error).status).toBe(503);
    expect((error as AIError).message).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect((error as AIError).message).not.toContain(CONFIG.apiKey);
  });

  it.each([
    [401, "invalid_api_key", 502],
    [403, "invalid_api_key", 502],
    [404, "model_unavailable", 502],
    [429, "rate_limited", 429],
    [500, "provider_error", 502],
    [503, "provider_error", 502],
  ])("maps HTTP %i to %s and status %i", async (status, kind, httpStatus) => {
    // Backoff must not slow the suite down; the schedule itself is tested below.
    mockImmediateTimers();
    generateContent.mockRejectedValue(apiError(status, "boom"));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe(kind);
    const api = aiToApiError(error);
    expect(api.status).toBe(httpStatus);
    expect(api.message).toContain("boom");
  });

  it("maps a 400 'API key not valid' to invalid_api_key", async () => {
    generateContent.mockRejectedValue(apiError(400, "API key not valid. Please pass a valid API key."));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("invalid_api_key");
    expect(aiToApiError(error).status).toBe(502);
  });

  it("retries a 429 then succeeds", async () => {
    mockImmediateTimers();
    generateContent
      .mockRejectedValueOnce(apiError(429, "slow down"))
      .mockResolvedValueOnce(okResponse("recovered"));

    const result = await provider.complete({
      operation: "page_content",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("recovered");
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
  });

  it("classifies an aborted request as a timeout", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("timeout");
    expect(aiToApiError(error).status).toBe(504);
  });

  it("classifies an SDK timeout as a timeout", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("Request timed out"), { name: "RequestTimeoutError" }));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("timeout");
    expect((error as AIError).retryable).toBe(true);
  });

  it("classifies unreachable hosts as network_error", async () => {
    generateContent.mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { name: "ConnectionError" }),
    );

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("network_error");
    expect((error as AIError).retryable).toBe(true);
  });

  it("classifies an unparseable response envelope as malformed_json", async () => {
    generateContent.mockRejectedValue(new SyntaxError("Unexpected token '<' in JSON"));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("malformed_json");
  });

  it("treats an empty completion as invalid_output", async () => {
    generateContent.mockResolvedValue({ text: "", candidates: [], usageMetadata: {} });

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("invalid_output");
    expect((error as AIError).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Transient failures (429 / 5xx): backoff, Retry-After, final message
// ---------------------------------------------------------------------------

describe("transient Gemini failures", () => {
  it("backs off 2s -> 5s -> 10s -> 20s across attempts when Gemini returns 503", async () => {
    const delays = recordTimers();
    generateContent.mockRejectedValue(
      apiError(503, "This model is currently experiencing high demand. Spikes in demand are usually temporary."),
    );

    const scheduled = new GeminiProvider(SCHEDULE_CONFIG);
    const error = await scheduled
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    // maxRetries 4 -> one initial attempt plus four retries.
    expect(generateContent).toHaveBeenCalledTimes(5);
    // Everything except the provider's own 7777ms abort timer is a retry delay.
    expect(delays.filter((delay) => delay !== SCHEDULE_CONFIG.timeoutMs)).toEqual([
      2_000, 5_000, 10_000, 20_000,
    ]);

    const api = aiToApiError(error);
    expect(api.status).toBe(502);
    expect(api.message).toContain("Gemini is temporarily unavailable");
    expect(api.message).toContain("high demand");
  });

  it("recovers when Gemini stops returning 503", async () => {
    mockImmediateTimers();
    generateContent
      .mockRejectedValueOnce(apiError(503, "high demand"))
      .mockResolvedValueOnce(okResponse("recovered"));

    const result = await provider.complete({
      operation: "page_content",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("recovered");
    expect(result.attempts).toBe(2);
  });

  it("waits at least as long as Gemini's Retry-After header", async () => {
    const delays = recordTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("busy", { status: 503, headers: { "retry-after": "7" } })),
    );
    // Mimic the SDK: run the provider's per-request fetch wrapper, then fail.
    generateContent.mockImplementation(async (params: {
      config?: { httpOptions?: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } };
    }) => {
      const capture = params.config?.httpOptions?.fetch;
      if (capture) await capture("https://generativelanguage.googleapis.com/v1beta/models", { method: "POST" });
      throw apiError(503, "high demand");
    });

    const oneRetry = new GeminiProvider({ ...SCHEDULE_CONFIG, maxRetries: 1 });
    await oneRetry.complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] }).catch(() => {});

    // Retry-After says 7s, which beats the 2s schedule.
    expect(delays.filter((delay) => delay !== SCHEDULE_CONFIG.timeoutMs)).toEqual([7_000]);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("keeps its own schedule when Retry-After asks for less", async () => {
    const delays = recordTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("busy", { status: 429, headers: { "retry-after": "1" } })),
    );
    generateContent.mockImplementation(async (params: {
      config?: { httpOptions?: { fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } };
    }) => {
      const capture = params.config?.httpOptions?.fetch;
      if (capture) await capture("https://generativelanguage.googleapis.com/v1beta/models", { method: "POST" });
      throw apiError(429, "quota exceeded");
    });

    const oneRetry = new GeminiProvider({ ...SCHEDULE_CONFIG, maxRetries: 1 });
    await oneRetry.complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] }).catch(() => {});

    expect(delays.filter((delay) => delay !== SCHEDULE_CONFIG.timeoutMs)).toEqual([2_000]);
  });

  it("never retries authentication errors", async () => {
    mockImmediateTimers();
    generateContent.mockRejectedValue(apiError(401, "API key not valid."));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect((error as AIError).kind).toBe("invalid_api_key");
    expect((error as AIError).message).not.toMatch(/temporarily unavailable/i);
  });

  it("never retries malformed requests (HTTP 400)", async () => {
    mockImmediateTimers();
    generateContent.mockRejectedValue(apiError(400, "Invalid JSON payload received."));

    const error = await provider
      .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect((error as AIError).kind).toBe("provider_error");
    expect((error as AIError).retryable).toBe(false);
    expect((error as AIError).message).not.toMatch(/temporarily unavailable/i);
  });

  it("takes the retry count from the shared AI_MAX_RETRIES setting", async () => {
    const { env } = await import("../src/env");
    const { readAIConfig } = await import("../src/services/ai/config");
    const originalProvider = env.aiProvider;
    const originalRetries = env.geminiMaxRetries;
    const originalFallback = env.geminiFallbackModel;
    try {
      Object.defineProperty(env, "aiProvider", { value: "gemini", configurable: true, writable: true });
      Object.defineProperty(env, "geminiMaxRetries", { value: 0, configurable: true, writable: true });
      // Isolate this test on the primary model: the fallback is covered below.
      Object.defineProperty(env, "geminiFallbackModel", { value: "", configurable: true, writable: true });

      const config = readAIConfig();
      expect(config.maxRetries).toBe(0);
      generateContent.mockRejectedValue(apiError(503, "high demand"));

      const noRetries = new GeminiProvider({ ...config, apiKey: CONFIG.apiKey });
      const error = await noRetries
        .complete({ operation: "page_content", messages: [{ role: "user", content: "hi" }] })
        .catch((caught: unknown) => caught);

      // Zero retries (AI_MAX_RETRIES=0) -> exactly one attempt, then the final error.
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect((error as AIError).message).toContain("Gemini is temporarily unavailable");
    } finally {
      Object.defineProperty(env, "aiProvider", { value: originalProvider, configurable: true, writable: true });
      Object.defineProperty(env, "geminiMaxRetries", { value: originalRetries, configurable: true, writable: true });
      Object.defineProperty(env, "geminiFallbackModel", { value: originalFallback, configurable: true, writable: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback model (GEMINI_FALLBACK_MODEL): one extra cycle, same request
// ---------------------------------------------------------------------------

describe("Gemini model fallback", () => {
  /** Primary = Gemini 3.8 Flash, fallback = the configurable GEMINI_FALLBACK_MODEL. */
  const FALLBACK_CONFIG: AIConfig = {
    ...CONFIG,
    model: "gemini-3.8-flash",
    fallbackModel: "gemini-3.5-flash-lite",
    maxRetries: 1,
    timeoutMs: 7_777,
  };

  const REQUEST = {
    operation: "page_content",
    projectId: "proj-fallback",
    messages: [{ role: "user" as const, content: "hi" }],
  };

  it("falls back to GEMINI_FALLBACK_MODEL once the primary exhausts its retries", async () => {
    mockImmediateTimers();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    generateContent.mockImplementation(async (params: { model?: string }) => {
      if (params.model === "gemini-3.8-flash") {
        throw apiError(503, "This model is currently experiencing high demand.");
      }
      return okResponse("served by fallback", "gemini-3.5-flash-lite");
    });

    const result = await new GeminiProvider(FALLBACK_CONFIG).complete(REQUEST);

    // Primary cycle first (initial + AI_MAX_RETRIES), then the fallback cycle.
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(
      generateContent.mock.calls.map((call) => (call[0] as { model: string }).model),
    ).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"]);

    expect(result.text).toBe("served by fallback");
    expect(result.model).toBe("gemini-3.5-flash-lite");

    // Which model was used, and that a fallback happened, is logged.
    const logged = spy.mock.calls.flat().join("\n");
    expect(logged).toContain("event=model_fallback");
    expect(logged).toContain("fromModel=gemini-3.8-flash");
    expect(logged).toContain("toModel=gemini-3.5-flash-lite");
    expect(logged).toContain("event=model_fallback_result");
    expect(logged).toContain("ok=true");
    expect(logged).toContain("model=gemini-3.5-flash-lite");
  });

  it("re-sends the identical prompts, JSON mode, temperature and token limit", async () => {
    mockImmediateTimers();
    generateContent.mockImplementation(async (params: { model?: string }) => {
      if (params.model === "gemini-3.8-flash") throw apiError(503, "high demand");
      return okResponse("{}", "gemini-3.5-flash-lite");
    });

    await new GeminiProvider(FALLBACK_CONFIG).complete({
      operation: "architecture_plan",
      projectId: "proj-json",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
      json: true,
      temperature: 0.3,
      maxTokens: 1_024,
    });

    const [primary] = generateContent.mock.calls[0] as [Record<string, unknown>];
    const [fallback] = generateContent.mock.calls[2] as [Record<string, unknown>];
    const primaryConfig = primary.config as Record<string, unknown>;
    const fallbackConfig = fallback.config as Record<string, unknown>;

    expect(fallback.contents).toEqual(primary.contents);
    expect(fallbackConfig.systemInstruction).toBe(primaryConfig.systemInstruction);
    expect(fallbackConfig.responseMimeType).toBe("application/json");
    expect(fallbackConfig.temperature).toBe(0.3);
    expect(fallbackConfig.maxOutputTokens).toBe(1_024);
  });

  it("does not fall back for authentication errors", async () => {
    mockImmediateTimers();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    generateContent.mockRejectedValue(apiError(401, "API key not valid."));

    const error = await new GeminiProvider(FALLBACK_CONFIG)
      .complete(REQUEST)
      .catch((caught: unknown) => caught);

    expect(generateContent).toHaveBeenCalledTimes(1); // no retry, no fallback
    expect((error as AIError).kind).toBe("invalid_api_key");
    expect((error as AIError).message).not.toMatch(/temporarily unavailable/i);
    expect(spy.mock.calls.flat().join("\n")).not.toContain("event=model_fallback");
  });

  it("does not fall back for malformed requests (HTTP 400)", async () => {
    mockImmediateTimers();
    generateContent.mockRejectedValue(apiError(400, "Invalid JSON payload received."));

    const error = await new GeminiProvider(FALLBACK_CONFIG)
      .complete(REQUEST)
      .catch((caught: unknown) => caught);

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect((error as AIError).kind).toBe("provider_error");
    expect((error as AIError).retryable).toBe(false);
    expect((error as AIError).message).not.toMatch(/fallback/i);
  });

  it("does not fall back when no fallback model is configured", async () => {
    mockImmediateTimers();
    generateContent.mockRejectedValue(apiError(503, "high demand"));

    const error = await new GeminiProvider({ ...CONFIG, model: "gemini-3.8-flash" })
      .complete(REQUEST)
      .catch((caught: unknown) => caught);

    expect(generateContent).toHaveBeenCalledTimes(CONFIG.maxRetries + 1);
    expect((error as AIError).message).toContain("Gemini is temporarily unavailable");
    expect((error as AIError).message).not.toContain("fallback model");
  });

  it("does not fall back when the fallback equals the primary model", async () => {
    mockImmediateTimers();
    generateContent.mockRejectedValue(apiError(503, "high demand"));

    const error = await new GeminiProvider({ ...FALLBACK_CONFIG, fallbackModel: "gemini-3.8-flash" })
      .complete(REQUEST)
      .catch((caught: unknown) => caught);

    expect(generateContent).toHaveBeenCalledTimes(FALLBACK_CONFIG.maxRetries + 1);
    expect((error as AIError).message).toContain("Gemini is temporarily unavailable");
  });

  it("reports one friendly error when both models fail", async () => {
    mockImmediateTimers();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    generateContent.mockRejectedValue(
      apiError(503, "This model is currently experiencing high demand. Spikes in demand are usually temporary."),
    );

    const error = await new GeminiProvider(FALLBACK_CONFIG)
      .complete(REQUEST)
      .catch((caught: unknown) => caught);

    // Two full cycles: initial + AI_MAX_RETRIES for each model.
    expect(generateContent).toHaveBeenCalledTimes(2 * (FALLBACK_CONFIG.maxRetries + 1));

    const api = aiToApiError(error);
    expect(api.status).toBe(502); // 5xx -> ai_provider_error, kind preserved
    expect(api.message).toContain("Gemini is temporarily unavailable");
    expect(api.message).toContain("gemini-3.8-flash");
    expect(api.message).toContain("gemini-3.5-flash-lite");
    expect(api.message).toContain("high demand");
    expect(api.message).toContain("Please try again");

    const logged = spy.mock.calls.flat().join("\n");
    expect(logged).toContain("event=model_fallback");
    expect(logged).toContain("ok=false");
    expect(logged).not.toContain(CONFIG.apiKey);
  });

  it("takes the fallback model from the shared environment config", async () => {
    const { env } = await import("../src/env");
    const { readAIConfig } = await import("../src/services/ai/config");
    const originalProvider = env.aiProvider;
    const originalFallback = env.geminiFallbackModel;
    try {
      Object.defineProperty(env, "aiProvider", { value: "gemini", configurable: true, writable: true });
      Object.defineProperty(env, "geminiFallbackModel", {
        value: "unit-test-fallback",
        configurable: true,
        writable: true,
      });

      const config = readAIConfig();
      expect(config.model).toBe(env.geminiModel);
      expect(config.fallbackModel).toBe("unit-test-fallback");
    } finally {
      Object.defineProperty(env, "aiProvider", { value: originalProvider, configurable: true, writable: true });
      Object.defineProperty(env, "geminiFallbackModel", {
        value: originalFallback,
        configurable: true,
        writable: true,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Delay helpers
// ---------------------------------------------------------------------------

describe("retry delay helpers", () => {
  it("parses Retry-After in seconds, milliseconds and HTTP-date form", () => {
    expect(parseRetryAfterMs("7", null)).toBe(7_000);
    expect(parseRetryAfterMs(null, "1500")).toBe(1_500);
    expect(parseRetryAfterMs("0", null)).toBe(0);

    const date = new Date(Date.now() + 30_000).toUTCString();
    const parsed = parseRetryAfterMs(date, null);
    expect(parsed).not.toBeNull();
    expect(parsed as number).toBeGreaterThan(27_000);
    expect(parsed as number).toBeLessThanOrEqual(30_000);

    expect(parseRetryAfterMs(null, null)).toBeNull();
    expect(parseRetryAfterMs("soon", null)).toBeNull();
    expect(parseRetryAfterMs("", "not-a-number")).toBeNull();
  });

  it("backs off 2s, 5s, 10s, 20s then repeats 20s for transient statuses", () => {
    const overload = new AIError("provider_error", "503", { upstreamStatus: 503, retryable: true });
    expect(retryDelayFor(overload, 1, null)).toBe(2_000);
    expect(retryDelayFor(overload, 2, null)).toBe(5_000);
    expect(retryDelayFor(overload, 3, null)).toBe(10_000);
    expect(retryDelayFor(overload, 4, null)).toBe(20_000);
    expect(retryDelayFor(overload, 5, null)).toBe(20_000);

    const rateLimited = new AIError("rate_limited", "429", { upstreamStatus: 429, retryable: true });
    expect(retryDelayFor(rateLimited, 1, null)).toBe(2_000);
  });

  it("never waits less than Retry-After and caps long waits", () => {
    const overload = new AIError("provider_error", "503", { upstreamStatus: 503, retryable: true });
    expect(retryDelayFor(overload, 1, 7_000)).toBe(7_000); // header beats 2s
    expect(retryDelayFor(overload, 3, 3_000)).toBe(10_000); // schedule beats short header
    expect(retryDelayFor(overload, 1, 120_000)).toBe(60_000); // capped
    expect(retryDelayFor(overload, 1, 0)).toBe(2_000); // zero header = absent
  });

  it("keeps the fast backoff for non-upstream retryable failures", () => {
    const network = new AIError("network_error", "fetch failed", { retryable: true });
    const delay = retryDelayFor(network, 1, null);
    expect(delay).toBeGreaterThanOrEqual(250);
    expect(delay).toBeLessThan(600);
  });
});
