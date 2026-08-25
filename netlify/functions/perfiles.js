import { getStore } from "@netlify/blobs";
import seed from "../../src/data/perfiles.json";

const HEADERS = { "content-type": "application/json; charset=utf-8" };
const NIVELES = ["ninguno", "lectura", "escritura"];
const MOD_KEYS = ["mod1", "mod2", "mod3", "mod4", "mod5"];

// completa/corrige el documento con la semilla como respaldo — mismo patrón defensivo que
// campeonatos.js y tablero.js: si Blobs trae algo viejo o incompleto, se rellena en vez de tronar
function normalizar(data) {
  const base = seed;
  const d = data && typeof data === "object" ? { ...data } : {};

  d.roles = Array.isArray(d.roles) && d.roles.length ? d.roles.map((r) => normalizarRol(r, base)) : structuredCloneSafe(base.roles);
  for (const rolBase of base.roles) {
    if (!d.roles.find((r) => r.tipo === rolBase.tipo)) d.roles.push(structuredCloneSafe(rolBase));
  }

  d.usuarios = Array.isArray(d.usuarios) ? d.usuarios.map(normalizarUsuario) : [];
  if (!d.usuarios.some((u) => u.rol === "Administrador General")) {
    // nunca debe quedar la liga sin nadie que pueda administrar todo
    d.usuarios.push(structuredCloneSafe(base.usuarios[0]));
  }

  return d;
}

function normalizarRol(r, base) {
  const rolBase = base.roles.find((x) => x.tipo === r?.tipo);
  const permisos = { ...(rolBase?.permisos || {}) , ...(r?.permisos || {}) };
  for (const k of MOD_KEYS) if (!NIVELES.includes(permisos[k])) permisos[k] = rolBase?.permisos?.[k] || "ninguno";
  return { tipo: r?.tipo || rolBase?.tipo, permisos };
}

function normalizarUsuario(u) {
  return {
    nombre: String(u?.nombre || "").trim(),
    usuario: String(u?.usuario || "").trim(),
    correo: String(u?.correo || "").trim(),
    password: String(u?.password || ""),
    rol: String(u?.rol || "").trim(),
  };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function validar(data) {
  if (!Array.isArray(data.roles) || data.roles.length === 0) return "Formato inválido: faltan los roles.";
  for (const r of data.roles) {
    if (!r.tipo || !String(r.tipo).trim()) return "Cada rol necesita un nombre.";
    for (const k of MOD_KEYS) {
      if (!NIVELES.includes(r.permisos?.[k])) return `El rol "${r.tipo}" tiene un permiso inválido en ${k}.`;
    }
  }
  if (!Array.isArray(data.usuarios) || data.usuarios.length === 0) return "Debe haber al menos un usuario.";
  const rolesValidos = new Set(data.roles.map((r) => r.tipo));
  const vistos = new Set();
  let tieneAdminGeneral = false;
  for (const u of data.usuarios) {
    if (!u.nombre) return "Cada usuario necesita un nombre.";
    if (!u.usuario) return "Cada usuario necesita un nombre de usuario.";
    if (!u.password) return "Cada usuario necesita una contraseña.";
    if (!rolesValidos.has(u.rol)) return `El usuario "${u.usuario}" tiene un perfil (rol) inválido.`;
    const key = u.usuario.toLowerCase();
    if (vistos.has(key)) return `El usuario "${u.usuario}" está repetido.`;
    vistos.add(key);
    if (u.rol === "Administrador General") tieneAdminGeneral = true;
  }
  if (!tieneAdminGeneral) return "Debe haber al menos un usuario con perfil Administrador General.";
  return null;
}

export default async (req) => {
  const store = getStore("tols-perfiles");

  if (req.method === "GET") {
    const raw = await store.get("data", { type: "json" });
    const normalizado = normalizar(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalizado)) {
      await store.setJSON("data", normalizado);
    }
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }
    const normalizado = normalizar(body);
    const problema = validar(normalizado);
    if (problema) {
      return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
    }
    await store.setJSON("data", normalizado);
    return new Response(JSON.stringify(normalizado), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/perfiles" };
