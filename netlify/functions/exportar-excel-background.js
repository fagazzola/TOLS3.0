import { getStore } from "@netlify/blobs";
import { exportarTodoDesdeBlobs } from "./lib/exportar-excel.js";
import { respaldarExcelActual } from "./lib/msgraph.js";

// 84ª entrega (bugfix): "Exportar todo a Excel" (83ª entrega) corría dentro de la misma función síncrona
// que atiende /api/tablero, con un `await exportarTodoDesdeBlobs()` directo — 10 módulos, cada uno con
// varias llamadas reales a Microsoft Graph API, en una sola invocación. Eso superaba el tiempo máximo que
// Netlify permite para una función síncrona, y lo que le llegaba de vuelta al navegador no era la
// respuesta JSON esperada sino la página de error HTML que Netlify devuelve cuando esto pasa — de ahí el
// error "Unexpected token '<', "<HTML> <HE"... is not valid JSON" que reportó Federico: el `await
// r.json()` del lado del cliente (Tablero.jsx) intentaba parsear esa página como si fuera JSON.
//
// Fix de fondo: esta función corre en segundo plano (`background: true`, ver config abajo) — Netlify le
// da hasta 15 minutos en vez de los pocos segundos de una función normal, y no tiene que devolver una
// respuesta a tiempo para el navegador. `/api/tablero` (acción "exportarExcel") ya no espera a que esto
// termine: solo la dispara y devuelve de inmediato un estado "en-curso"; el navegador, en vez de esperar
// una sola respuesta larga, consulta el estado cada pocos segundos (acción nueva de solo lectura
// "estadoExportarExcel" del mismo endpoint) hasta ver "listo" o "error". El estado de la corrida (en
// curso / lista / con error, más el reporte módulo por módulo cuando termina) se guarda en Blobs
// (`tols-exportar-estado`) — es el único canal de comunicación entre esta función (que ya no tiene a
// quién responderle) y la pantalla que está esperando el resultado.
export default async () => {
  const estadoStore = getStore({ name: "tols-exportar-estado", consistency: "strong" });
  try {
    // 84ª entrega: pedido explícito de Federico — antes de reemplazar cualquier hoja, dejar una copia de
    // respaldo del archivo completo tal cual está en ese momento. Un fallo acá se reporta (campo
    // `backup`) pero NUNCA bloquea la exportación real — no tiene sentido dejar el Excel desactualizado
    // solo porque el respaldo no se pudo crear.
    let backup;
    try {
      backup = await respaldarExcelActual();
    } catch (e) {
      backup = { ok: false, error: e?.message || String(e) };
    }

    const reporte = await exportarTodoDesdeBlobs();
    await estadoStore.setJSON("data", {
      estado: "listo",
      ...reporte,
      backup,
      terminadoEn: new Date().toISOString(),
    });
  } catch (e) {
    await estadoStore.setJSON("data", {
      estado: "error",
      error: e?.message || String(e),
      terminadoEn: new Date().toISOString(),
    });
  }
};

export const config = { path: "/api/exportar-excel-background", background: true };
