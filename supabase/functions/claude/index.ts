// supabase/functions/claude/index.ts
// -----------------------------------------------------------------------------
// Edge Function que actúa como proxy seguro a la API de Claude.
// La ANTHROPIC_API_KEY queda solo del lado del servidor (nunca expuesta al
// navegador). Desde el CRM llamas a /functions/v1/claude con el payload de
// Messages API y esta function reenvía la request a Anthropic.
// -----------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// CORS: en prod dejalo en tu dominio, para desarrollo podés usar "*"
const ALLOWED_ORIGINS = [
  "https://www.varelapropiedadescde.com.ar",
  "https://varelapropiedadescde.com.ar",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Defaults razonables si el cliente no los mandó
  const payload = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    ...body,
  };

  // Llamada a Anthropic
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Upstream error", detail: String(err) }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
