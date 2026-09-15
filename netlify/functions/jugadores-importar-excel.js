import { getStore } from "@netlify/blobs";
import { normalizar } from "./jugadores.js";
import { leerJugadoresDesdeExcel, syncJugadores } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// el Excel manda: lee la hoja Jugadores y sobrescribe tols-jugadores con lo que haya ahí.
// A diferencia del resto de los endpoints (sitio → Excel), este va en el sentido contrario, y solo se
// dispara cuando Federico oprime "Importar desde Excel" en la pantalla de Jugadores — nunca automático.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
  }

  let filas;
  try {
    filas = await leerJugadoresDesdeExcel();
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo leer el Excel: " + (e.message || e) }), { status: 500, headers: HEADERS });
  }

  const conCorreoYNombre = filas.filter((j) => j.correo && j.nombre);
  if (!conCorreoYNombre.length) {
    return new Response(JSON.stringify({ error: "La hoja Jugadores del Excel no tiene registros con nombre y correo." }), { status: 400, headers: HEADERS });
  }

  const normalizado = normalizar({ jugadores: conCorreoYNombre });

  const store = getStore("tols-jugadores");
  await store.setJSON("data", normalizado);
  await syncJugadores(normalizado.jugadores);

  return new Response(JSON.stringify(normalizado), { headers: HEADERS });
};

export const config = { path: "/api/jugadores-importar-excel" };
