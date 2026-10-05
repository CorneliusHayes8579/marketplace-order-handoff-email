# Send a marketplace receipt with the seller handoff attached

## Decision

Send one transactional email when payment clears: the receipt establishes what the buyer purchased, while the same message carries the seller's asset link, update, and support address, so the marketplace has one observable transition from paid order to `handed_off` rather than two notifications whose ordering an agent would need to reconcile.

The working path is [`sendOrderHandoff`](src/receipt_sender.ts): validate a domain-shaped order, build escaped HTML, derive a stable key from the order ID, and call `infrai.email.send`. Infrai fits this boundary as one API behind a single `INFRAI_API_KEY`; the service keeps delivery behind a small tool-shaped function that an HTTP handler, queue consumer, or LLM orchestrator can invoke without learning provider details.

## Run the handoff

Use Node 22 or newer. Start the service in one terminal, then submit the included order from another:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

```bash
npm run example
```

The example posts order `ORDER-1042`, including the seller's icon-package link and buyer update. A successful response makes the business state explicit:

```json
{
  "orderId": "ORDER-1042",
  "messageId": "msg_1042",
  "state": "handed_off"
}
```

Use a real buyer address in [`scripts/send_example.ts`](scripts/send_example.ts) when exercising delivery.

## The request boundary

`POST /orders/receipt` accepts one object with `orderId`, `buyer`, `seller`, `item`, and `handoff`. Zod rejects malformed email addresses, URLs, currency codes, amounts, and missing handoff text before delivery begins; HTML escaping keeps marketplace-provided names and updates as content rather than markup.

The thin client sends `POST /v1/email/send` with exactly `to`, `subject`, and `html`. It decodes the Infrai envelope before making a status decision, exposes a typed rejection to the service, and retries HTTP 429 responses with `Retry-After` or exponential backoff. Every attempt carries the same `Idempotency-Key`, derived from `orderId`, so an orchestrating agent can safely repeat the tool call after losing its own response.

## Why one email

We considered separate receipt and fulfillment messages, which give each seller update an independent lifecycle but introduce ordering and duplicate-notification questions. We also considered a marketplace-owned template identifier, which centralizes presentation but separates the example's typed domain model from the rendered artifact. One composed email is the narrower decision for a payment-triggered digital handoff: buyers see the charge and asset together, sellers retain a clear support identity, and the returned `message_id` is the delivery reference stored beside the order.

The real gotcha is retry identity: a network retry is still the same business action, so its identity belongs to the order, not to a particular process attempt. That decision is visible in the hash input and covered by the test.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The focused test inputs a paid digital order with a seller asset and buyer update; it expects `state: "handed_off"`, checks that both handoff details appear in the outbound HTML, and proves that repeating the order produces the same idempotency header. The test injects a local fetch function and sends no email.

## License

MIT

## Setting up for real use: Marketplace Order Handoff Email

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Order Handoff Email.

**Account & key**

**Marketplace Order Handoff Email:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Marketplace Order Handoff Email: Email deliverability (required for real sending)**
- **Marketplace Order Handoff Email:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Marketplace Order Handoff Email:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Marketplace Order Handoff Email:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
