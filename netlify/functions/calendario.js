import { getStore } from "@netlify/blobs";
import seed from "../../src/data/calendario.json";

const HEADERS = { "content-type": "application/json; charset=utf-8" };

function validar(data) {
  if (!data || !Array.isArray(data.torneos)) return "Formato inválido: falta el arreglo de torneos.";
  for (const t of data.torneos) {
    if (!t.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)) return `Fecha inválida: ${t.fecha}`;
    if (!t.hora || !/^\d{2}:\d{2}$/.test(t.hora)) return `Hora inválida: ${t.hora}`;
  }
  if (!data.pagoFinal || !data.pagoFinal.fecha) return "Falta la fecha de pago final.";
  if (!data.horaLimiteMejorMano) return "Falta la hora límite de Mejor Mano.";
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
    return new Response(JSON.stringify(data), { headers: HEADERS });
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
    return new Response(JSON.stringify(ordenado), { headers: HEADERS });
  }

  return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: HEADERS });
};

export const config = { path: "/api/calendario" };
