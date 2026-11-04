// Node-only test shim. NEVER imported by production Worker.
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
