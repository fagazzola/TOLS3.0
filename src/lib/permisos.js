import perfiles from "../data/perfiles.json";

export const MODULOS = [
  { key: "mod2", label: "Tablero de Control" },
  { key: "mod1", label: "Calendario" },
  { key: "mod4", label: "Cobranza" },
  { key: "mod3", label: "Jugadores" },
  { key: "mod5", label: "Game Night" },
];

export const NIVEL_LABEL = {
  escritura: "Lectura / escritura",
  lectura: "Solo lectura",
  ninguno: "Sin acceso",
};

// nivel de acceso ("escritura" | "lectura" | "ninguno") del rol de una sesión para un módulo dado
export function accesoDe(session, modKey) {
  if (!session) return "ninguno";
  const rol = perfiles.roles.find((r) => r.tipo === session.rol);
  return rol?.permisos?.[modKey] ?? "ninguno";
}

export function puedeVer(session, modKey) {
  return accesoDe(session, modKey) !== "ninguno";
}

export function puedeEditar(session, modKey) {
  return accesoDe(session, modKey) === "escritura";
}
