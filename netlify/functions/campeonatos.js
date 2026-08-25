import { getStore } from "@netlify/blobs";
import seed from "../../src/data/campeonatos.json";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// limpia la lista: quita espacios y duplicados, sin tronar si viene algo raro
function normalizar(data) {
  if (!data || !Array.isArray(data.nombres)) return { ...seed };
  const limpios = [];
  for (const n of data.nombres) {
    const t = String(n || "").trim();
    if (t && !limpios.includes(t)) limpios.push(t);
  }
  return { nombres: limpios.length ? limpios : seed.nombres };
}

function validar(data) {
  if (!data || !Array.isArray(data.nombres)) return "Formato inválido.";
  if (data.nombres.length < 1) return "Debe haber al menos un campeonato.";
  if (data.nombres.length > 20) return "Máximo 20 campeonatos.";
  const vistos = new Set();
  for (const n of data.nombres) {
    const t = String(n || "").trim();
    if (!t) return "El nombre del campeonato no puede estar vacío.";
    if (t.length > 40) return "El nombre del campeonato es demasiado largo.";
    const key = t.toLowerCase();
    if (vistos.has(key)) return `El campeonato "${t}" está repetido.`;
    vistos.add(key);
  }
  return null;
}

export default async (req) => {
  const store = getStore("tols-campeonatos");

  if (req.method === "GET") {
    const data = await store.get("data", { type: "json" });
    const normalizado = normalizar(data);
    if (!data || JSON.stringify(data) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
    }
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }
    const limpio = { nombres: (Array.isArray(body?.nombres) ? body.nombres : []).map((n) => String(n || "").trim()) };
    const problema = validar(limpio);
    if (problema) {
      return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
    }
    await store.setJSON("data", limpio);
    return new Response(JSON.stringify(limpio), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/campeonatos" };
