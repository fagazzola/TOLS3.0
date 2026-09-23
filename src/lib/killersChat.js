// 66ª entrega: parser del "archivo de texto para asignar Killers" que pidió Federico — en la práctica
// es la exportación de WhatsApp del grupo de la liga (formato "[DD/MM/AA, H:MM:SS] Remitente: mensaje").
// Instrucción real de Federico para los jugadores: escribir "Kill <nombre del eliminado>" (o "Killer …")
// en el chat cuando sacan a alguien. Este archivo busca esos mensajes, identifica quién escribió (el
// killer) y a quién nombraron (la víctima), cruzando ambos contra el directorio de Jugadores del sitio
// (Alias PokerStars / Nombre) y, si hace falta, contra una tabla de apodos de chat adicionales
// (hasta 3 por jugador — ver tols-estadisticas / "Referencias para chat"). Cuando el mensaje no trae un
// nombre reconocible después de "Kill", igual se cuenta el kill a favor de quien lo escribió (pedido
// explícito de Federico), pero se marca "sin resolver" para que el administrador lo revise a mano en el
// preview antes de publicar.

// quita acentos, pasa a minúsculas y deja solo letras/números — para comparar nombres/alias sin
// pelearse con mayúsculas, acentos o puntuación.
function normalizar(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// distancia de edición simple (Levenshtein) — solo para tolerar 1-2 letras de diferencia (typos como
// "Chimisaurio" por "chemisaurio", o "fagazolla" por "fagazzola").
function distancia(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// arma, a partir del directorio de Jugadores y la tabla de apodos, un mapa "texto normalizado" →
// Alias PokerStars real — cada jugador aporta su propio Alias, su Nombre completo, y hasta 3 apodos.
export function armarIndiceNombres(directorio, apodos) {
  const indice = new Map(); // normalizado -> aliasPokerStars
  const porTexto = []; // [{norm, alias}] para hacer fuzzy match por distancia después
  function agregar(texto, alias) {
    const norm = normalizar(texto);
    if (!norm || !alias) return;
    if (!indice.has(norm)) indice.set(norm, alias);
    porTexto.push({ norm, alias });
  }
  for (const j of directorio || []) {
    const alias = String(j.aliasPokerStars || "").trim();
    if (!alias) continue;
    agregar(alias, alias);
    agregar(j.nombre, alias);
  }
  for (const [alias, lista] of Object.entries(apodos || {})) {
    for (const apodo of lista || []) agregar(apodo, alias);
  }
  return { indice, porTexto };
}

// intenta resolver un texto (nombre del remitente del chat, o lo que escribieron después de "Kill")
// contra el índice armado arriba. Estrategia, de más a menos estricta: exacto -> contenido uno dentro
// del otro (con un mínimo de 3 caracteres, para no matchear cualquier cosa) -> distancia de edición
// corta (tolera 1 typo en textos de 4-6 caracteres, hasta 2 en textos más largos).
export function resolverNombre(texto, { indice, porTexto }) {
  const norm = normalizar(texto);
  if (!norm) return null;
  if (indice.has(norm)) return indice.get(norm);
  for (const { norm: n2, alias } of porTexto) {
    if (n2.length >= 3 && norm.length >= 3 && (n2.includes(norm) || norm.includes(n2))) return alias;
  }
  let mejor = null;
  let mejorDist = Infinity;
  for (const { norm: n2, alias } of porTexto) {
    const tolerancia = n2.length >= 7 ? 2 : n2.length >= 4 ? 1 : 0;
    const d = distancia(norm, n2);
    if (d <= tolerancia && d < mejorDist) {
      mejor = alias;
      mejorDist = d;
    }
  }
  return mejor;
}

// "Otro Killer para el Ger", "Oootro Killer para el Ger" (cualquier número de "o" antes de "tro"/"tra")
// — prefijo opcional que puede venir ANTES de la palabra Kill/Killer misma.
const PREFIJO_OTRO = /^o+tr[oa]\s+/i;

// conectores que se quitan del principio de "lo que sigue a Kill/Killer" antes de intentar resolver el
// nombre de la víctima — "Kill al fagazolla" / "Killer para el Ger" / "Kill a Sagi", etc.
const CONECTORES = new RegExp(`^(${PREFIJO_OTRO.source})?\\s*(kill(er)?)\\b[\\s:]*((al|a|el|la|los|las|para)\\s+)*`, "i");

function limpiarRemanente(texto) {
  return texto
    .replace(CONECTORES, "")
    .replace(/[!¡?¿."'’“”…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// parsea el .txt exportado de WhatsApp en mensajes {fecha, hora, remitente, texto} — junta líneas de
// continuación (un mensaje que sigue en el renglón de abajo) hasta la siguiente marca de tiempo.
// Tolera la marca invisible ‎ que WhatsApp antepone a mensajes de sistema/multimedia.
const LINEA_MENSAJE = /^‎?\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s?(.*)$/;

export function parsearMensajesWhatsApp(textoCompleto) {
  const lineas = String(textoCompleto || "").split(/\r?\n/);
  const mensajes = [];
  for (const lineaCruda of lineas) {
    const linea = lineaCruda.replace(/^‎/, "");
    const m = linea.match(LINEA_MENSAJE);
    if (m) {
      mensajes.push({ fecha: m[1], hora: m[2], remitente: m[3].trim(), texto: m[4] });
    } else if (mensajes.length) {
      mensajes[mensajes.length - 1].texto += "\n" + linea;
    }
  }
  return mensajes;
}

// un mensaje cuenta como "reclamo de kill" solo si, quitando emojis/puntuación inicial, EMPIEZA con la
// palabra Kill/Killer — así se descartan menciones sueltas de la palabra en medio de una oración
// ("¿quién fue el killer de X?", "no se contabilizan sus killers…").
function esReclamoDeKill(texto) {
  const sinPrefijo = String(texto || "").replace(/^[^a-zA-ZÀ-ÿ]+/, "");
  return new RegExp(`^(${PREFIJO_OTRO.source})?kill(er)?\\b`, "i").test(sinPrefijo);
}

// función principal: recibe el texto completo del chat, el directorio de Jugadores del sitio y la
// tabla de apodos, y devuelve { resueltos, noResueltos } — `resueltos` son kills con víctima
// identificada (killerAlias, victimaAlias); `noResueltos` son kills que sí se cuentan a favor de quien
// los escribió pero sin víctima confiable (para que el administrador los revise/corrija en el preview).
export function extraerKillersDeChat(textoCompleto, directorio, apodos) {
  const idx = armarIndiceNombres(directorio, apodos);
  const mensajes = parsearMensajesWhatsApp(textoCompleto);
  const resueltos = [];
  const noResueltos = [];

  for (const msg of mensajes) {
    if (!esReclamoDeKill(msg.texto)) continue;
    const killerAlias = resolverNombre(msg.remitente, idx);
    const remanente = limpiarRemanente(msg.texto);
    const base = { fecha: msg.fecha, hora: msg.hora, remitente: msg.remitente, mensaje: msg.texto.trim(), killerAlias };

    if (!killerAlias) {
      noResueltos.push({ ...base, motivo: "No se reconoció al remitente en el directorio de Jugadores ni en los apodos de chat." });
      continue;
    }
    if (!remanente) {
      noResueltos.push({ ...base, motivo: "El mensaje no trae un nombre después de \"Kill\" — se cuenta el kill, pero sin víctima asignada." });
      continue;
    }
    const victimaAlias = resolverNombre(remanente, idx);
    if (!victimaAlias) {
      noResueltos.push({ ...base, motivo: `No se reconoció "${remanente}" como ningún jugador.` });
      continue;
    }
    if (victimaAlias === killerAlias) {
      noResueltos.push({ ...base, motivo: `"${remanente}" parece referirse a quien escribió el mensaje, no a una víctima real.` });
      continue;
    }
    resueltos.push({ ...base, victimaAlias });
  }

  return { resueltos, noResueltos };
}
