import { P8B_LOCATION_CONTROL_COLUMNS, stripHandledLocationControlAlters } from "./phase8d-schema-compat.mjs";

// Reentrant upgrade, including an interrupted prior ADD COLUMN sequence. This
// helper owns no credentials/network; caller supplies the isolated dev target.
export async function applyDevelopmentSchema16({ source, columns, execute, applyRemainder }) {
  const remainder = stripHandledLocationControlAlters(source); // reject drift before mutation
  const present = new Set(await columns());
  for (const [name, definition] of P8B_LOCATION_CONTROL_COLUMNS) {
    if (!present.has(name)) await execute(`ALTER TABLE device_location_control ADD COLUMN ${name} ${definition}`);
  }
  await applyRemainder(remainder);
}

export async function revokePriorDevelopmentSessions(execute, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("invalid session revocation timestamp");
  await execute("UPDATE dev_parent_sessions SET revoked_at=COALESCE(revoked_at,?1)", [now]);
}
