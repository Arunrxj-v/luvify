/**
 * API router: every endpoint lives under `/api`.
 */

import { Router } from "express";
import { businessRouter } from "./business";
import { conversationRouter } from "./conversation";
import { projectInsightsRouter } from "./insights";
import { projectsRouter } from "./projects";
import { systemRouter } from "./system";
import { websiteRouter } from "./website";

export const apiRouter = Router();

apiRouter.use(systemRouter);
apiRouter.use("/projects", projectsRouter);
apiRouter.use("/projects", projectInsightsRouter);
apiRouter.use("/projects", conversationRouter);
apiRouter.use("/projects", websiteRouter);
apiRouter.use("/projects", businessRouter);
