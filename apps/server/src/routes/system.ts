/**
 * System routes: health, the demo login and the template gallery.
 */

import { createHmac } from "node:crypto";
import { Router } from "express";
import {
  DemoLoginRequestSchema,
  SITE_TEMPLATES,
  createSiteFromTemplate,
  type AuthResponseDto,
  type HealthResponseDto,
  type TemplateDto,
} from "@luvify/shared";
import { env } from "../env";
import { apiHandler, parseWith } from "../errors";
import { checkDatabase, prisma } from "../prisma";
import { ensureDemoUser } from "../store";

export const systemRouter = Router();

function sign(payload: string): string {
  return createHmac("sha256", env.jwtSecret).update(payload).digest("base64url");
}

/** Stateless demo token: `<base64 payload>.<hmac>` - enough for local sessions. */
export function createToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  return payload;
}

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

systemRouter.post(
  "/auth/demo-login",
  apiHandler(async (req, res) => {
    const input = parseWith(DemoLoginRequestSchema, req.body);
    const base = await ensureDemoUser();
    const user =
      input.name || input.email
        ? await prisma.user.update({
            where: { id: base.id },
            data: { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}) },
          })
        : base;
    const body: AuthResponseDto = {
      token: createToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: (user.createdAt as Date).toISOString(),
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
