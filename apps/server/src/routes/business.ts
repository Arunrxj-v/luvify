/**
 * Business layer routes: business profile, product catalogue, customers,
 * orders and domains. Payments are modelled but never processed in the MVP.
 */

import { Router } from "express";
import {
  AddDomainRequestSchema,
  CreateOrderRequestSchema,
  UpdateBusinessProfileRequestSchema,
  UpdateOrderStatusRequestSchema,
  UpsertCustomerRequestSchema,
  UpsertProductRequestSchema,
  slugify,
} from "@luvify/shared";
import { ApiError, apiHandler, parseWith } from "../errors";
import { prisma } from "../prisma";
import {
  loadProject,
  parseJson,
  toBusinessProfileDto,
  toCustomerDto,
  toDomainDto,
  toOrderDto,
  toProductDto,
} from "../store";

export const businessRouter = Router({ mergeParams: true });

businessRouter.get(
  "/:id/business",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    res.json(project.businessProfile ? toBusinessProfileDto(project.businessProfile) : null);
  }),
);

businessRouter.put(
  "/:id/business",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(UpdateBusinessProfileRequestSchema, req.body, "Business profile");
    const existing = project.businessProfile;
    const pick = <T>(value: T | undefined, fallback: T | null): T | null => (value !== undefined ? value : fallback);

    const data = {
      name: input.name ?? existing?.name ?? project.businessName,
      description: pick(input.description, existing?.description ?? null),
      email: pick(input.email, existing?.email ?? null),
      phone: pick(input.phone, existing?.phone ?? null),
      address: pick(input.address, existing?.address ?? null),
      currency: input.currency ?? existing?.currency ?? "USD",
      timezone: pick(input.timezone, existing?.timezone ?? null),
      logoText: pick(input.logoText, existing?.logoText ?? null),
      socials: JSON.stringify(input.socials ?? (parseJson(existing?.socials ?? null) as Record<string, string>) ?? {}),
      payments:
        existing?.payments ??
        JSON.stringify({ provider: "manual", status: "not_configured" }),
      seo: JSON.stringify(input.seo ?? (parseJson(existing?.seo ?? null) as object) ?? {}),
    };

    const profile = await prisma.businessProfile.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, ...data },
      update: data,
    });
    res.json(toBusinessProfileDto(profile));
  }),
);

async function uniqueProductSlug(projectId: string, name: string): Promise<string> {
  const base = slugify(name, "product");
  let slug = base;
  for (let suffix = 2; suffix < 200; suffix += 1) {
    const clash = await prisma.product.findUnique({
      where: { projectId_slug: { projectId, slug } },
      select: { id: true },
    });
    if (!clash) return slug;
    slug = `${base}-${suffix}`;
  }
  return `${base}-${Date.now()}`;
}

businessRouter.get(
  "/:id/products",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const products = await prisma.product.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
    res.json(products.map(toProductDto));
  }),
);

businessRouter.post(
  "/:id/products",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(UpsertProductRequestSchema, req.body, "Product");
    const product = await prisma.product.create({
      data: {
        projectId: project.id,
        name: input.name,
        slug: await uniqueProductSlug(project.id, input.name),
        description: input.description ?? null,
        priceCents: input.priceCents,
        compareAtCents: input.compareAtCents ?? null,
        currency: input.currency,
        category: input.category ?? null,
        imageUrl: input.imageUrl ?? null,
        status: input.status,
        inventory: input.inventory ?? null,
        variants: input.variants ? JSON.stringify(input.variants) : null,
      },
    });
    res.status(201).json(toProductDto(product));
  }),
);

businessRouter.patch(
  "/:id/products/:productId",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(UpsertProductRequestSchema.partial(), req.body, "Product");
    const existing = await prisma.product.findFirst({
      where: { id: req.params.productId ?? "", projectId: project.id },
    });
    if (!existing) throw ApiError.notFound("Product not found");

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.compareAtCents !== undefined ? { compareAtCents: input.compareAtCents } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.inventory !== undefined ? { inventory: input.inventory } : {}),
        ...(input.variants !== undefined ? { variants: JSON.stringify(input.variants) } : {}),
      },
    });
    res.json(toProductDto(product));
  }),
);

businessRouter.delete(
  "/:id/products/:productId",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const existing = await prisma.product.findFirst({
      where: { id: req.params.productId ?? "", projectId: project.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Product not found");
    await prisma.product.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

businessRouter.get(
  "/:id/customers",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const customers = await prisma.customer.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(customers.map(toCustomerDto));
  }),
);

businessRouter.post(
  "/:id/customers",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(UpsertCustomerRequestSchema, req.body, "Customer");
    const customer = await prisma.customer.upsert({
      where: { projectId_email: { projectId: project.id, email: input.email } },
      create: { projectId: project.id, name: input.name, email: input.email, phone: input.phone ?? null },
      update: { name: input.name, phone: input.phone ?? null },
    });
    res.status(201).json(toCustomerDto(customer));
  }),
);

businessRouter.get(
  "/:id/orders",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const orders = await prisma.order.findMany({
      where: { projectId: project.id },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(orders.map(toOrderDto));
  }),
);

businessRouter.post(
  "/:id/orders",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(CreateOrderRequestSchema, req.body, "Order");
    const customer = await prisma.customer.upsert({
      where: { projectId_email: { projectId: project.id, email: input.customer.email } },
      create: { projectId: project.id, name: input.customer.name, email: input.customer.email, phone: input.customer.phone ?? null },
      update: { name: input.customer.name, phone: input.customer.phone ?? null },
    });
    const totalCents = input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const number = `ORD-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;

    const order = await prisma.order.create({
      data: {
        projectId: project.id,
        customerId: customer.id,
        number,
        status: input.status,
        currency: project.businessProfile?.currency ?? "USD",
        totalCents,
        source: "manual",
        notes: input.notes ?? null,
        items: {
          create: input.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            productId: item.productId ?? null,
          })),
        },
      },
      include: { customer: true, items: true },
    });
    res.status(201).json(toOrderDto(order));
  }),
);

businessRouter.patch(
  "/:id/orders/:orderId/status",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(UpdateOrderStatusRequestSchema, req.body, "Order status");
    const existing = await prisma.order.findFirst({
      where: { id: req.params.orderId ?? "", projectId: project.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Order not found");
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: { status: input.status },
      include: { customer: true, items: true },
    });
    res.json(toOrderDto(order));
  }),
);

businessRouter.get(
  "/:id/domains",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    res.json(project.domains.map(toDomainDto));
  }),
);

businessRouter.post(
  "/:id/domains",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const input = parseWith(AddDomainRequestSchema, req.body, "Domain");
    const hostname = input.hostname.toLowerCase();
    const clash = await prisma.domain.findUnique({ where: { hostname }, select: { id: true } });
    if (clash) throw ApiError.conflict(`The hostname "${hostname}" is already connected`);

    const makePrimary = input.isPrimary === true || project.domains.length === 0;
    if (makePrimary) {
      await prisma.domain.updateMany({ where: { projectId: project.id }, data: { isPrimary: false } });
    }
    const domain = await prisma.domain.create({
      data: {
        projectId: project.id,
        hostname,
        isPrimary: makePrimary,
        status: "PENDING",
        verificationToken: `luvify-verify-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    res.status(201).json(toDomainDto(domain));
  }),
);

businessRouter.delete(
  "/:id/domains/:domainId",
  apiHandler(async (req, res) => {
    const project = await loadProject(req.params.id ?? "");
    const existing = await prisma.domain.findFirst({
      where: { id: req.params.domainId ?? "", projectId: project.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Domain not found");
    await prisma.domain.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);
