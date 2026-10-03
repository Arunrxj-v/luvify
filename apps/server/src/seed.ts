/**
 * Database seed (`npm run db:seed`) - creates the demo user plus one fully
 * generated sample project so the studio has something to open on first run.
 * Idempotent: re-running it leaves existing data untouched.
 */

import { exportSite } from "@luvify/site-renderer";
import { RequirementsSchema, computeCompleteness, emptyRequirements } from "@luvify/shared";
import { env } from "./env";
import { buildDocument, buildSpecification, resolveTemplateId } from "./generate";
import { completenessSnapshot, nextQuestion } from "./interview";
import { persistSite } from "./pipeline";
import { prisma } from "./prisma";
import { ensureConversation, ensureDemoUser, loadProject, recordActivity, uniqueSlug } from "./store";

const DEMO = {
  projectName: "Harbour Bakery",
  slug: "harbour-bakery",
  businessName: "Harbour Bakery",
  businessDescription:
    "A neighbourhood bakery on the harbour selling sourdough loaves, pastries and celebration cakes, with pre-order collection.",
  websiteType: "restaurant",
  templateId: "restaurant",
};

async function main(): Promise<void> {
  const user = await ensureDemoUser();
  const existing = await prisma.project.findUnique({ where: { slug: DEMO.slug } });
  if (existing) {
    console.log(`[seed] project "${DEMO.slug}" already exists (${existing.id}) - nothing to do.`);
    return;
  }

  const base = emptyRequirements(DEMO.websiteType);
  const requirements = RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: DEMO.businessName,
      description: DEMO.businessDescription,
      industry: "Food & drink",
      targetAudience: "Locals and weekend visitors who value fresh, handmade bread",
      location: "Harbourside",
      uniqueSellingPoints: ["Baked on site every morning", "Naturally leavened sourdough"],
    },
    website: {
      ...base.website,
      type: DEMO.websiteType,
      purpose: "Show the menu and take collection pre-orders",
      primaryGoal: "Get more collection pre-orders",
      conversionAction: "Place a pre-order",
      requiredPages: ["Home", "Menu", "About", "Contact"],
      toneOfVoice: "Warm and welcoming",
    },
    branding: {
      ...base.branding,
      brandName: DEMO.businessName,
      primaryColor: "#b45309",
      accentColor: "#f59e0b",
      style: "warm",
    },
    content: {
      ...base.content,
      headline: "Fresh bread, every morning",
      subheadline: "Sourdough, pastries and cakes baked on the harbourside",
      about:
        "We mix our dough by hand each night and bake it from four in the morning, so the shelves are still warm when the doors open.",
      contact: { ...base.content.contact, email: "hello@harbourbakery.test", phone: "+44 1234 567890" },
    },
    features: { ...base.features, contactForm: true, reviews: true, reviewed: true },
    technical: {
      ...base.technical,
      seo: {
        ...base.technical.seo,
        defaultDescription: "Harbour Bakery - handmade sourdough, pastries and cakes on the harbourside.",
        keywords: ["bakery", "sourdough", "harbourside"],
      },
    },
  });

  const report = computeCompleteness(requirements);
  const slug = await uniqueSlug(DEMO.slug);
  const templateId = resolveTemplateId({
    requested: DEMO.templateId,
    current: null,
    websiteType: DEMO.websiteType,
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: DEMO.projectName,
      slug,
      businessName: DEMO.businessName,
      businessDescription: DEMO.businessDescription,
      websiteType: DEMO.websiteType,
      templateId,
      status: "DISCOVERY",
      requirement: {
        create: {
          data: JSON.stringify(requirements),
          completeness: report.overall,
          breakdown: JSON.stringify(report.categories),
          lastAnalyzedAt: new Date(),
        },
      },
      conversations: {
        create: [
          { title: "Requirements", kind: "REQUIREMENTS" },
          { title: "Builder", kind: "BUILDER" },
        ],
      },
      activities: { create: [{ type: "project_created", message: `Project "${DEMO.projectName}" seeded` }] },
    },
  });

  const conversation = await ensureConversation(project.id, "REQUIREMENTS", "Requirements");
  const question = nextQuestion(requirements);
  await prisma.message.create({
    data: {
      projectId: project.id,
      conversationId: conversation.id,
      role: "assistant",
      content: question
        ? `Welcome to Luvify! First question: ${question.question}`
        : "Welcome to Luvify - your requirements look complete.",
      payload: JSON.stringify({
        kind: question ? "question" : "confirmation",
        questions: question ? [question] : [],
        completeness: completenessSnapshot(report),
        readyForGeneration: report.readyForGeneration,
        provider: env.aiProvider,
      }),
    },
  });

  const loaded = await loadProject(project.id, project.userId);
  const specification = buildSpecification({
    siteName: DEMO.businessName,
    websiteType: DEMO.websiteType,
    requirements,
    provider: env.aiProvider,
    version: 1,
  });
  await prisma.websiteSpecification.create({
    data: { projectId: project.id, data: JSON.stringify(specification), version: 1 },
  });

  const document = buildDocument({
    project: loaded,
    requirements,
    specification,
    versionNumber: 1,
    provider: env.aiProvider,
    templateId,
  });
  const exported = exportSite(document, { projectName: slug, siteUrl: env.publicBaseUrl });
  const result = await persistSite({
    project: loaded,
    document,
    specification,
    files: exported.files,
    changeDescription: `Seeded ${document.siteName} from the ${templateId} template`,
    activityType: "website_generated",
    templateId,
    source: "seed",
  });
  await recordActivity(project.id, "export", `Seeded with ${result.files.length} files`);

  console.log(`[seed] project ${project.id} (${slug})`);
  console.log(`[seed] requirements ${report.overall}% complete, ${result.files.length} files`);
  console.log(`[seed] preview: GET /api/projects/${project.id}/preview`);
}

main()
  .catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
