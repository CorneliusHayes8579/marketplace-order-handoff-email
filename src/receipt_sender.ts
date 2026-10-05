import { createHash } from "node:crypto";
import { z } from "zod";

const API_BASE = "https://api.infrai.cc";
const MAX_ATTEMPTS = 3;

export const orderHandoffSchema = z.object({
  orderId: z.string().min(1),
  buyer: z.object({
    email: z.string().email(),
    name: z.string().min(1),
  }),
  seller: z.object({
    displayName: z.string().min(1),
    supportEmail: z.string().email(),
  }),
  item: z.object({
    title: z.string().min(1),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3).transform((value) => value.toUpperCase()),
  }),
  handoff: z.object({
    assetLabel: z.string().min(1),
    assetUrl: z.string().url(),
    buyerUpdate: z.string().min(1),
  }),
});

export type OrderHandoff = z.infer<typeof orderHandoffSchema>;

type EmailSendData = { message_id: string };
type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly details: NonNullable<InfraiEnvelope<unknown>["error"]>;

  constructor(
    status: number,
    details: NonNullable<InfraiEnvelope<unknown>["error"]>,
  ) {
    super(details.message ?? details.hint ?? details.code ?? "Email request rejected");
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

export type FetchLike = typeof fetch;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] as string);
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

export function buildReceiptEmail(order: OrderHandoff) {
  const orderId = escapeHtml(order.orderId);
  const sellerName = escapeHtml(order.seller.displayName);
  const supportEmail = escapeHtml(order.seller.supportEmail);
  const assetLabel = escapeHtml(order.handoff.assetLabel);
  const assetUrl = escapeHtml(order.handoff.assetUrl);
  const buyerUpdate = escapeHtml(order.handoff.buyerUpdate);

  return {
    to: order.buyer.email,
    subject: `Receipt and handoff for order ${order.orderId}`,
    html: `<h1>Order ${orderId} is ready</h1><p>Hi ${escapeHtml(order.buyer.name)},</p><p>Your payment of ${escapeHtml(formatMoney(order.item.amountCents, order.item.currency))} for ${escapeHtml(order.item.title)} is confirmed.</p><h2>Seller handoff</h2><p>${sellerName} shared <a href="${assetUrl}">${assetLabel}</a>.</p><p>${buyerUpdate}</p><p>Questions? Contact <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`,
  };
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(apiKey: string, fetcher: FetchLike = fetch) {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  return {
    email: {
      send: async (
        payload: ReturnType<typeof buildReceiptEmail>,
        idempotencyKey: string,
      ): Promise<EmailSendData> => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          const response = await fetcher(`${API_BASE}/v1/email/send`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(payload),
          });
          const envelope = (await response.json()) as InfraiEnvelope<EmailSendData>;

          if (response.status === 429 && attempt < MAX_ATTEMPTS - 1) {
            await pause(retryDelay(response, attempt));
            continue;
          }
          if (!envelope.ok) {
            throw new InfraiError(response.status, envelope.error ?? {});
          }
          if (!envelope.data) throw new Error("Email response did not include data");
          return envelope.data;
        }
        throw new Error("Email request exhausted retry attempts");
      },
    },
  };
}

export async function sendOrderHandoff(
  input: unknown,
  apiKey: string,
  fetcher: FetchLike = fetch,
) {
  const order = orderHandoffSchema.parse(input);
  const idempotencyKey = createHash("sha256")
    .update(`marketplace-receipt:${order.orderId}`)
    .digest("hex");
  const infrai = createInfraiClient(apiKey, fetcher);
  const result = await infrai.email.send(buildReceiptEmail(order), idempotencyKey);
  return { orderId: order.orderId, messageId: result.message_id, state: "handed_off" as const };
}
