/**
 * API router: every endpoint lives under `/api`.
 *
 * Ordering is the access-control policy:
 *
 *   1. `systemRouter` (health, templates) and `authRouter` are reachable
 *      anonymously - you cannot require a session in order to create one.
 *   2. Everything mounted below `requireAuth` needs a live session, so a single
 *      line protects every project sub-resource at once (requirements,
 *      conversation, generation, preview, publish, commerce, ...).
 *
 * Authentication alone is not authorization: inside those routers every
 * project lookup additionally filters on the authenticated user's id
 * (`loadProject(id, userId)`), so owning a session for user A never exposes a
 * project belonging to user B.
 */

import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { authRouter } from "./auth";
import { businessRouter } from "./business";
import { conversationRouter } from "./conversation";
import { projectInsightsRouter } from "./insights";
import { projectsRouter } from "./projects";
import { systemRouter } from "./system";
import { websiteRouter } from "./website";

export const apiRouter = Router();

apiRouter.use(systemRouter);
apiRouter.use("/auth", authRouter);

// --- everything from here down requires an authenticated session (401) -----
apiRouter.use(requireAuth);

apiRouter.use("/projects", projectsRouter);
apiRouter.use("/projects", projectInsightsRouter);
apiRouter.use("/projects", conversationRouter);
apiRouter.use("/projects", websiteRouter);
apiRouter.use("/projects", businessRouter);
