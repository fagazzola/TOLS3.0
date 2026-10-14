// 109ª entrega: Federico pidió quitar "Game Night" (mod5) de la matriz de permisos — "ya no lo usamos"
// (está oculto del menú desde la 66ª entrega, sin borrarse) — y agregar "Resultados" (mod7, la pantalla
// que internamente sigue llamándose Estadisticas.jsx desde la 73ª entrega) para poder asignarle permisos
// por rol, algo que antes no existía (era "siempreVisible" para cualquier sesión — ver App.jsx). El
// permiso mod5 que ya estuviera guardado en algún rol NO se borra (mismo criterio de siempre: esta lista
// solo decide qué columnas se pueden EDITAR/VER acá en Perfiles — ver la "Lección aprendida sobre
// cambiar el esquema de datos en Blobs" en el mapa del proyecto), simplemente deja de poder tocarse
// desde esta pantalla.
export const MODULOS = [
  { key: "mod2", label: "Tablero de Control" },
  { key: "mod1", label: "Calendario" },
  { key: "mod4", label: "Cobranza" },
  { key: "mod3", label: "Usuarios" },
  { key: "mod7", label: "Resultados" },
  { key: "mod6", label: "Jugadores" },
];

export const NIVEL_LABEL = {
  escritura: "Lectura/escritura",
  lectura: "Sólo lectura",
  ninguno: "Sin acceso",
};

// nivel de acceso ("escritura" | "lectura" | "ninguno") del rol de una sesión para un módulo dado.
// perfilesData es el objeto {roles, usuarios} — ya no se importa estático porque ahora vive en
// Netlify Blobs y puede cambiar en caliente sin volver a desplegar el sitio.
export function accesoDe(perfilesData, session, modKey) {
  if (!session || !perfilesData) return "ninguno";
  const rol = perfilesData.roles?.find((r) => r.tipo === session.rol);
  return rol?.permisos?.[modKey] ?? "ninguno";
}

export function puedeVer(perfilesData, session, modKey) {
  return accesoDe(perfilesData, session, modKey) !== "ninguno";
}

export function puedeEditar(perfilesData, session, modKey) {
  return accesoDe(perfilesData, session, modKey) === "escritura";
}
