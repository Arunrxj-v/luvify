/**
 * AI provider tests.
 *
 * These verify the real OpenRouter integration contract: the exact HTTP
 * request that goes out, how each failure mode maps to an API error, the
 * structured-output repair loop, project isolation of prompts, and - most
 * importantly - that a provider failure can never silently produce a website.
 *
 * No database is touched: the AI layer is pure apart from `fetch`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  RequirementsSchema,
  SitePageSchema,
  buildProjectKnowledge,
  emptyRequirements,
  mergeRequirements,
} from "@luvify/shared";
import type { AIConfig } from "../src/services/ai/config";
import { AIError, aiToApiError } from "../src/services/ai/errors";
import { generateSiteWithAI } from "../src/services/ai/generation";
import { OpenRouterProvider } from "../src/services/ai/openrouter";
import { completeStructured, extractJsonObject } from "../src/services/ai/json";
import { architecturePrompt, pageCopyPrompt, projectBlock } from "../src/services/ai/prompts";
import { requirementUpdateToPatch } from "../src/services/ai/patch";
import { applyPageCopy } from "../src/services/ai/apply";
import { PageCopySchema, RequirementUpdateSchema } from "../src/services/ai/schemas";
import { getAIProvider, aiIsEnabled } from "../src/services/ai";

const CONFIG: AIConfig = {
  provider: "openrouter",
  apiKey: "sk-test-key-not-real",
  model: "openai/gpt-4o-mini",
  baseUrl: "https://openrouter.ai/api/v1",
  timeoutMs: 5_000,
  maxRetries: 1,
  temperature: 0.6,
  maxTokens: 4_096,
  appUrl: "http://localhost:4000",
  appTitle: "Luvify",
};

const provider = new OpenRouterProvider(CONFIG);

function okBody(text: string) {
  return {
    model: "openai/gpt-4o-mini",
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenRouterProvider request", () => {
  it("POSTs to {baseUrl}/chat/completions with the key, model and messages", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(okBody("hello")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.complete({
      operation: "page_content",
      projectId: "proj-1",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as
      | [string, { method: string; headers: Record<string, string>; body: string }]
      | undefined;
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.headers.authorization).toBe("Bearer sk-test-key-not-real");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);

    expect(result.text).toBe("hello");
    expect(result.model).toBe("openai/gpt-4o-mini");
    expect(result.usage.totalTokens).toBe(15);
  });

  it("never logs or returns the API key", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(okBody("hi")));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await provider.complete({ operation: "chat_reply", projectId: "p", messages: [] });

    const logged = (spy.mock.calls ?? []).flat().join("\n");
    expect(logged).not.toContain(CONFIG.apiKey);
    expect(JSON.stringify(spy.mock.calls ?? [])).not.toContain("Bearer ");
  });

  it("sends the JSON response_format when json output is requested", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(okBody("{}")));
    vi.stubGlobal("fetch", fetchMock);

    await provider.complete({ operation: "architecture_plan", messages: [], json: true });

    const call = fetchMock.mock.calls[0] as [string, { body: string }] | undefined;
    const body = JSON.parse(call?.[1]?.body ?? "{}");
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});

describe("failure classification", () => {
  it("reports a missing key as ai_not_configured without sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const noKey = new OpenRouterProvider({ ...CONFIG, apiKey: "" });

    const error = await noKey
      .complete({ operation: "page_content", messages: [] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe("missing_api_key");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(aiToApiError(error).status).toBe(503);
    // The message must name the variable but never contain a key.
    expect((error as AIError).message).toContain("OPENROUTER_API_KEY");
    expect((error as AIError).message).not.toContain(CONFIG.apiKey);
  });

  it.each([
    [401, "invalid_api_key", 502],
    [403, "invalid_api_key", 502],
    [402, "insufficient_credits", 402],
    [429, "rate_limited", 429],
    [404, "model_unavailable", 502],
    [500, "provider_error", 502],
  ])("maps HTTP %i to %s and status %i", async (status, kind, httpStatus) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => jsonResponse({ error: { message: "boom" } }, status)));

    const error = await provider
      .complete({ operation: "page_content", messages: [] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe(kind);
    const api = aiToApiError(error);
    expect(api.status).toBe(httpStatus);
    expect(api.message).toContain("boom");
  });

  it("retries a 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ error: { message: "slow down" } }, 429))
      .mockImplementationOnce(() => jsonResponse(okBody("recovered")));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    const result = await provider.complete({ operation: "page_content", messages: [] });

    expect(result.text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
  });

  it("treats an abort as a timeout", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const error = await provider
      .complete({ operation: "page_content", messages: [] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("timeout");
    expect(aiToApiError(error).status).toBe(504);
  });

  it("reports unreachable hosts as network_error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const error = await provider
      .complete({ operation: "page_content", messages: [] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("network_error");
    expect((error as AIError).retryable).toBe(true);
  });

  it("reports a non-JSON envelope as malformed_json", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => jsonResponse("<html>gateway</html>")));

    const error = await provider
      .complete({ operation: "page_content", messages: [] })
      .catch((caught: unknown) => caught);

    expect((error as AIError).kind).toBe("malformed_json");
  });
});


// ---------------------------------------------------------------------------
// Structured output
// ---------------------------------------------------------------------------

/** In-memory provider so structured-output tests never touch the network. */
function scriptedProvider(responses: string[]) {
  let cursor = 0;
  return {
    name: "openrouter",
    model: "test-model",
    calls: [] as string[],
    async complete(request: { messages: Array<{ role: string; content: string }> }) {
      this.calls.push(request.messages.map((message) => message.content).join("\n"));
      const text = responses[Math.min(cursor, responses.length - 1)] ?? "";
      cursor += 1;
      return { text, model: "test-model", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 1, attempts: 1 };
    },
  };
}

