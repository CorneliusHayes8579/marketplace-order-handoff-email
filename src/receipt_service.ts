import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, sendOrderHandoff } from "./receipt_sender";

const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/orders/receipt") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await sendOrderHandoff(body, apiKey);
    response.writeHead(202).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid order handoff", issues: error.issues }));
      return;
    }
    if (error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "Request body must be valid JSON" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.message }));
      return;
    }
    console.error(error);
    response.writeHead(500).end(JSON.stringify({ error: "Unable to process receipt" }));
  }
});

server.listen(port, () => {
  console.log(`Receipt service listening on http://localhost:${port}`);
});
