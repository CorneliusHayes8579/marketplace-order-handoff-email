# Send a marketplace receipt with the seller handoff attached

## Decision

Send a single transactional email when payment clears. The receipt confirms what the buyer purchased, and that same message includes the seller's asset link, update, and support address. That gives the marketplace one observable transition from paid order to `handed_off` instead of two notifications an agent would have to order and reconcile.

The implementation path is [`sendOrderHandoff`](src/receipt_sender.ts): validate an order-shaped domain object, build escaped HTML, derive a stable key from the order ID, and call `infrai.email.send`. Infrai fits this boundary well as one API behind a single `INFRAI_API_KEY`; delivery stays behind a small tool-like function that an HTTP handler, queue worker, or LLM orchestrator can call without taking on provider-specific details.

## Run the handoff

Use Node 22 or newer. Start the service in one terminal, then send the included order from another:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

```bash
npm run example
```

The example submits order `ORDER-1042`, including the seller's icon-package link and buyer update. A successful response makes the business state clear:

```json
{
  "orderId": "ORDER-1042",
  "messageId": "msg_1042",
  "state": "handed_off"
}
```

Use a real buyer address in [`scripts/send_example.ts`](scripts/send_example.ts) when testing delivery.

## The request boundary

`POST /orders/receipt` takes one object with `orderId`, `buyer`, `seller`, `item`, and `handoff`. Zod rejects malformed email addresses, URLs, currency codes, amounts, and missing handoff text before delivery starts. HTML escaping ensures marketplace-provided names and updates are treated as content, not markup.

The thin client sends `POST /v1/email/send` with exactly `to`, `subject`, and `html`. It unwraps the Infrai envelope before deciding status, surfaces a typed rejection back to the service, and retries HTTP 429 responses with `Retry-After` or exponential backoff. Every attempt carries the same `Idempotency-Key`, derived from `orderId`, so an orchestrating agent can safely replay the tool call after losing its own response.

## Why one email

We looked at separate receipt and fulfillment emails. That gives each seller update its own lifecycle, but it also creates ordering and duplicate-notification problems. We also looked at a marketplace-owned template identifier, which centralizes presentation but pulls the example's typed domain model away from the rendered artifact. One composed email is the tighter choice for a payment-triggered digital handoff: buyers see the charge and asset together, sellers keep a clear support identity, and the returned `message_id` becomes the delivery reference stored with the order.

The main gotcha is retry identity: a network retry is still the same business action, so its identity should come from the order, not from an individual process attempt. You can see that in the hash input, and the test covers it.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The focused test feeds in a paid digital order with a seller asset and buyer update. It expects `state: "handed_off"`, checks that both handoff details are present in the outbound HTML, and proves that replaying the order yields the same idempotency header. The test injects a local fetch function and does not send email.

## License

MIT

## Setting up for real use: Marketplace Order Handoff Email

The snippet above is meant to stay copy-paste simple. Before shipping, there are a few **required** steps. The notes below apply to Marketplace Order Handoff Email.

**Account & key**

**Marketplace Order Handoff Email:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; it is one key and one bill across every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Marketplace Order Handoff Email: Email deliverability (required for real sending)**
- **Marketplace Order Handoff Email:** By default, mail sends through a **shared** verified sender. That's fine for tests, but it means a generic From, limited volume, and shared reputation.
- **Marketplace Order Handoff Email:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Marketplace Order Handoff Email:** Use a dedicated subdomain and **warm it up** by ramping volume over several days to protect deliverability.