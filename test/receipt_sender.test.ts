import assert from "node:assert/strict";
import test from "node:test";
import { sendOrderHandoff, type FetchLike } from "../src/receipt_sender";

test("one order becomes a buyer receipt with seller assets and a stable handoff", async () => {
  const requests: Array<{ body: Record<string, unknown>; idempotencyKey: string }> = [];
  const fetcher: FetchLike = async (_input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
      idempotencyKey: new Headers(init?.headers).get("Idempotency-Key") ?? "",
    });
    return Response.json({ ok: true, data: { message_id: "msg_1042" }, metadata: {} });
  };
  const order = {
    orderId: "ORDER-1042",
    buyer: { email: "buyer@example.com", name: "Mina" },
    seller: { displayName: "Northstar Design", supportEmail: "studio@example.com" },
    item: { title: "Launch icon set", amountCents: 4900, currency: "usd" },
    handoff: {
      assetLabel: "Download the icon package",
      assetUrl: "https://example.com/orders/ORDER-1042/assets",
      buyerUpdate: "SVG and PNG exports are included.",
    },
  };

  const first = await sendOrderHandoff(order, "test-key", fetcher);
  const second = await sendOrderHandoff(order, "test-key", fetcher);

  assert.deepEqual(first, { orderId: "ORDER-1042", messageId: "msg_1042", state: "handed_off" });
  assert.match(String(requests[0].body.html), /Northstar Design/);
  assert.match(String(requests[0].body.html), /Download the icon package/);
  assert.match(String(requests[0].body.html), /SVG and PNG exports are included/);
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
});
