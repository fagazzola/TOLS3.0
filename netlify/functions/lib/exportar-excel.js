import { getStore } from "@netlify/blobs";
import {
  nucleoSyncCampeonatos,
  nucleoSyncTablero,
  nucleoSyncCalendario,
  nucleoSyncJugadores,
  nucleoSyncCobranza,
  nucleoSyncGameNight,
  nucleoSyncCierres,
  nucleoSyncParametros,
  nucleoSyncEstadisticas,
  nucleoSyncPerfiles,
} from "./msgraph.js";
import { normalizar as normalizarCampeonatos } from "../campeonatos.js";
import { normalizar as normalizarCobranza, respuestaCompleta, filasParaExcel } from "../cobranza.js";
import { normalizar as normalizarPerfiles } from "../perfiles.js";

// 83ª entrega: "Exportar todo a Excel" (botón en Tablero de Control) — a diferencia de la sincronización
// automática de siempre (que pasa en segundo plano cada vez que se guarda algo, y que por diseño nunca
// avisa si falló — ver `safe()` en msgraph.js, pensado para que un problema con el Excel jamás le impida
// a nadie guardar su trabajo en el sitio), este botón es una acción explícita que el administrador pide
// a propósito, así que SÍ tiene sentido que le muestre, módulo por módulo, cuál se sincronizó bien y
// cuál no. Por eso llama directo a los "núcleos" sin envolver de cada sync (nucleoSyncX, ver msgraph.js)
// en vez de a los syncX de siempre: estos núcleos sí dejan pasar el error hacia afuera.
//
// Lee cada módulo directo de su store de Blobs (la fuente real, ver la nota de arquitectura en el mapa
// del proyecto) y llama a su núcleo de sincronización con exactamente los mismos datos que ya arma cada
// pantalla al guardar — reutilizando, cuando existe, la misma función `normalizar()`/`respuestaCompleta()`
// que usa esa pantalla, para que una regeneración completa nunca produzca un Excel distinto del que ya
// produce el uso normal del sitio.
async function leerStore(nombre) {
  const store = getStore({ name: nombre, consistency: "strong" });
  return (await store.get("data", { type: "json", consistency: "strong" }).catch(() => null)) || {};
}

const MODULOS = [
  {
    nombre: "Campeonatos",
    async run() {
      const raw = await leerStore("tols-campeonatos");
      await nucleoSyncCampeonatos(normalizarCampeonatos(raw));
    },
  },
  {
    nombre: "Tablero de Control",
    async run() {
      const mapa = await leerStore("tols-tablero");
      await nucleoSyncTablero(mapa);
    },
  },
  {
    nombre: "Calendario",
    async run() {
      const data = await leerStore("tols-calendario");
      await nucleoSyncCalendario(data);
    },
  },
  {
    nombre: "Jugadores",
    async run() {
      const data = await leerStore("tols-jugadores");
      await nucleoSyncJugadores(Array.isArray(data.jugadores) ? data.jugadores : []);
    },
  },
  {
    nombre: "Cobranza",
    async run() {
      const raw = await leerStore("tols-cobranza");
      const normalizado = normalizarCobranza(raw);
      const completa = await respuestaCompleta(normalizado);
      await nucleoSyncCobranza(filasParaExcel(completa));
    },
  },
  {
    nombre: "Game Night",
    async run() {
      const mapa = await leerStore("tols-gamenight");
      await nucleoSyncGameNight(mapa);
    },
  },
  {
    nombre: "Cobranza · Cierres",
    async run() {
      const data = await leerStore("tols-cierres");
      await nucleoSyncCierres(Array.isArray(data.registros) ? data.registros : []);
    },
  },
  {
    nombre: "Parámetros Generales",
    async run() {
      const data = await leerStore("tols-parametros");
      await nucleoSyncParametros(data);
    },
  },
  {
    nombre: "Estadísticas",
    async run() {
      const data = await leerStore("tols-estadisticas");
      await nucleoSyncEstadisticas(data.torneos || {}, data.apodos || {});
    },
  },
  {
    nombre: "Perfiles",
    async run() {
      const raw = await leerStore("tols-perfiles");
      await nucleoSyncPerfiles(normalizarPerfiles(raw));
    },
  },
];

// 90ª entrega: cuántos módulos tiene la exportación completa — exportado para que quien dispare la
// corrida (exportar-excel-background.js) pueda escribir el "total" del progreso sin tener que duplicar
// ni importar la lista `MODULOS` completa.
export const TOTAL_MODULOS_EXCEL = MODULOS.length;

// Se corre módulo por módulo (no en paralelo): cada uno hace varias llamadas a Graph API contra el
// mismo archivo de Excel, y escribirlas todas a la vez multiplicaría el riesgo de choques/HTTP 429
// contra Graph — mejor un poco más lento pero confiable, para una acción que de todas formas el
// administrador pidió a propósito y una sola vez, no algo que corre a cada rato.
//
// 90ª entrega: acepta un `onProgreso` opcional, llamado DOS veces por módulo (antes de correrlo, y de
// nuevo apenas termina, ok o con error) — es lo que le permite a quien dispara la corrida (ver
// exportar-excel-background.js) ir guardando el avance real en Blobs, en vez de solo poder reportar el
// resultado una vez que los 10 módulos ya terminaron. `onProgreso` nunca puede hacer fallar la
// exportación: cualquier error suyo (ej. un problema de red al guardar el progreso) se descarta en
// silencio, porque el progreso es solo informativo — nunca debe poder tirar abajo la exportación real.
export async function exportarTodoDesdeBlobs(onProgreso) {
  const resultados = [];
  async function avisar(etapa, moduloActual) {
    if (!onProgreso) return;
    try {
      await onProgreso({ etapa, moduloActual, indice: resultados.length, total: MODULOS.length, resultados: [...resultados] });
    } catch (e) {
      // informativo únicamente — ver comentario arriba
    }
  }
  for (const modulo of MODULOS) {
    await avisar("corriendo", modulo.nombre);
    try {
      await modulo.run();
      resultados.push({ modulo: modulo.nombre, ok: true });
    } catch (e) {
      resultados.push({ modulo: modulo.nombre, ok: false, error: e?.message || String(e) });
    }
    await avisar("terminado", modulo.nombre);
  }
  return {
    resultados,
    ok: resultados.every((r) => r.ok),
    exportadoEn: new Date().toISOString(),
  };
}
