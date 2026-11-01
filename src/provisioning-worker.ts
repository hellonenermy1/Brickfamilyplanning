import { BrickDevice } from "./device-do";
export { BrickDevice };

// Deployment-only bootstrap Worker. It deliberately exposes no Brick API or parent surface while
// D1 migrations and Cloudflare Access are being reconciled. Queue deliveries are retried so a
// provisioning/deployment window can never acknowledge and lose production events.
export default {
  async fetch() {
    return new Response("Brick provisioning in progress", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "30",
        "X-Content-Type-Options": "nosniff"
      }
    });
  },
  async queue(batch: MessageBatch<unknown>) {
    batch.retryAll();
  },
  async scheduled() {
    // Maintenance is intentionally paused while the schema is being reconciled.
  }
} satisfies ExportedHandler;
