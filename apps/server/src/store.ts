/**
 * Persistence + serialization layer: loads Prisma rows (with relations),
 * parses the JSON blobs the schema stores as strings, and maps everything onto
 * the DTO contracts from `@luvify/shared`.
 */

import type {
  BusinessProfile,
  Conversation as ConversationRow,
  Customer,
  Deployment,
  Domain,
  Message as MessageRow,
  Order,
  Product,
  Project,
  ProjectActivity,
  Requirement,
  User,
  WebsiteFile as WebsiteFileRow,
  WebsiteVersion as WebsiteVersionRow,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  ProjectBriefSchema,
  RequirementsSchema,
  SiteDocumentSchema,
  WebsiteSpecificationSchema,
  computeCompleteness,
  emptyBrief,
  emptyRequirements,
  parseMessagePayload,
  siteContentStats,
  siteThemeSummary,
  slugify,
  type ActivityDto,
  type BriefResponseDto,
  type BusinessProfileDto,
  type CompletenessDto,
  type CustomerDto,
  type DeploymentDto,
  type DomainDto,
  type MessageDto,
  type OrderDto,
  type ProductDto,
  type ProjectBrief,
  type ProjectDetailDto,
  type ProjectSummaryDto,
  type Requirements,
  type SiteDocument,
  type UserDto,
  type VersionDto,
  type WebsiteFileDto,
} from "@luvify/shared";
import { ApiError } from "./errors";
import { prisma } from "./prisma";

export const projectInclude = {
  requirement: true,
  specification: true,
  brief: true,
  website: true,
  files: { orderBy: { path: "asc" } },
  versions: { orderBy: { versionNumber: "desc" as const } },
  deployments: { orderBy: { createdAt: "desc" as const } },
  activities: { orderBy: { createdAt: "desc" as const } },
  conversations: { orderBy: { updatedAt: "desc" as const } },
  businessProfile: true,
  domains: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export function parseJson(value: string | null | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

// --- loaders ----------------------------------------------------------------

export async function loadProject(id: string, userId: string): Promise<ProjectWithRelations> {
  // Ownership is enforced in the query itself, not in a follow-up `if`: a
  // project that belongs to somebody else is indistinguishable from one that
  // does not exist, so probing ids can never confirm a guess.
  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: projectInclude,
  });
  if (!project) throw ApiError.notFound(`Project "${id}" was not found`);
  return project;
}

export async function ensureDemoUser(): Promise<User> {
  const email = "demo@luvify.test";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: { email, name: "Demo Builder", role: "DEMO" } });
}

export async function uniqueSlug(candidate: string): Promise<string> {
  const base = slugify(candidate);
  let slug = base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const clash = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
    slug = `${base}-${suffix}`;
  }
  return `${base}-${Date.now()}`;
}

export async function recordActivity(projectId: string, type: string, message: string): Promise<void> {
  await prisma.projectActivity.create({ data: { projectId, type, message } });
}

export async function ensureConversation(projectId: string, kind: string, title: string): Promise<ConversationRow> {
  const existing = await prisma.conversation.findFirst({
    where: { projectId, kind },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { projectId, kind, title } });
}

export function requirementsOf(project: ProjectWithRelations): Requirements {
  const parsed = project.requirement ? parseJson(project.requirement.data) : undefined;
  const safe = parsed === undefined ? undefined : RequirementsSchema.safeParse(parsed);
  return safe && safe.success ? safe.data : emptyRequirements(project.websiteType);
}

export function documentOf(project: ProjectWithRelations): SiteDocument | null {
  if (!project.website) return null;
  const parsed = parseJson(project.website.document);
  if (parsed === undefined) return null;
  const safe = SiteDocumentSchema.safeParse(parsed);
  return safe.success ? safe.data : null;
}

export function briefOf(project: ProjectWithRelations): ProjectBrief {
  const parsed = project.brief ? parseJson(project.brief.data) : undefined;
  const safe = parsed === undefined ? undefined : ProjectBriefSchema.safeParse(parsed);
  return safe && safe.success ? safe.data : emptyBrief();
}

export function toBriefResponse(project: ProjectWithRelations): BriefResponseDto {
  return {
    brief: briefOf(project),
    updatedAt: project.brief ? project.brief.updatedAt.toISOString() : null,
  };
}

