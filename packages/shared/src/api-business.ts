import { z } from "zod";
import { DOMAIN_STATUSES, ORDER_STATUSES, PRODUCT_STATUSES } from "./enums";

/**
 * Business-layer contracts (the "Shopify-like" foundation): business profile,
 * catalogue, customers, orders and domains. Payments are modelled but not
 * processed - `payments.status` stays "not_configured" until a provider is
 * wired up.
 */

export interface BusinessProfileDto {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string | null;
  logoText: string | null;
  socials: Record<string, string>;
  payments: { provider: string; status: string; customerId?: string };
  seo: { titleTemplate?: string; defaultDescription?: string; keywords?: string[]; robots?: string };
}

export const UpdateBusinessProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(240).optional(),
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().max(60).optional(),
  logoText: z.string().trim().max(60).optional(),
  socials: z.record(z.string().max(30), z.string().max(200)).optional(),
  seo: z
    .object({
      titleTemplate: z.string().max(160).optional(),
      defaultDescription: z.string().max(320).optional(),
      keywords: z.array(z.string().max(60)).max(20).optional(),
      robots: z.string().max(60).optional(),
    })
    .optional(),
});
export type UpdateBusinessProfileRequest = z.infer<typeof UpdateBusinessProfileRequestSchema>;

export interface ProductDto {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  category: string | null;
  imageUrl: string | null;
  status: (typeof PRODUCT_STATUSES)[number];
  inventory: number | null;
  variants: Array<{ name: string; options: string[] }>;
  createdAt: string;
  updatedAt: string;
}

export const UpsertProductRequestSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1200).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).default(0),
  compareAtCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().trim().length(3).default("USD"),
  category: z.string().trim().max(60).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  status: z.enum(PRODUCT_STATUSES).default("DRAFT"),
  inventory: z.number().int().min(0).max(1_000_000).nullable().optional(),
  variants: z
    .array(z.object({ name: z.string().max(60), options: z.array(z.string().max(60)).max(20) }))
    .max(12)
    .optional(),
});
export type UpsertProductRequest = z.infer<typeof UpsertProductRequestSchema>;

export interface CustomerDto {
  id: string;
  projectId: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

export const UpsertCustomerRequestSchema = z.object({
  name: z.string().trim().min(1).max(140),
  email: z.string().trim().email(),
  phone: z.string().trim().max(60).optional(),
});
export type UpsertCustomerRequest = z.infer<typeof UpsertCustomerRequestSchema>;

export interface OrderDto {
  id: string;
  projectId: string;
  number: string;
  status: (typeof ORDER_STATUSES)[number];
  currency: string;
  totalCents: number;
  source: string;
  notes: string | null;
  createdAt: string;
  customer: { id: string; name: string; email: string } | null;
  items: Array<{ id: string; name: string; quantity: number; unitPriceCents: number; productId: string | null }>;
}

export const CreateOrderRequestSchema = z.object({
  customer: UpsertCustomerRequestSchema,
  items: z
    .array(
      z.object({
        productId: z.string().trim().max(60).optional(),
        name: z.string().trim().min(1).max(140),
        quantity: z.number().int().min(1).max(10_000),
        unitPriceCents: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(50),
  notes: z.string().trim().max(600).optional(),
  status: z.enum(ORDER_STATUSES).default("PENDING"),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const UpdateOrderStatusRequestSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusRequestSchema>;

export interface DomainDto {
  id: string;
  projectId: string;
  hostname: string;
  isPrimary: boolean;
  status: (typeof DOMAIN_STATUSES)[number];
  verificationToken: string | null;
  createdAt: string;
}

export const AddDomainRequestSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(4)
    .max(120)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a hostname such as shop.example.com"),
  isPrimary: z.boolean().optional(),
});
export type AddDomainRequest = z.infer<typeof AddDomainRequestSchema>;
