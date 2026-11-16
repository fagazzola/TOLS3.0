import { getStore } from "@netlify/blobs";
import { nucleoSyncTablero } from "./lib/msgraph.js";

// 132ª entrega (bugfix): al guardar el Tablero de Control, /api/tablero esperaba (`await syncTablero`) a
// que se escribieran 8 hojas en Excel vía Microsoft Graph, una tras otra. Con más conceptos (p. ej. un
// Gasto adicional) eso superó el tiempo máximo de una función síncrona de Netlify y el navegador recibió
// la página de error HTML ("Unexpected token '<', "<HTML> <HE"... is not valid JSON") aunque el guardado
// en el sitio ya se había hecho. Misma solución que en "Exportar todo a Excel" (84ª entrega): la sincronización
// corre aquí, en segundo plano, leyendo lo último guardado en Blobs; /api/tablero solo la dispara.
export default async () => {
  try {
    const store = getStore({ name: "tols-tablero", consistency: "strong" });
    const mapa = await store.get("data", { type: "json", consistency: "strong" });
    if (mapa) await nucleoSyncTablero(mapa);
  } catch (e) {
    console.error("[sync-tablero-background] falló (no afecta el guardado en el sitio):", e?.message || e);
  }
};

export const config = { path: "/api/sync-tablero-background", background: true };
