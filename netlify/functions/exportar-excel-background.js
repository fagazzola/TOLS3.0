import { getStore } from "@netlify/blobs";
import { exportarTodoDesdeBlobs, TOTAL_MODULOS_EXCEL } from "./lib/exportar-excel.js";
import { respaldarExcelActual, obtenerInfoExcel } from "./lib/msgraph.js";

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
// 90ª entrega: hasta ahora el estado en Blobs solo se escribía al PRINCIPIO (implícito, nunca se
// escribía nada hasta el final) y al FINAL — nada en el medio. Federico reportó justo eso: "no muestra
// avance y si bien dice que terminando dirá el resultado, no lo he visto" (ver más abajo por qué
// tampoco se veía el resultado final, era un bug aparte en Tablero.jsx). Ahora se escribe el estado en
// Blobs en CADA paso — antes del respaldo, y una vez por cada módulo (al empezarlo y al terminarlo, vía
// el `onProgreso` nuevo de `exportarTodoDesdeBlobs()`) — así que el sondeo de Tablero.jsx (cada 3
// segundos, sin cambios en el intervalo) tiene siempre algo fresco para mostrar mientras la exportación
// completa corre (puede tardar bastante: 10 módulos, cada uno con varias llamadas reales a Graph API).
export default async () => {
  const estadoStore = getStore({ name: "tols-exportar-estado", consistency: "strong" });
  const iniciadoEn = new Date().toISOString();
  try {
    await estadoStore.setJSON("data", {
      estado: "en-curso",
      etapa: "respaldo",
      indice: 0,
      total: TOTAL_MODULOS_EXCEL,
      resultados: [],
      iniciadoEn,
    });

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

    const reporte = await exportarTodoDesdeBlobs(async (progreso) => {
      await estadoStore.setJSON("data", {
        estado: "en-curso",
        etapa: progreso.etapa, // "corriendo" | "terminado"
        moduloActual: progreso.moduloActual,
        indice: progreso.indice,
        total: progreso.total,
        resultados: progreso.resultados,
        backup,
        iniciadoEn,
      });
    });

    // 91ª entrega: Federico preguntó a qué archivo y en qué ruta queda exportado el Excel — nunca se
    // había mostrado en pantalla, aunque siempre fue el mismo archivo "base" de siempre (EXCEL_PATH en
    // msgraph.js). `obtenerInfoExcel()` es best-effort del lado del link (`webUrl`, requiere un llamado
    // a Graph) pero nombre/ruta son locales — nunca deberían faltar en el reporte final.
    let archivoInfo;
    try {
      archivoInfo = await obtenerInfoExcel();
    } catch (e) {
      archivoInfo = null;
    }

    await estadoStore.setJSON("data", {
      estado: "listo",
      ...reporte,
      backup,
      archivoInfo,
      iniciadoEn,
      terminadoEn: new Date().toISOString(),
    });
  } catch (e) {
    await estadoStore.setJSON("data", {
      estado: "error",
      error: e?.message || String(e),
      iniciadoEn,
      terminadoEn: new Date().toISOString(),
    });
  }
};

export const config = { path: "/api/exportar-excel-background", background: true };
