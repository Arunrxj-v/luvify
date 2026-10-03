/**
 * System routes: health and the template gallery.
 *
 * Authentication lives in `./auth` (see `routes/index.ts`); this module only
 * exposes endpoints that are safe for an anonymous caller.
 */

import { Router } from "express";
import { SITE_TEMPLATES, createSiteFromTemplate, type HealthResponseDto, type TemplateDto } from "@luvify/shared";
import { env } from "../env";
import { apiHandler } from "../errors";
import { checkDatabase } from "../prisma";

export const systemRouter = Router();

systemRouter.get(
  "/health",
  apiHandler(async (_req, res) => {
    const body: HealthResponseDto = {
      status: "ok",
      version: env.version,
      aiProvider: env.aiProvider,
      aiModel: env.aiModel,
      // Presence only - never the key. Lets the UI distinguish "AI connected"
      // from "AI configured without a key" without exposing the secret. The
      // key checked belongs to whichever provider is actually active.
      aiKeyConfigured:
        (env.aiProvider === "gemini" ? env.geminiApiKey : env.openrouterApiKey).length > 0,
      database: (await checkDatabase()) ? "connected" : "error",
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  }),
);

let templateCache: TemplateDto[] | null = null;

systemRouter.get(
  "/templates",
  apiHandler(async (_req, res) => {
    if (!templateCache) {
      templateCache = SITE_TEMPLATES.map((template) => {
        const document = createSiteFromTemplate(
          template.id,
          { siteName: `${template.name} demo`, provider: env.aiProvider },
          { siteType: template.websiteType, versionNumber: 1 },
        );
        return {
          id: template.id,
          name: template.name,
          description: template.description,
          bestFor: template.bestFor,
          websiteType: template.websiteType,
          swatch: template.swatch,
          pageCount: document.pages.length,
          preview: { siteName: document.siteName, siteType: document.siteType, document },
        };
      });
    }
    res.json(templateCache);
  }),
);
