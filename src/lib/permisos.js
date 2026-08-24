import perfiles from "../data/perfiles.json";

export const MODULOS = [
  { key: "mod1", label: "MOD 1 · Calendario" },
  { key: "mod2", label: "MOD 2 · Tablero" },
  { key: "mod3", label: "MOD 3 · Perfiles" },
  { key: "mod4", label: "MOD 4 · Cobranza" },
  { key: "mod5", label: "MOD 5 · Game Day" },
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
