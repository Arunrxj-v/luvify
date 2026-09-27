/**
 * Project CRUD: list, create (with a seeded requirements record and the first
 * interview message), detail, update and delete.
 */

import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CreateProjectRequestSchema,
  RequirementsSchema,
  UpdateProjectRequestSchema,
  computeCompleteness,
  emptyRequirements,
  type DeleteProjectResponseDto,
} from "@luvify/shared";
import { env } from "../env";
import { ApiError, apiHandler, parseWith } from "../errors";
import { refreshDerivedFields, creationTemplateId } from "../generate";
import { completenessSnapshot, nextQuestion } from "../interview";
import { prisma } from "../prisma";
import {
  ensureConversation,
  ensureDemoUser,
  projectDetail,
  projectInclude,
  toProjectSummary,
  uniqueSlug,
} from "../store";

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  apiHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({ include: projectInclude, orderBy: { updatedAt: "desc" } });
    res.json(projects.map(toProjectSummary));
  }),
);

projectsRouter.post(
  "/",
  apiHandler(async (req, res) => {
    const input = parseWith(CreateProjectRequestSchema, req.body);
    const user = await ensureDemoUser();

    const seed = emptyRequirements(input.websiteType);
    const requirements = refreshDerivedFields(
      RequirementsSchema.parse({
        ...seed,
        business: {
          ...seed.business,
          name: input.businessName || input.name,
          description: input.businessDescription,
        },
        website: { ...seed.website, type: input.websiteType },
        branding: { ...seed.branding, brandName: input.businessName || input.name },
        content: {
          ...seed.content,
          contact: { ...seed.content.contact, ...(input.contactEmail ? { email: input.contactEmail } : {}) },
        },
      }),
    );

    const report = computeCompleteness(requirements);
    // Only an explicitly chosen template is stored. Unchosen projects resolve
    // their template from the classified archetype at generation time, when
    // requirements exist to classify - so a hospital created under the generic
    // "business" type never locks in agency/studio content.
    const templateId = creationTemplateId(input.templateId);
    const slug = await uniqueSlug(input.businessName || input.name);

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: input.name,
        slug,
        businessName: input.businessName || input.name,
        businessDescription: input.businessDescription,
        websiteType: input.websiteType,
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
        activities: { create: [{ type: "project_created", message: `Project "${input.name}" created` }] },
      },
    });

    const conversation = await ensureConversation(project.id, "REQUIREMENTS", "Requirements");
    const question = nextQuestion(requirements);
    const content = question
      ? `Hi! I'm the Luvify assistant. I'll ask a few short questions, then build ${input.name} for you. First: ${question.question}`
      : `I already have everything I need for ${input.name} - generate the specification whenever you're ready.`;
    await prisma.message.create({
      data: {
        projectId: project.id,
        conversationId: conversation.id,
        role: "assistant",
        content,
        payload: JSON.stringify({
          kind: question ? "question" : "confirmation",
          questions: question ? [question] : [],
          completeness: completenessSnapshot(report),
          readyForGeneration: report.readyForGeneration,
          provider: env.aiProvider,
        }),
      },
    });

    res.status(201).json(await projectDetail(project.id));
  }),
);

projectsRouter.get(
  "/:id",
  apiHandler(async (req, res) => {
    res.json(await projectDetail(req.params.id ?? ""));
  }),
);

projectsRouter.patch(
  "/:id",
  apiHandler(async (req, res) => {
    const input = parseWith(UpdateProjectRequestSchema, req.body);
    await prisma.project.update({ where: { id: req.params.id ?? "" }, data: input });
    res.json(await projectDetail(req.params.id ?? ""));
  }),
);

projectsRouter.delete(
  "/:id",
  apiHandler(async (req, res) => {
    const id = req.params.id ?? "";
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!project) throw ApiError.notFound(`Project "${id}" was not found`);

    // Child rows (conversations, messages, requirements, specification, pages,
    // versions, deployments, activities...) go with it via onDelete: Cascade.
    await prisma.project.delete({ where: { id: project.id } });

    // Drop the published copy under STORAGE_DIR/<slug> as well.
    const root = path.resolve(env.storageDir);
    const directory = path.resolve(root, project.slug);
    if (directory.startsWith(root + path.sep)) {
      await fs.rm(directory, { recursive: true, force: true });
    }

    const body: DeleteProjectResponseDto = { ok: true, id: project.id };
    res.json(body);
  }),
);
