import { z } from "zod";
import {
  DEPLOYMENT_STATUSES,
  DOMAIN_STATUSES,
  MESSAGE_ROLES,
  ORDER_STATUSES,
  PRODUCT_STATUSES,
  PROJECT_STATUSES,
  WEBSITE_TYPES,
} from "./enums";
import type { MessagePayload } from "./conversation";
import { RequirementsSchema } from "./requirements";
import { WebsiteSpecificationSchema } from "./specification";
import type { BusinessProfileDto, DomainDto } from "./api-business";
import type { SiteDocument } from "./site";

/**
 * HTTP contracts. Request bodies are Zod schemas (the server validates every
 * boundary); response shapes are typed interfaces the client can rely on.
 */

// --- auth -------------------------------------------------------------------

export const DemoLoginRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional(),
});
export type DemoLoginRequest = z.infer<typeof DemoLoginRequestSchema>;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
}

export interface AuthResponseDto {
  token: string;
  user: UserDto;
  expiresAt: string;
}

// --- projects ---------------------------------------------------------------

export const CreateProjectRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  businessName: z.string().trim().max(120).optional(),
  businessDescription: z.string().trim().min(10).max(1200),
  websiteType: z.enum(WEBSITE_TYPES),
  templateId: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().email().optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  businessName: z.string().trim().max(120).optional(),
  businessDescription: z.string().trim().max(1200).optional(),
  websiteType: z.enum(WEBSITE_TYPES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  templateId: z.string().trim().max(40).optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export interface ProjectThemeSummaryDto {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  style: string;
}

export interface ProjectSummaryDto {
  id: string;
  name: string;
  slug: string;
  businessName: string;
  businessDescription: string;
  websiteType: string;
  status: string;
  templateId: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  completeness: number;
  readiness: boolean;
  pageCount: number;
  sectionCount: number;
  currentVersionNumber: number | null;
  theme: ProjectThemeSummaryDto | null;
  deploymentUrl: string | null;
}

export interface ProjectDetailDto extends ProjectSummaryDto {
  requirements: z.infer<typeof RequirementsSchema> | null;
  specification: z.infer<typeof WebsiteSpecificationSchema> | null;
  document: SiteDocument | null;
  files: WebsiteFileDto[];
  versions: VersionDto[];
  deployments: DeploymentDto[];
  activities: ActivityDto[];
  conversation: { id: string; kind: string; title: string } | null;
  businessProfile: BusinessProfileDto | null;
  domains: DomainDto[];
}

export interface ActivityDto {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

// --- conversation -----------------------------------------------------------

export const PostMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  questionId: z.string().trim().max(80).optional(),
  mapsTo: z.string().trim().max(80).optional(),
  optionLabels: z.array(z.string().max(120)).max(12).optional(),
  quickReply: z.boolean().optional(),
});
export type PostMessageRequest = z.infer<typeof PostMessageRequestSchema>;

export interface MessageDto {
  id: string;
  conversationId: string;
  role: (typeof MESSAGE_ROLES)[number];
  content: string;
  payload: MessagePayload | null;
  createdAt: string;
}

// --- AI --------------------------------------------------------------------

export const ChatRequestSchema = z.object({
  message: z.string().trim().max(4000).optional(),
  questionId: z.string().trim().max(80).optional(),
  mapsTo: z.string().trim().max(80).optional(),
  optionLabels: z.array(z.string().max(120)).max(12).optional(),
  /** bootstrap the conversation (used on first load when no messages exist) */
  bootstrap: z.boolean().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface CompletenessDto {
  overall: number;
  readyForGeneration: boolean;
  blocking: string[];
  categories: Array<{ key: string; label: string; score: number; applicable: boolean; missing: string[] }>;
}

export interface ChatResponseDto {
  messages: MessageDto[];
  requirements: z.infer<typeof RequirementsSchema>;
  completeness: CompletenessDto;
  status: string;
  provider: string;
}

/** DELETE /api/projects/:id */
export interface DeleteProjectResponseDto {
  ok: boolean;
  id: string;
}

export interface AnalyzeRequirementsResponseDto {
  requirements: z.infer<typeof RequirementsSchema>;
  completeness: CompletenessDto;
  updatedFields: string[];
}

export const GenerateWebsiteRequestSchema = z.object({
  templateId: z.string().trim().max(40).optional(),
  regenerateSpecification: z.boolean().optional(),
  notes: z.string().trim().max(600).optional(),
});
export type GenerateWebsiteRequest = z.infer<typeof GenerateWebsiteRequestSchema>;

export interface GenerateSpecificationResponseDto {
  specification: z.infer<typeof WebsiteSpecificationSchema>;
  version: number;
  summary: string;
}

export interface GenerateWebsiteResponseDto {
  version: VersionDto;
  document: SiteDocument;
  files: WebsiteFileDto[];
  message: MessageDto;
  status: string;
}

export const ModifyWebsiteRequestSchema = z.object({
  instruction: z.string().trim().min(3).max(1000),
});
export type ModifyWebsiteRequest = z.infer<typeof ModifyWebsiteRequestSchema>;

export interface ModifyWebsiteResponseDto {
  version: VersionDto;
  document: SiteDocument;
  changeSummary: string[];
  affectedSections: string[];
  message: MessageDto;
}

// --- files, versions, deployments, preview ---------------------------------

export interface WebsiteFileDto {
  id: string;
  path: string;
  language: string;
  content: string;
  updatedAt: string;
}

export interface VersionDto {
  id: string;
  versionNumber: number;
  changeDescription: string;
  source: string;
  createdAt: string;
  pageCount: number;
  sectionCount: number;
  isCurrent: boolean;
  theme: ProjectThemeSummaryDto | null;
}

export interface DeploymentDto {
  id: string;
  projectId: string;
  versionNumber: number;
  status: (typeof DEPLOYMENT_STATUSES)[number];
  url: string | null;
  provider: string;
  message: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface PreviewResponseDto {
  page: string;
  pageName: string;
  title: string;
  html: string;
  css: string;
  pages: Array<{ name: string; path: string; title: string }>;
  versionNumber: number | null;
}

export interface ExportResponseDto {
  projectName: string;
  siteName: string;
  versionNumber: number | null;
  files: Array<{ path: string; language: string; content: string }>;
}

export const PublishRequestSchema = z.object({
  provider: z.enum(["local", "vercel", "netlify", "cloudflare"]).optional(),
  domain: z.string().trim().max(120).optional(),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export interface PublishResponseDto {
  deployment: DeploymentDto;
  projectStatus: string;
  publishedPages: Array<{ path: string; title: string }>;
}

export interface RestoreVersionResponseDto {
  version: VersionDto;
  document: SiteDocument;
  restoredFrom: number;
  fileCount: number;
}

export interface HealthResponseDto {
  status: "ok";
  version: string;
  aiProvider: string;
  aiModel: string;
  /**
   * Whether a provider API key is configured SERVER-SIDE.
   *
   * A boolean only: the key itself is never part of any API response, so the
   * browser can show "connected" without ever receiving the secret.
   */
  aiKeyConfigured: boolean;
  database: "connected" | "error";
  timestamp: string;
}

export interface ApiErrorDto {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface TemplateDto {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  websiteType: string;
  swatch: { primary: string; accent: string; background: string };
  pageCount: number;
  preview: { siteName: string; siteType: string; document: SiteDocument };
}

