/**
 * Per-trip calendar subscription tokens.
 *
 * The public .ics feed is authorized by an unguessable token in the URL (the
 * "secret link" pattern) rather than a login, so calendar apps can poll it.
 * The token is an HMAC of the trip id under a server-only secret, so it needs
 * no storage (no migration) and is stable for the life of the secret.
 *
 * SERVER ONLY — imports node:crypto and reads the service-role key. Never import
 * from a Client Component.
 */

import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to sign calendar subscription tokens."
    );
  }
  return key;
}

export function calendarToken(tripId: string): string {
  return createHmac("sha256", secret())
    .update(`calendar:${tripId}`)
    .digest("base64url");
}

export function verifyCalendarToken(tripId: string, token: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(calendarToken(tripId));
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
