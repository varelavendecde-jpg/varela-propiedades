import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { imageUrl, prompt } = await req.json();
    if (!imageUrl || !prompt) {
      return new Response(JSON.stringify({ error: "Falta imageUrl o prompt" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const KEY = Deno.env.get("OPENAI_API_KEY");
    if (!KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY no configurada" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("No se pudo descargar la foto original");
    const imgBlob = await imgRes.blob();

    const fd = new FormData();
    fd.append("model", "gpt-image-1.5");
    fd.append("prompt", prompt);
    fd.append("input_fidelity", "high");
    fd.append("quality", "high");
    fd.append("size", "1536x1024");
    fd.append("image", imgBlob, "foto.jpg");

    const upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + KEY },
      body: fd,
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Error OpenAI" }), {
        status: upstream.status, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("La respuesta vino sin imagen");

    return new Response(JSON.stringify({ b64 }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
