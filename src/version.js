// Versión visible del sitio, formato x.xx.xxx — acordado con Federico (2026-09-03):
// - 1er número (1 dígito): generación del sitio, se queda en 1 hasta una reescritura mayor.
// - 2º número (2 dígitos): sube solo con cambios a los módulos "núcleo" que gobiernan la operación
//   de la liga — Tablero de Control, Calendario o Game Night. El resto de los módulos no lo mueven.
// - 3er número (3 dígitos): contador total de TODAS las entregas (núcleo o no) — nunca baja, nunca
//   se reinicia. Coincide con el número de "entrega" que se lleva en el mapa del proyecto.
//
// Para la próxima entrega: incrementa VERSION aquí a mano.
// - ¿Tocaste Tablero de Control, Calendario o Game Night? sube el 2º número (ej. "02" → "03").
// - Sube siempre el 3er número en +1, toques núcleo o no.
export const VERSION = "1.02.027";
