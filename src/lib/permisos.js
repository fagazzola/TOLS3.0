export const MODULOS = [
  { key: "mod2", label: "Tablero de Control" },
  { key: "mod1", label: "Calendario" },
  { key: "mod4", label: "Cobranza" },
  { key: "mod3", label: "Usuarios" },
  { key: "mod5", label: "Game Night" },
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
