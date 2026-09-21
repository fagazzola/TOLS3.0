import { getStore } from "@netlify/blobs";
import { syncParametros } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// 59ª entrega: parámetros GLOBALES del sitio (no por campeonato, a diferencia del Tablero de Control) —
// por ahora solo el interruptor de acceso al portal ("modo mantenimiento"), pero esta hoja/pantalla es
// donde deberían vivir a futuro otros parámetros que no dependan de qué campeonato esté activo.
function normalizar(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    // por default el portal está ENCENDIDO — un Blob vacío (sitio recién desplegado) nunca debe dejar
    // fuera a nadie por accidente.
    portalActivo: typeof d.portalActivo === "boolean" ? d.portalActivo : true,
    mensajeMantenimiento:
      typeof d.mensajeMantenimiento === "string" && d.mensajeMantenimiento.trim()
        ? d.mensajeMantenimiento
        : "El portal está en mantenimiento. Volveremos pronto — gracias por tu paciencia.",
  };
}

export default async (req) => {
  const store = getStore({ name: "tols-parametros", consistency: "strong" });

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json", consistency: "strong" });
    return new Response(JSON.stringify(normalizar(raw)), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }

    if (body?.accion !== "guardar") {
      return new Response(JSON.stringify({ error: "Acción no reconocida." }), { status: 400, headers: HEADERS });
    }

    const raw = await store.get("data", { type: "json", consistency: "strong" });
    const actual = normalizar(raw);
    const nuevo = normalizar({
      portalActivo: typeof body.portalActivo === "boolean" ? body.portalActivo : actual.portalActivo,
      mensajeMantenimiento:
        typeof body.mensajeMantenimiento === "string" ? body.mensajeMantenimiento : actual.mensajeMantenimiento,
    });

    await store.setJSON("data", nuevo);
    await syncParametros(nuevo);
    return new Response(JSON.stringify(nuevo), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/parametros" };