describe("structured output", () => {
  it("extracts a JSON object from fenced or prose-wrapped replies", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Sure! Here you go: {"a":1} hope that helps')).toBe('{"a":1}');
    expect(extractJsonObject('{"a":{"b":2}}')).toBe('{"a":{"b":2}}');
  });

  it("returns schema-validated data on a good first reply", async () => {
    const schema = z.object({ businessSummary: z.string(), offerings: z.array(z.string()) });
    const ai = scriptedProvider([JSON.stringify({ businessSummary: "a clinic", offerings: ["check-ups"] })]);

    const result = await completeStructured(ai as never, {
      operation: "requirement_extraction",
      projectId: "p1",
      system: "system",
      user: "user",
      schema,
    });

    expect(result.data.businessSummary).toBe("a clinic");
    expect(result.data.offerings).toEqual(["check-ups"]);
    expect(ai.calls).toHaveLength(1);
  });

  it("repairs a reply that fails the schema, then succeeds", async () => {
    const planSchema = z.object({
      archetype: z.string().min(1),
      pages: z.array(z.object({ name: z.string().min(1), path: z.string().min(1) })).min(1),
    });
    const ai = scriptedProvider([
      JSON.stringify({ pages: [] }),
      JSON.stringify({ archetype: "restaurant", pages: [{ name: "Menu", path: "/menu" }] }),
    ]);

    const result = await completeStructured(ai as never, {
      operation: "architecture_plan",
      projectId: "p1",
      system: "system",
      user: "user",
      schema: planSchema,
    });

    expect(result.data.archetype).toBe("restaurant");
    // Two calls: original + one repair carrying the validation problem.
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]).toContain("was rejected");
  });

  it("throws invalid_output when the model never satisfies the schema", async () => {
    const ai = scriptedProvider(["not json at all", "still not json"]);
    const error = await completeStructured(ai as never, {
      operation: "page_content",
      projectId: "p1",
      system: "system",
      user: "user",
      schema: PageCopySchema,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe("invalid_output");
    expect(ai.calls).toHaveLength(2);
  });
});


// ---------------------------------------------------------------------------
// Project isolation - one project can never see another's content
// ---------------------------------------------------------------------------

function requirementsFor(name: string, description: string, offerings: string[], type: string) {
  const base = emptyRequirements(type);
  return RequirementsSchema.parse({
    ...base,
    business: { ...base.business, name, description, offerings },
    website: { ...base.website, type, requiredPages: ["Home", "About", "Contact"] },
  });
}

