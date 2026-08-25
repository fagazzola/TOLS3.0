import { getStore } from "@netlify/blobs";
import seed from "../../src/data/calendario.json";
import { syncCalendario } from "./lib/msgraph.js";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

// los torneos guardados antes de que existiera el campo "temporada" (campeonato) por torneo no lo
// tienen — se completan con el primer campeonato del registro para que no se queden huérfanos.
// Mismo patrón defensivo que ya se usa en tablero.js y campeonatos.js: leer, completar lo que falte,
// y volver a guardar la versión corregida.
async function conTemporadaCompletada(data) {
  const faltantes = (data.torneos || []).some((t) => !t.temporada);
  if (!faltantes) return data;
  try {
    const campStore = getStore("tols-campeonatos");
    const camp = await campStore.get("data", { type: "json" });
    const primero = Array.isArray(camp?.nombres) && camp.nombres.length ? camp.nombres[0] : "";
    if (!primero) return data;
    return { ...data, torneos: data.torneos.map((t) => (t.temporada ? t : { ...t, temporada: primero })) };
  } catch (e) {
    // si el registro de campeonatos no está disponible, se deja tal cual en vez de bloquear el calendario
    return data;
  }
}

function validar(data) {
  if (!data || !Array.isArray(data.torneos)) return "Formato inválido: falta el arreglo de torneos.";
  for (const t of data.torneos) {
    if (!t.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)) return `Fecha inválida: ${t.fecha}`;
    if (!t.hora || !/^\d{2}:\d{2}$/.test(t.hora)) return `Hora inválida: ${t.hora}`;
  }
  if (!data.pagoFinal || !data.pagoFinal.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(data.pagoFinal.fecha)) {
    return "Falta o es inválida la fecha de pago final.";
  }
  return null;
}

export default async (req) => {
  const store = getStore("tols-calendario");

  if (req.method === "GET") {
    let data = await store.get("data", { type: "json" });
    if (!data) {
      data = seed;
      await store.setJSON("data", data);
    }
    const completado = await conTemporadaCompletada(data);
    if (JSON.stringify(completado) !== JSON.stringify(data)) {
      await store.setJSON("data", completado);
      await syncCalendario(completado);
    }
    return new Response(JSON.stringify(completado), { headers: HEADERS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400, headers: HEADERS });
    }
    const problema = validar(body);
    if (problema) {
      return new Response(JSON.stringify({ error: problema }), { status: 400, headers: HEADERS });
    }
    const ordenado = {
      ...body,
      torneos: [...body.torneos]
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
        .map((t, i) => ({ ...t, n: i + 1 })),
    };
    await store.setJSON("data", ordenado);
    await syncCalendario(ordenado);
    return new Response(JSON.stringify(ordenado), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/calendario" };
