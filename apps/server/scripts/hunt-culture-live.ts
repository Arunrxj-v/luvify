import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RequirementsSchema,
  buildProjectKnowledge,
  emptyRequirements,
  extractRequirementsFromText,
  mergeRequirements,
  validateDocument,
  type Requirements,
} from "@luvify/shared";
import { exportSite, renderPreview } from "@luvify/site-renderer";
import {
  extractRequirements,
  generateSiteWithAI,
  getAIProvider,
  requirementUpdateToPatch,
  runAI,
} from "../src/services/ai";
import {
  buildGenerationPrompt,
  buildWebsiteSpecification,
  validateGeneratedDocument,
  validateWebsiteSpecification,
} from "../src/services/ai/prompt-builder";
import type {
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
} from "../src/services/ai/provider";

class RecordingProvider implements AIProvider {
  readonly requests: AICompletionRequest[] = [];
  readonly responses: Array<{ operation: string; model: string; characters: number; latencyMs: number }> = [];

  constructor(private readonly inner: AIProvider) {}

  get name(): string {
    return this.inner.name;
  }

  get model(): string {
    return this.inner.model;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    this.requests.push(structuredClone(request));
    const result = await this.inner.complete(request);
    this.responses.push({
      operation: request.operation,
      model: result.model,
      characters: result.text.length,
      latencyMs: result.latencyMs,
    });
    return result;
  }
}

const RAW_INPUT = `
Hunt Culture is an independent streetwear label based in Kochi, India, selling heavyweight T-shirts and hoodies for streetwear shoppers in India.

Catalogue:
- Heavyweight Tee, ₹1,499, T-Shirts, sizes S, M, L, XL, colours Bone and Black, oversized fit.
- Bone Hoodie, ₹2,499, Hoodies, sizes M, L, XL, colours Bone and Washed Black.

We ship across India in 3-5 working days and accept returns within 7 days of delivery.
Contact us at hello@huntculture.test.
Pages: Home, Shop, Product, Shipping, Contact.
`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function productItems(document: Awaited<ReturnType<typeof generateSiteWithAI>>["document"]) {
  return document.pages.flatMap((page) =>
    page.sections.flatMap((section) => {
      if (section.type === "Products" || section.type === "ProductGrid") return section.items;
      if (section.type === "ProductCard") return [section.product];
      return [];
    }),
  );
}

function save(outputDir: string, name: string, value: string): void {
  fs.writeFileSync(path.join(outputDir, name), value);
}