describe("project context isolation", () => {
  const hospital = buildProjectKnowledge(
    requirementsFor("Sunrise Clinic", "A clinic offering appointments for patients", ["doctor appointments"], "business"),
    { projectId: "proj-hospital" },
  );
  const candleShop = buildProjectKnowledge(
    requirementsFor("Ember Candles", "Hand poured scented candles", ["scented candles"], "ecommerce"),
    { projectId: "proj-candles" },
  );

  it("keeps each project's facts out of the other project's prompt", () => {
    const hospitalPrompt = pageCopyPrompt({
      siteName: "Sunrise Clinic",
      websiteType: "business",
      knowledge: hospital,
      architecture: { archetype: "healthcare", pages: [{ name: "Doctors", path: "/doctors", purpose: "list doctors" }] },
      page: { name: "Doctors", path: "/doctors", purpose: "list doctors", contentRequirements: [], sectionTypes: ["Hero"] },
    });

    expect(hospitalPrompt.user).toContain("Sunrise Clinic");
    expect(hospitalPrompt.user).toContain("proj-hospital");
    expect(hospitalPrompt.user).not.toContain("Ember Candles");
    expect(hospitalPrompt.user).not.toContain("scented candles");
    expect(hospitalPrompt.user).not.toContain("proj-candles");
  });

  it("stamps the project id so every request is traceable to one project", () => {
    const block = projectBlock({ siteName: "Sunrise Clinic", websiteType: "business", knowledge: hospital });
    expect(block).toContain("proj-hospital");
    expect(block).toContain("Sunrise Clinic");
  });

  it("never mixes domains when planning architecture", () => {
    const prompt = architecturePrompt({
      siteName: "Sunrise Clinic",
      websiteType: "business",
      knowledge: hospital,
      features: ["online appointment booking"],
      requiredPages: ["Doctors", "Book Appointment"],
      primaryGoal: "Book appointments",
      conversionAction: "Book an appointment",
    });

    expect(prompt.user).toContain("online appointment booking");
    expect(prompt.user).not.toContain("candles");
    // The domain rules explicitly forbid e-commerce scaffolding on a clinic.
    expect(prompt.system).toContain("Do NOT propose Shop, Cart, Checkout");
  });
});

// ---------------------------------------------------------------------------
// Requirements patching - never erases what the client already told us
// ---------------------------------------------------------------------------

describe("requirementUpdateToPatch", () => {
  const current = requirementsFor(
    "Sunrise Clinic",
    "A clinic offering appointments",
    ["doctor appointments"],
    "business",
  );

  it("returns an empty patch when the model states nothing new", () => {
    const patch = requirementUpdateToPatch(
      RequirementUpdateSchema.parse({ offerings: [], requiredPages: [], services: [], products: [] }),
      current,
    );
    expect(Object.keys(patch)).toHaveLength(0);
  });

  it("only touches the fields the client actually stated", () => {
    const patch = requirementUpdateToPatch(
      RequirementUpdateSchema.parse({ toneOfVoice: "warm and reassuring", offerings: [] }),
      current,
    );

    expect(patch.website?.toneOfVoice).toBe("warm and reassuring");
    // Untouched fields are absent, so the merge cannot blank them out.
    expect(patch.business).toBeUndefined();
    expect(patch.content).toBeUndefined();
  });

  it("produces a patch that survives the real schema merge", () => {
    const patch = requirementUpdateToPatch(
      RequirementUpdateSchema.parse({
        businessSummary: "A local clinic offering appointments",
        targetAudience: "local families",
        requiredPages: ["Doctors", "Book Appointment"],
      }),
      current,
    );

    const merged = RequirementsSchema.parse(mergeRequirements(current, patch));
    expect(merged.business.targetAudience).toBe("local families");
    expect(merged.website.requiredPages).toContain("Doctors");
    // Existing knowledge survives the merge.
    expect(merged.business.name).toBe("Sunrise Clinic");
    expect(merged.business.offerings).toEqual(["doctor appointments"]);
  });
});


// ---------------------------------------------------------------------------
// Copy application - the model cannot alter structure or fabricate facts
// ---------------------------------------------------------------------------