/** Full replace: the client always PUTs the whole brief it loaded. */
export async function saveBrief(projectId: string, brief: ProjectBrief): Promise<Date> {
  const data = JSON.stringify(brief);
  const row = await prisma.projectBrief.upsert({
    where: { projectId },
    create: { projectId, data },
    update: { data },
  });
  return row.updatedAt;
}

export async function saveRequirements(
  projectId: string,
  requirements: Requirements,
): Promise<{ requirement: Requirement; report: ReturnType<typeof computeCompleteness> }> {
  const report = computeCompleteness(requirements);
  const data = JSON.stringify(requirements);
  const payload = { data, completeness: report.overall, breakdown: JSON.stringify(report.categories), lastAnalyzedAt: new Date() };
  const requirement = await prisma.requirement.upsert({
    where: { projectId },
    create: { projectId, ...payload },
    update: payload,
  });
  return { requirement, report };
}

export function toCompletenessDto(report: ReturnType<typeof computeCompleteness>): CompletenessDto {
  return {
    overall: report.overall,
    readyForGeneration: report.readyForGeneration,
    blocking: report.blocking,
    categories: report.categories.map((category) => ({
      key: category.key,
      label: category.label,
      score: category.score,
      applicable: category.applicable,
      missing: category.missing,
    })),
  };
}

// --- DTO mappers ------------------------------------------------------------

export function toProjectSummary(project: ProjectWithRelations): ProjectSummaryDto {
  const document = documentOf(project);
  const report = computeCompleteness(requirementsOf(project));
  const stats = document ? siteContentStats(document) : { pages: 0, sections: 0, words: 0 };
  const currentVersion = project.versions[0] ?? null;
  const deployment = project.deployments.find((entry) => entry.status === "READY") ?? project.deployments[0] ?? null;

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    businessName: project.businessName,
    businessDescription: project.businessDescription,
    websiteType: project.websiteType,
    status: project.status,
    templateId: project.templateId,
    thumbnailUrl: project.thumbnailUrl,
    createdAt: (project.createdAt as Date).toISOString(),
    updatedAt: (project.updatedAt as Date).toISOString(),
    publishedAt: iso(project.publishedAt),
    completeness: report.overall,
    readiness: report.readyForGeneration,
    pageCount: stats.pages,
    sectionCount: stats.sections,
    currentVersionNumber: currentVersion?.versionNumber ?? null,
    theme: document ? siteThemeSummary(document) : null,
    deploymentUrl: deployment?.url ?? null,
  };
}

export function toFileDto(file: WebsiteFileRow): WebsiteFileDto {
  return {
    id: file.id,
    path: file.path,
    language: file.language,
    content: file.content,
    updatedAt: (file.updatedAt as Date).toISOString(),
  };
}

export function toVersionDto(version: WebsiteVersionRow, currentVersionId: string | null): VersionDto {
  const document = parseJson(version.document);
  const safe = document === undefined ? null : SiteDocumentSchema.safeParse(document);
  const stats = safe && safe.success ? siteContentStats(safe.data) : { pages: 0, sections: 0, words: 0 };
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    changeDescription: version.changeDescription,
    source: version.source,
    createdAt: (version.createdAt as Date).toISOString(),
    pageCount: stats.pages,
    sectionCount: stats.sections,
    isCurrent: currentVersionId === version.id,
    theme: safe && safe.success ? siteThemeSummary(safe.data) : null,
  };
}

export function toDeploymentDto(deployment: Deployment): DeploymentDto {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    versionNumber: deployment.versionNumber,
    status: deployment.status as DeploymentDto["status"],
    url: deployment.url,
    provider: deployment.provider,
    message: deployment.message,
    createdAt: (deployment.createdAt as Date).toISOString(),
    publishedAt: iso(deployment.publishedAt),
  };
}

export function toActivityDto(activity: ProjectActivity): ActivityDto {
  return { id: activity.id, type: activity.type, message: activity.message, createdAt: (activity.createdAt as Date).toISOString() };
}

