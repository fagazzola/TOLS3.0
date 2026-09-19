import { importarJugadoresYPerfilesDesdeExcel } from "./lib/importar-excel.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// el Excel manda: lee la hoja Jugadores (y Usuarios/Permisos) y sobrescribe tols-jugadores Y
// tols-perfiles con lo que haya ahí — ambas pantallas leen la misma base de datos, así que "Importar
// desde Excel" desde Jugadores actualiza también Usuarios (41ª entrega).
// A diferencia del resto de los endpoints (sitio → Excel), este va en el sentido contrario, y solo se
// dispara cuando Federico oprime "Importar desde Excel" en la pantalla de Jugadores — nunca automático.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
  }

  let resultado;
  try {
    resultado = await importarJugadoresYPerfilesDesdeExcel();
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "No se pudo importar desde el Excel." }), { status: 500, headers: HEADERS });
  }

  return new Response(JSON.stringify({ ...resultado.jugadores, perfiles: resultado.perfiles }), { headers: HEADERS });
};

export const config = { path: "/api/jugadores-importar-excel" };