describe("applyPageCopy", () => {
  const original = SitePageSchema.parse({
    id: "home",
    name: "Home",
    path: "/",
    title: "Old title",
    description: "Old description",
    sections: [
      { id: "hero-1", type: "Hero", title: "Old hero" },
      { id: "contact-1", type: "Contact", email: "real@clinic.test", phone: "+1000", title: "Contact" },
      { id: "test-1", type: "Testimonials", title: "Praise", items: [{ quote: "Client quote", author: "Pat" }] },
      { id: "foot-1", type: "Footer" },
    ],
  });

  const knowledge = buildProjectKnowledge(
    requirementsFor("Sunrise Clinic", "A clinic", ["doctor appointments"], "business"),
    { projectId: "proj-hospital" },
  );

  it("rewrites hero copy but leaves verified contact details alone", () => {
    const copy = PageCopySchema.parse({
      title: "New title",
      description: "New description",
      sections: { hero: { title: "Book with a doctor today", subtitle: "Same week appointments" } },
    });

    const page = applyPageCopy(original, copy, { navigation: [{ label: "Home", path: "/", external: false }], knowledge });

    expect(page.title).toBe("New title");
    expect(page.description).toBe("New description");
    const hero = page.sections.find((section) => section.type === "Hero");
    expect(hero?.type === "Hero" && hero.title).toBe("Book with a doctor today");

    const contact = page.sections.find((section) => section.type === "Contact");
    expect(contact?.type === "Contact" && contact.email).toBe("real@clinic.test");
    expect(contact?.type === "Contact" && contact.phone).toBe("+1000");
  });

  it("never lets the model author testimonials", () => {
    const copy = PageCopySchema.parse({
      sections: {
        testimonials: { title: "Loved by thousands", items: [{ quote: "Made up praise", author: "Nobody" }] },
      },
    });

    const page = applyPageCopy(original, copy, { navigation: [], knowledge });
    const testimonials = page.sections.find((section) => section.type === "Testimonials");
    expect(testimonials?.type === "Testimonials" && testimonials.items[0]?.quote).toBe("Client quote");
    expect(JSON.stringify(page)).not.toContain("Made up praise");
  });

  it("keeps the document structure: no section is added or removed", () => {
    const copy = PageCopySchema.parse({ sections: { hero: { title: "Updated" } } });
    const page = applyPageCopy(original, copy, { navigation: [], knowledge });

    expect(page.sections.map((section) => section.id)).toEqual(
      original.sections.map((section) => section.id),
    );
  });
});

// ---------------------------------------------------------------------------
// Failures must surface - never silently produce a website
// ---------------------------------------------------------------------------

describe("no silent fallback", () => {
  it("rejects instead of generating a website when the provider fails", async () => {
    const failing = {
      name: "openrouter",
      model: "test-model",
      complete: () => Promise.reject(new AIError("rate_limited", "OpenRouter rate limit reached", { retryable: true })),
    };

    const requirements = requirementsFor("Sunrise Clinic", "A clinic offering appointments", ["appointments"], "business");
    const error = await generateSiteWithAI(failing as never, {
      project: { id: "proj-hospital", name: "Sunrise", businessName: "Sunrise Clinic", websiteType: "business", templateId: null },
      requirements,
      versionNumber: 1,
      specificationVersion: 1,
      templateId: null,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).kind).toBe("rate_limited");
    // No document is returned on failure - there is no fabricated site.
    expect((error as { document?: unknown }).document).toBeUndefined();
  });

  it("refuses to expose a provider when a real one is not configured", async () => {
    const { env } = await import("../src/env");
    const original = env.aiProvider;
    try {
      Object.defineProperty(env, "aiProvider", { value: "mock", configurable: true, writable: true });
      expect(aiIsEnabled()).toBe(false);
      // No provider object exists for the offline fixture, so nothing can be
      // called and no output can be produced silently.
      expect(() => getAIProvider()).toThrow(/AI_PROVIDER/i);
    } finally {
      Object.defineProperty(env, "aiProvider", { value: original, configurable: true, writable: true });
    }
  });
});