export function toMessageDto(message: MessageRow): MessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role as MessageDto["role"],
    content: message.content,
    payload: message.payload ? parseMessagePayload(parseJson(message.payload) ?? {}) : null,
    createdAt: (message.createdAt as Date).toISOString(),
  };
}

// --- business layer mappers -------------------------------------------------

export function toBusinessProfileDto(profile: BusinessProfile): BusinessProfileDto {
  return {
    id: profile.id,
    projectId: profile.projectId,
    name: profile.name,
    description: profile.description,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    currency: profile.currency,
    timezone: profile.timezone,
    logoText: profile.logoText,
    socials: (parseJson(profile.socials) as Record<string, string> | undefined) ?? {},
    payments: (parseJson(profile.payments) as BusinessProfileDto["payments"] | undefined) ?? {
      provider: "manual",
      status: "not_configured",
    },
    seo: (parseJson(profile.seo) as BusinessProfileDto["seo"] | undefined) ?? {},
  };
}

export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    projectId: product.projectId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
    currency: product.currency,
    category: product.category,
    imageUrl: product.imageUrl,
    status: product.status as ProductDto["status"],
    inventory: product.inventory,
    variants: (parseJson(product.variants) as ProductDto["variants"] | undefined) ?? [],
    createdAt: (product.createdAt as Date).toISOString(),
    updatedAt: (product.updatedAt as Date).toISOString(),
  };
}

export function toCustomerDto(customer: Customer): CustomerDto {
  return {
    id: customer.id,
    projectId: customer.projectId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    createdAt: (customer.createdAt as Date).toISOString(),
  };
}

export type OrderWithRelations = Order & {
  customer: Customer | null;
  items: Array<{ id: string; name: string; quantity: number; unitPriceCents: number; productId: string | null }>;
};

export function toOrderDto(order: OrderWithRelations): OrderDto {
  return {
    id: order.id,
    projectId: order.projectId,
    number: order.number,
    status: order.status as OrderDto["status"],
    currency: order.currency,
    totalCents: order.totalCents,
    source: order.source,
    notes: order.notes,
    createdAt: (order.createdAt as Date).toISOString(),
    customer: order.customer ? { id: order.customer.id, name: order.customer.name, email: order.customer.email } : null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      productId: item.productId,
    })),
  };
}

export function toDomainDto(domain: Domain): DomainDto {
  return {
    id: domain.id,
    projectId: domain.projectId,
    hostname: domain.hostname,
    isPrimary: domain.isPrimary,
    status: domain.status as DomainDto["status"],
    verificationToken: domain.verificationToken,
    createdAt: (domain.createdAt as Date).toISOString(),
  };
}

// --- aggregates -------------------------------------------------------------

export function toProjectDetail(project: ProjectWithRelations): ProjectDetailDto {
  const document = documentOf(project);
  // The stored specification JSON predates the architecture field for projects
  // created before the recent schema change, so it is validated through the
  // schema here: the browser always receives the declared DTO shape, with
  // defaults filled in for fields the stored row does not have.
  const specification = project.specification
    ? (WebsiteSpecificationSchema.safeParse(parseJson(project.specification.data) ?? {})?.data ?? null)
    : null;
  const requirements = requirementsOf(project);
  const conversation = project.conversations[0] ?? null;

  return {
    ...toProjectSummary(project),
    requirements,
    specification,
    document,
    files: project.files.map(toFileDto),
    versions: project.versions.map((version) => toVersionDto(version, project.currentVersionId)),
    deployments: project.deployments.map(toDeploymentDto),
    activities: project.activities.map(toActivityDto),
    conversation: conversation ? { id: conversation.id, kind: conversation.kind, title: conversation.title } : null,
    businessProfile: project.businessProfile ? toBusinessProfileDto(project.businessProfile) : null,
    domains: project.domains.map(toDomainDto),
  };
}

export async function projectDetail(id: string, userId: string): Promise<ProjectDetailDto> {
  return toProjectDetail(await loadProject(id, userId));
}

/**
 * The only shape of a user that ever leaves the server.
 *
 * `passwordHash` and `googleId` are not merely omitted here - they are absent
 * from every DTO in `@luvify/shared`, so there is no typed path from a Prisma
 * row to a response body that could carry them.
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: (user.createdAt as Date).toISOString(),
  };
}

