import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { buildCsp } from "./server/security/csp";

// Overrides TanStack Start's default server entry so we can stamp a per-request
// CSP nonce. The default entry is just `createStartHandler(defaultStreamHandler)`
// wrapped in a `{ fetch }` object — we keep that shape and only add the nonce
// wiring in the handler callback, which is the single seam that exposes both the
// per-request router (for `ssr.nonce`) and the document response headers.
//
// The entry stays unconditional: `buildCsp` owns the dev/prod split, and in dev
// the unused nonce attribute is harmless.
const fetch = createStartHandler((ctx) => {
  // Web Crypto is available on both Cloudflare Workers and Node.
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  // 1) TanStack Start stamps this nonce on every inline tag it emits
  //    (Scripts / HeadContent / ScriptOnce / Asset).
  ctx.router.options.ssr = { ...ctx.router.options.ssr, nonce };

  // 2) Emit the matching CSP for this document response.
  ctx.responseHeaders.set("Content-Security-Policy", buildCsp({ nonce }));

  return defaultStreamHandler(ctx);
});

export default {
  async fetch(...args: Parameters<typeof fetch>) {
    return await fetch(...args);
  },
};
