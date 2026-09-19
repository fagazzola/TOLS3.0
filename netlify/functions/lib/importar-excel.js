import { getStore } from "@netlify/blobs";
import { normalizar as normalizarJugadores } from "../jugadores.js";
import { normalizar as normalizarPerfiles, validar as validarPerfiles } from "../perfiles.js";
import { leerJugadoresDesdeExcel, leerUsuariosYPermisosDesdeExcel, syncJugadores } from "./msgraph.js";

// 41ª entrega: Jugadores (tols-jugadores) y Usuarios (tols-perfiles) leen la MISMA hoja "Jugadores" del
// Excel (Usuarios además lee "Permisos") — son dos vistas de una sola base de datos. Federico pidió
// explícitamente que "importar desde Excel" en cualquiera de las dos pantallas actualice ambas, bajo el
// principio de que la base de datos es la misma. Este helper hace ambas lecturas y ambos guardados de un
// jalón, y lo usan tanto jugadores-importar-excel.js como perfiles-importar-excel.js.
export async function importarJugadoresYPerfilesDesdeExcel() {
  const [filasJugadores, importadoPerfiles] = await Promise.all([
    leerJugadoresDesdeExcel(),
    leerUsuariosYPermisosDesdeExcel(),
  ]);

  const conCorreoYNombre = filasJugadores.filter((j) => j.correo && j.nombre);
  if (!conCorreoYNombre.length) {
    throw new Error("La hoja Jugadores del Excel no tiene registros con nombre y correo.");
  }
  const normalizadoJugadores = normalizarJugadores({ jugadores: conCorreoYNombre });

  const normalizadoPerfiles = normalizarPerfiles(importadoPerfiles);
  const problemaPerfiles = validarPerfiles(normalizadoPerfiles);
  if (problemaPerfiles) {
    throw new Error("El Excel tiene un problema en Usuarios/Permisos: " + problemaPerfiles);
  }

  await getStore({ name: "tols-jugadores", consistency: "strong" }).setJSON("data", normalizadoJugadores);
  await syncJugadores(normalizadoJugadores.jugadores);

  await getStore({ name: "tols-perfiles", consistency: "strong" }).setJSON("data", normalizadoPerfiles);
  // no hace falta volver a sincronizar Usuarios/Permisos hacia el Excel — los datos ya vienen de ahí mismo

  return { jugadores: normalizadoJugadores, perfiles: normalizadoPerfiles };
}
