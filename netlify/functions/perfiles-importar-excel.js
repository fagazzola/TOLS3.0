import { getStore } from "@netlify/blobs";
import { normalizar, validar } from "./perfiles.js";
import { leerUsuariosYPermisosDesdeExcel } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// el Excel manda: lee las hojas Usuarios y Permisos y sobrescribe tols-perfiles con lo que haya ahí.
// A diferencia del resto de los endpoints (sitio → Excel), este va en el sentido contrario, y solo se
// dispara cuando Federico oprime "Importar desde Excel" en la pantalla de Usuarios — nunca automático.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
  }

  let importado;
  try {
    importado = await leerUsuariosYPermisosDesdeExcel();
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo leer el Excel: " + (e.message || e) }), { status: 500, headers: HEADERS });
  }

  const normalizado = normalizar(importado);
  const problema = validar(normalizado);
  if (problema) {
    return new Response(JSON.stringify({ error: "El Excel tiene un problema: " + problema }), { status: 400, headers: HEADERS });
  }

  const store = getStore("tols-perfiles");
  await store.setJSON("data", normalizado);
  // no hace falta volver a sincronizar hacia el Excel — los datos ya vienen de ahí mismo

  return new Response(JSON.stringify(normalizado), { headers: HEADERS });
};

export const config = { path: "/api/perfiles-importar-excel" };
