// Supabase Edge Function entry: the logic lives in ../_shared (plain JS, tested with Node).
import { handle, environment } from '../_shared/router.js';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const env = environment((name: string) => Deno.env.get(name), {
  // Webhooks answer at once; the import keeps running in the background.
  waitUntil: (p: Promise<unknown>) => EdgeRuntime.waitUntil(p),
});
Deno.serve((req: Request) => handle(req, env));