async function main(): Promise<void> {
  const outputDir = process.env.HUNT_E2E_OUT
    ? path.resolve(process.env.HUNT_E2E_OUT)
    : fs.mkdtempSync(path.join(os.tmpdir(), "luvify-hunt-culture-"));
  fs.mkdirSync(outputDir, { recursive: true });

  const inner = getAIProvider();
  const provider = new RecordingProvider(inner);
  assert(provider.name === "gemini", `expected gemini provider, got ${provider.name}`);

  const base = emptyRequirements("ecommerce");
  const deterministic = extractRequirementsFromText(RAW_INPUT, base);
  let requirements: Requirements = RequirementsSchema.parse(mergeRequirements(base, deterministic));

  const extractionContext = {
    projectId: "hunt-culture-live",
    siteName: "Hunt Culture",
    websiteType: "ecommerce",
    knowledge: buildProjectKnowledge(requirements, {
      projectId: "hunt-culture-live",
      archetype: "ecommerce",
    }),
  };
  const update = await runAI(() => extractRequirements(provider, extractionContext, RAW_INPUT, []));
  requirements = RequirementsSchema.parse(
    mergeRequirements(requirements, requirementUpdateToPatch(update, requirements)),
  );
  save(outputDir, "extracted-requirements.json", JSON.stringify(requirements, null, 2));

  const generated = await runAI(() =>
    generateSiteWithAI(provider, {
      project: {
        id: "hunt-culture-live",
        name: "Hunt Culture",
        businessName: "Hunt Culture",
        websiteType: "ecommerce",
        templateId: null,
      },
      requirements,
      versionNumber: 1,
      specificationVersion: 1,
      templateId: null,
      assets: [],
    }),
  );

  const approvedPlan = {
    archetype: generated.specification.architecture.archetype,
    pages: generated.specification.architecture.pages.map((page) => ({
      name: page.name,
      path: page.path,
      purpose: page.purpose,
    })),
    userJourneys: generated.requirements.website.userJourneys,
  };
  const detailedSpec = buildWebsiteSpecification({
    project: {
      id: "hunt-culture-live",
      name: "Hunt Culture",
      businessName: "Hunt Culture",
      websiteType: "ecommerce",
      templateId: null,
    },
    requirements: generated.requirements,
    plan: approvedPlan,
  });
  const detailedPrompt = buildGenerationPrompt(detailedSpec);
  const specValidation = validateWebsiteSpecification(detailedSpec);
  const documentValidation = validateGeneratedDocument(detailedSpec, generated.document);
  const grounding = validateDocument(generated.document, buildProjectKnowledge(generated.requirements, {
    projectId: "hunt-culture-live",
    archetype: generated.specification.architecture.archetype,
  }));

  save(outputDir, "detailed-generation-prompt.txt", detailedPrompt);
  save(
    outputDir,
    "provider-requests.json",
    JSON.stringify(
      provider.requests.map((request) => ({
        operation: request.operation,
        json: request.json ?? false,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        messages: request.messages,
      })),
      null,
      2,
    ),
  );
  save(outputDir, "provider-responses.json", JSON.stringify(provider.responses, null, 2));
  save(outputDir, "generated-site.json", JSON.stringify(generated.document, null, 2));
  save(outputDir, "requirements.json", JSON.stringify(generated.requirements, null, 2));
  save(outputDir, "grounding-report.json", JSON.stringify(grounding.report, null, 2));

  const siteDir = path.join(outputDir, "site");
  fs.mkdirSync(siteDir, { recursive: true });
  const exported = exportSite(generated.document, {
    projectName: "hunt-culture-live",
    siteUrl: "https://hunt-culture.example",
  });
  for (const file of exported.files) {
    const target = path.join(siteDir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }

  const paths = generated.document.pages.map((page) => page.path);
  const knownPaths = new Set(paths);
  const navBroken = generated.document.navigation
    .filter((link) => !link.external && link.path.startsWith("/"))
    .filter((link) => !knownPaths.has(link.path))
    .map((link) => `${link.label} -> ${link.path}`);
  const products = productItems(generated.document);
  const allHtml = generated.document.pages.map((page) => renderPreview(generated.document, page.path).html);
  const htmlChecks = generated.document.pages.map((page) => {
    const html = renderPreview(generated.document, page.path).html;
    return {
      path: page.path,
      hasViewport: /<meta name="viewport" content="width=device-width/i.test(html),
      hasNavigation: /class="lv-nav"/.test(html),
      hasSections: page.sections.length > 0,
      characters: html.length,
    };
  });
  const forbidden = [
    "example.com",
    "Customer name",
    "4.9/5",
    "Free shipping over 60",
    "30 days",
    "Carbon-neutral shipping",
    "next working day",
  ].filter((needle) => allHtml.some((html) => html.includes(needle)));

  assert(generated.document.pages.length >= 5, `expected at least 5 pages, got ${generated.document.pages.length}`);
  assert(paths.includes("/"), "home page is missing");
  assert(paths.includes("/shop"), "shop page is missing");
  assert(navBroken.length === 0, `broken navigation: ${navBroken.join(", ")}`);
  assert(products.length > 0, "no products were rendered");
  assert(
    products.some((product) => product.sizes.length > 0 || product.colors.length > 0 || product.variants.length > 0),
    "no supplied product options reached the rendered site",
  );
  assert(specValidation.ok, `specification invalid: ${specValidation.issues.join("; ")}`);
  assert(documentValidation.ok, `document invalid: ${documentValidation.issues.join("; ")}`);
  assert(grounding.report.unsupportedClaims.length === 0, `unsupported claims: ${grounding.report.unsupportedClaims.join("; ")}`);
  assert(htmlChecks.every((check) => check.hasViewport), "a page is missing the responsive viewport meta tag");
  assert(htmlChecks.every((check) => check.hasSections), "a page has no sections");
  assert(forbidden.length === 0, `template fallback content leaked into the site: ${forbidden.join(", ")}`);

  const summary = {
    outputDir,
    provider: provider.name,
    model: provider.model,
    providerCalls: provider.responses.length,
    operations: provider.responses.map((entry) => entry.operation),
    pages: generated.document.pages.map((page) => ({
      name: page.name,
      path: page.path,
      sections: page.sections.map((section) => section.type),
    })),
    navigation: generated.document.navigation.map((link) => ({ label: link.label, path: link.path })),
    products: products.map((product) => ({
      name: product.name,
      sizes: product.sizes,
      colors: product.colors,
      variants: product.variants,
      imageUrl: product.imageUrl,
    })),
    specValidation,
    documentValidation,
    grounding: {
      qualityScore: grounding.report.qualityScore,
      unsupportedClaims: grounding.report.unsupportedClaims,
      clearedFields: grounding.report.clearedFields,
    },
    htmlChecks,
    forbiddenFallbacks: forbidden,
    detailedPromptCharacters: detailedPrompt.length,
    providerRequestCharacters: provider.requests.reduce(
      (total, request) => total + request.messages.reduce((sum, message) => sum + message.content.length, 0),
      0,
    ),
    report: generated.report,
  };
  save(outputDir, "report.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error("[hunt-culture-live] FAILED:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
