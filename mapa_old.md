# TOLS 3.0 — Mapa de Módulos y avance

Fuente original: hoja "Base" del Excel "TOLS 3.0 Mapa.xlsx". Hoja "Permisos" agregada después (2026-08-24).

## 🚀 Sitio en producción
URL: **https://tolsv3.netlify.app/**
Repo: `fagazzola/TOLS3.0` (GitHub) → despliegue continuo en Netlify.
Excel maestro: `TOLS3.0-Base-de-Datos.xlsx` en el OneDrive personal de Federico (`OneDrive\Personal\MX\TOLS\TOLS 3.0`).

## ✅ Versión visible del sitio — esquema confirmado
Federico pidió mostrar un número de versión (`x.xx.xxx`) en la esquina superior izquierda del sitio, con o
sin sesión. Esquema confirmado (2026-09-03):
- **1er número** (1 dígito) — generación del sitio; se queda en `1` hasta una reescritura mayor (ej. TOLS 4.0).
- **2º número** (2 dígitos) — sube solo con cambios a los tres módulos "núcleo" que gobiernan la operación de
  la liga: **Tablero de Control, Calendario y Game Night**. El resto de los módulos (Usuarios, Jugadores,
  Cobranza, Estadísticas) no lo mueven. En la práctica, dentro de Tablero de Control esto se interpreta como
  cambios a cómo la liga REALMENTE opera (campeonato activo, puntos, premios, parámetros del juego) — no
  cualquier utilidad administrativa que viva en esa pantalla; "Exportar todo a Excel" (83ª entrega en
  adelante) es justamente eso: una herramienta de administración/IT, no una regla de la liga, así que sus
  cambios no mueven este número (ver 83ª/84ª/85ª/86ª/87ª/88ª/89ª/90ª/91ª/92ª/93ª entregas más abajo).
- **3er número** (3 dígitos) — contador total de **todas** las entregas, núcleo o no — nunca baja, nunca se
  reinicia. Coincide con el número de "entrega" que se lleva en este documento.
- Los dos últimos números son **independientes entre sí** (uno no vive "dentro" del otro).
- Como el conteo de "solo núcleo" no se llevó por separado en las primeras 26 entregas, el esquema arrancó en
  la 27ª entrega. Federico pidió arrancar en `1.02.027` (no en `1.01.027` como se había propuesto).
- Implementado en la 28ª entrega, corregido en la 29ª: `src/version.js` (constante `VERSION`, **se actualiza
  a mano** en cada entrega — no hay nada automático) + `src/components/VersionBadge.jsx` (badge fijo, esquina
  superior izquierda, en las **5** rutas de render de `App.jsx`: `/registro`, cargando, error de perfiles,
  login, y la app principal). **Recordatorio para cada entrega futura:** actualizar `VERSION` en
  `src/version.js` — subir el 2º número si se tocó Tablero/Calendario/Game Night (entendido como arriba —
  reglas de la liga, no utilidades administrativas), y siempre subir el 3er número en +1. Versión actual:
  **`1.29.102`** (102ª entrega — Resultados: `killsTallyDeTorneo()` ahora es consciente de `killsAsignados`,
  cerrando la brecha entre "Resultados Torneos" y "Clasificación general" por killers señalada en la 101ª
  entrega; ver "Cambios de esta ronda" más abajo. No toca ninguna regla de Tablero/Calendario/Game Night —
  el 2º número se queda en 29, solo sube el 3er número).

## ⚠️ Lección aprendida sobre actualizar el repo
Federico descomprimió una entrega anterior SOBRE la carpeta vieja y su descompresor no sobrescribió los archivos ya existentes. Regla para todas las entregas futuras: **borrar la carpeta local completa y descomprimir el `.tar.gz` en una carpeta nueva**, nunca extraer encima de la anterior.

## ⚠️ Decisión confirmada: clonar el repo real de GitHub es el primer paso de CUALQUIER conversación nueva sobre TOLS 3.0
Origen (42ª entrega): Federico preguntó cómo administrar mejor el hecho de que las conversaciones de un mismo
Proyecto de Cowork no se hablan entre sí (cada una tiene su propio espacio de trabajo aislado, aunque comparten
este documento). Se confirmó que `github.com` (aunque no `registry.npmjs.org` ni `raw.githubusercontent.com`)
SÍ es accesible desde el entorno de Claude — se pudo hacer `git clone https://github.com/fagazzola/TOLS3.0.git`
de forma anónima (solo lectura) y confirmar que el repo real ya tenía el commit de la 41ª entrega. Claude le
preguntó explícitamente a Federico si adoptar esto como práctica estándar para todas las conversaciones del
proyecto, y **Federico confirmó que sí — respuesta textual: "SI, para todas las conversaciones en este
proyecto."**

Esto ya no es una propuesta ni un hallazgo tentativo: es una **decisión confirmada y obligatoria**, con el
mismo peso que la decisión de siempre entregar el proyecto completo (ver más abajo). Regla en firme desde la
42ª entrega: **al empezar cualquier conversación nueva sobre TOLS 3.0 que vaya a tocar código, lo primero que
debe hacer Claude es clonar `https://github.com/fagazzola/TOLS3.0.git`** — nunca pedirle el `.tar.gz` a
Federico como primer paso salvo que el clone falle (repo inaccesible, cambio de política de red, etc.), en
cuyo caso sí se le pide el archivo como respaldo. Esto resuelve de raíz el problema de que una conversación no
sepa lo que se hizo en otra, porque el repo (no el chat, no el workspace de una conversación aislada) pasa a
ser la fuente de verdad compartida entre todas las conversaciones del proyecto. Claude sigue sin credenciales
de escritura (no puede hacer push) — el flujo de entrega no cambia: Claude arma el `.tar.gz` completo,
Federico lo descomprime y hace commit/push él mismo.

## ⚠️ Decisión confirmada: SIEMPRE entregar el proyecto completo, nunca archivos sueltos
Claude ofreció (2026-09-03) mandar solo los archivos modificados en vez del `.tar.gz` completo, para
entregas chicas. **Federico lo rechazó explícitamente — "No, dejalo completo."** Cada entrega, sin excepción,
se sigue empaquetando y entregando como el proyecto completo (todas las carpetas y archivos), no solo los
archivos que cambiaron. No volver a ofrecer la alternativa de archivos sueltos salvo que Federico la pida.

## ⚠️ Decisión confirmada: nombre del archivo de entrega y copia automática en OneDrive
Federico avisó (67ª entrega) que antes cada `.tar.gz` se entregaba con el número de entrega en el nombre
(`TOLS3.0-XXa-entrega.tar.gz`) y se dejaba además una copia automática en su OneDrive
(`OneDrive\Personal\MX\TOLS\TOLS 3.0\Claude outputs`) — pidió seguir haciendo ambas cosas. Regla en firme
desde ahora: **todo archivo de entrega se llama `TOLS3.0-XXa-entrega.tar.gz`** (con el número de entrega
real) y, si la conversación está vinculada a su computadora (bridge de dispositivo disponible), **se deja
además una copia en esa carpeta de OneDrive**, sin que haga falta pedirlo cada vez.

## ⚠️ Lección aprendida (86ª entrega): cuando un archivo externo (Excel de Federico) cambia de formato varias veces, reconocer columnas por palabra clave es frágil — hay que mostrar las columnas reales y dejar que el administrador las confirme
"Excel Referencias" (Estadísticas) pasó por tres rondas seguidas intentando adivinar qué columna era cuál
por su nombre: primero solo "referencia" (68ª), después se sumó "chat"/"apodo" (84ª), y aun así el archivo
más reciente de Federico siguió sin reconocerse. El patrón de fondo: cualquier archivo que una persona arma y
reorganiza a su gusto (nombres de columna, orden, cuántas trae) es un blanco móvil — una lista fija de
palabras clave, por más que se amplíe, siempre va a quedar un paso atrás del próximo cambio de formato. Fix
de fondo (86ª entrega, ver más abajo): dejar de adivinar como paso final. Mostrar siempre las columnas reales
del archivo (encabezado + un ejemplo) y que la persona confirme el mapeo a mano, cada vez — la heurística de
palabras clave puede seguir usándose como una PROPUESTA inicial (ahorra el trabajo cuando acierta), pero
nunca como la decisión que se aplica sin mostrarse. Vale como criterio general para cualquier import futuro
de un archivo cuyo formato no esté 100% bajo control del sitio.

## ⚠️ Arquitectura: Netlify Blobs es la base de datos real; el Excel es un espejo de SOLO salida (sitio → Excel), best-effort, de un solo sentido, salvo tres excepciones manuales
Pregunta de Federico (2026-09-30, post-82ª entrega): "Reviso el Excel y no veo nada de toda la información
que proceso y despliego con cada consulta. Donde estás guardando la información? Quedamos que el Excel era
la base que mandaba, que pasó?"

**Aclaración importante para no perder de vista en ninguna conversación futura:** el Excel **nunca fue la
base que manda** — eso no cambió en ninguna entrega, es así desde el diseño original del sitio. Todo lo que
el sitio muestra (Cobranza, Estadísticas, Calendario, Tablero, Jugadores, Game Night) se lee y se calcula
**siempre desde Netlify Blobs** (`tols-cobranza`, `tols-estadisticas`, `tols-calendario`, `tols-tablero`,
`tols-jugadores`, `tols-gamenight`, etc.) — un almacén clave-valor propio de Netlify, no un archivo. El Excel
es, en el mejor de los casos, una copia de salida: cada módulo, al guardar en Blobs, intenta ADEMÁS escribir
una copia en `TOLS3.0-Base-de-Datos.xlsx` vía Microsoft Graph API (`syncTablero()`, `syncEstadisticas()`,
etc. en `netlify/functions/lib/msgraph.js`) — pero esa escritura es **best-effort**: si falla (permisos de
Graph, token expirado, límites de la hoja, lo que sea), el sitio sigue funcionando normal porque nunca
depende de leer de ahí, y hasta la 82ª entrega no había ninguna forma de enterarse si la sincronización había
fallado en silencio.

Las excepciones donde el sitio SÍ lee del Excel hacia Blobs siguen siendo manuales, nunca automáticas:
"Importar desde Excel" en Usuarios/Jugadores, y "Excel Referencias" en Estadísticas (ver 82ª/84ª/86ª entregas).

**Resuelto en la 83ª entrega — Federico eligió la opción (b) que se le había propuesto acá: un botón
"Exportar todo a Excel" (en Tablero de Control) que regenera el archivo completo a demanda desde Blobs, en
vez de investigar por qué la sincronización automática venía fallando en silencio.** Ver el detalle completo
en "Cambios de rondas anteriores" más abajo — la sincronización automática silenciosa (`safe()` en
`msgraph.js`) **no se tocó ni se eliminó**, sigue siendo el camino de todos los días; el botón nuevo es un
camino alternativo, explícito, que el administrador dispara cuando quiere estar seguro de que el Excel quedó
al día con lo que hay en Blobs en ESE momento, y que además, a diferencia de la sincronización automática, si
algo falla SÍ lo muestra en pantalla (módulo por módulo). **En la 85ª entrega se corrigió un bug de fondo de
este mismo botón (corría de forma síncrona y se agotaba el tiempo) y se sumó, a pedido de Federico, una
copia de respaldo del Excel antes de cada regeneración. En la 90ª entrega se le agregó avance en vivo
mientras corre, y se corrigió otro bug de fondo por el que ese avance (y hasta el resultado final) no
terminaban de verse. En la 91ª entrega se corrigió un bug relacionado (el resultado se perdía al volver a
la pantalla después de que terminara en otra pestaña) y se agregó el archivo/ruta real de destino — ver
ambas entregas más abajo.** El archivo al que siempre escribió este botón (y la sincronización automática
de siempre) es, y siempre fue, el mismo "archivo base" de OneDrive de siempre — ver `EXCEL_PATH` en
`msgraph.js` y la 91ª entrega más abajo, donde esto se hizo explícito en pantalla por primera vez.

**Caso real que confirma el diseño — y una brecha real que expuso (92ª entrega, ver más abajo):** Federico
mandó una copia real del Excel maestro y preguntó por qué no coincidía con lo que ve en el portal, en
particular por los "Pagos y depósitos confirmados". La respuesta no fue un fallo de sincronización — fue que
el espejo de Excel para ese dato en particular **nunca existió, en ninguna hoja**, desde que ese modelo de
datos se introdujo en la 76ª entrega (ver la 92ª entrega más abajo para el detalle completo). Lección general
para cualquier rediseño futuro de un módulo: cuando el modelo de datos de una pantalla cambia (mapas o campos
nuevos en Blobs), el espejo de Excel de ese módulo hay que re-auditarlo/extenderlo explícitamente — nunca se
actualiza solo, y la brecha puede quedar invisible durante muchas entregas hasta que alguien compara los dos
lados directamente.

## ⚠️ Lección aprendida sobre cambiar el esquema de datos en Blobs
Netlify Blobs solo "siembra" los datos la primera vez que se lee el store — si ya había datos guardados con un esquema/ids viejos, se quedan así para siempre aunque se suba código nuevo. Fix: cada función que persiste en Blobs **normaliza/sana** los datos al leer/guardar. El caso "usuario = correo" de la 17ª entrega se resolvió con un OR de compatibilidad en el login en vez de forzar una migración de datos. **Caso relacionado (71ª entrega):** esta misma idea de "normalizar al leer" puede volverse un problema si la función de normalización usada para sanear datos GUARDADOS es la misma que se usa para sanear ENTRADA nueva antes de calcular — ver el detalle del bug de "Estadísticas" en el cambio de esa ronda. Lección ampliada: cuando una función de normalización sirve a dos propósitos distintos (sanear input vs. sanear lo ya guardado), separarla en dos, porque los campos que hay que descartar en un caso son justo los que hay que conservar en el otro. **Caso relacionado (95ª entrega):** el mismo patrón de "solo agrega lo que falta, nunca quita lo que sobra" que tiene este tipo de normalización puede dejar inútil la eliminación de un valor del catálogo (un rol, un tipo, una opción fija) si Blobs ya tenía ese valor guardado de antes (la eliminación evita que se vuelva a CREAR, pero no borra lo que ya estaba guardado; hace falta un filtro explícito, aparte del loop de "completar lo que falta", para limpiar lo que ya sobra (ver el detalle en la sección de la 95ª entrega más abajo).

## ⚠️ Nueva lección (85ª entrega): una función síncrona de Netlify tiene un techo de tiempo real — cualquier operación que encadene muchas llamadas a una API externa (Graph API, en este caso) necesita correr en segundo plano
"Exportar todo a Excel" (83ª entrega) encadenaba, en una sola invocación de función, 10 módulos cada uno con
varias llamadas reales a Microsoft Graph API — de sobra para superar el tiempo máximo que Netlify permite
para una función síncrona. Cuando eso pasa, Netlify no devuelve el error de la función: devuelve **su
propia página de error HTML** (gateway timeout), y el código que esperaba JSON del lado del cliente truena
al intentar parsearla ("Unexpected token '<'...'"). Ver el detalle completo en la 85ª entrega más abajo.
**Regla a futuro:** cualquier acción que vaya a hacer un número no acotado de llamadas de red (sincronizar
varios módulos, procesar archivos grandes, etc.) debe correr como función en segundo plano (`background:
true` en `config`, Netlify Functions v2) con un store de Blobs para reportar el estado, y la pantalla debe
sondear ese estado en vez de esperar una sola respuesta larga — nunca asumir que "total, no es tan lento"
sin medirlo contra el techo real de la plataforma.

## ⚠️ Nueva lección (91ª entrega): un store de Blobs que guarda el "último resultado conocido" de una tarea en segundo plano debe poder RESTAURARSE al volver a la pantalla, no solo consultarse mientras la tarea sigue corriendo
`tols-exportar-estado` (84ª/85ª entrega) siempre guardó el reporte final de "Exportar todo a Excel" hasta
que corriera la próxima exportación — ese dato nunca se perdía del lado del servidor. El bug (ver la 91ª
entrega más abajo) estaba del lado del cliente: el sondeo que se dispara al montar `Tablero.jsx` solo
retomaba el caso "en-curso" (si la exportación seguía corriendo); si ya había terminado, el componente nunca
volvía a leer ese último resultado, así que `reporteExport` (estado de React, se pierde al desmontar el
componente) se quedaba vacío para siempre después de cambiar de pantalla o recargar. Lección general: si un
store de Blobs guarda el "último resultado conocido" de algo para mostrarlo en una pantalla, el código que
lee ese store al entrar a la pantalla tiene que cubrir TODOS los estados posibles que el store puede tener
("en-curso" Y "listo"/"error"), no solo el que motivó agregar el sondeo en primer lugar — de lo contrario el
dato persistido del lado del servidor queda inútil del lado del cliente en cuanto el componente se desmonta
una vez.

## ⚠️ Una sesión guardada en el navegador bloquea `/registro`
`/registro` solo se muestra cuando **no** hay sesión activa en ese navegador. Desde la 16ª entrega esto se resuelve solo tras 30 minutos de inactividad.

## ⚠️ Caso real: dos cuentas confundidas por edición manual de la tabla de Usuarios
Federico reportó no poder entrar con `fagazzola@gmail.com` + su contraseña nueva. Diagnóstico vía WebFetch a
`/api/perfiles` (lectura pública, sin necesidad de acceso de escritura) mostró la causa real: su cuenta de
administrador (nombre "Federico Alvarez") había quedado con el correo cambiado a `juanito123@yahoo.com`, y
por separado existía una cuenta de prueba "Juan Cavallo" con su Gmail y contraseña `123456` (de cuando probó
`/registro`). No era un bug de código — leer el endpoint público de datos para comparar contra lo que el
usuario reporta sigue siendo la forma más rápida de diagnosticar este tipo de confusión de datos.

## ⚠️ Caso real: el campeonato "activo" no estaba centralizado (Tablero decía 2026-I, Calendario 2026 Clausura)
Cada pantalla que necesitaba saber "cuál es el campeonato vigente" lo adivinaba por su cuenta: el Tablero
guardaba su selección solo en estado local del navegador (sin persistir, volvía a `nombres[0]` en cada
recarga), y el Calendario lo derivaba de las fechas de los torneos. Podían quedar desincronizados sin que
nada lo detectara. Fix (23ª entrega): `tols-campeonatos` ahora guarda `{ nombres, activo }` — el Tablero
persiste `activo` cada vez que se cambia el combo (o se agrega/renombra un campeonato), y esa es la única
fuente de verdad que usa el Calendario (y a futuro cualquier otra pantalla). Lección: cuando dos pantallas
necesitan coincidir en "cuál es el X vigente", ese valor debe vivir en un solo lugar (persistido), nunca
derivarse por separado en cada pantalla.

## ⚠️ Caso real (continuación): centralizar el dato no basta si el guardado puede fallar en silencio
Después de la 23ª entrega, Federico siguió viendo el mismo desajuste `2026-I` (Tablero) vs `2026 Clausura`
(Calendario). Causa: `Tablero.jsx` guardaba el `activo` nuevo con `fetch(...).catch(() => {})` — "dispara y
olvida". Fix (24ª entrega): la función ahora es `async`, hace `await` del `fetch`, revisa `response.ok`, y si
algo falla lo muestra de inmediato en pantalla. Lección: centralizar un dato en un solo lugar no basta si el
camino para escribirlo puede fallar callado.

## ⚠️ Caso real (otra causa distinta): fechas individuales sin campeonato asignado ("huérfanas")
Con `campeonatos.activo` ya funcionando bien, Federico seguía viendo una fecha etiquetada con el campeonato
equivocado en el Calendario. Esta vez la causa era que ese torneo **nunca tuvo un campo `temporada` guardado**
(dato de antes de que ese campo existiera). Fix de dos capas (25ª entrega): auto-completado en el servidor
(`conTemporadaCompletada` en `calendario.js`, ahora usa el campeonato activo) y una reparación adicional del
lado del navegador en `Calendario.jsx` al entrar como Administrador.

## ⚠️ Caso real (raíz definitiva): el campeonato por fecha nunca debió ser elegible por torneo
Después de la 25ª entrega, Federico aclaró el problema de fondo: el Calendario seguía dejando **elegir** el
campeonato de cada fecha individualmente (un combo en el modal de crear/editar torneo), lo cual contradice la
regla de que "el campeonato definido en el Tablero de Control regula todas las páginas". Fix definitivo (26ª
entrega): se quitó el combo de campeonato del modal de fecha — ahora es un campo de solo lectura que siempre
muestra el campeonato activo, y toda fecha nueva o editada se guarda automáticamente con esa temporada, sin
excepción. Lección: cuando una regla de negocio dice "X gobierna todo", hay que quitar del modelo de datos
(o de la interfaz) cualquier forma de que otra pantalla decida X de forma independiente.

## ⚠️ Caso: cambiar el campeonato activo en el Tablero también necesitaba sus propias protecciones
Con el Calendario ya blindado (26ª entrega), Federico pidió proteger el otro lado: cambiar cuál es el
campeonato **activo** desde el Tablero de Control. Dos reglas de negocio nuevas (27ª entrega): (1) si el
campeonato activo actual ya está **"en curso"** (mismo criterio que el estatus del Calendario — algunas fechas
jugadas, otras pendientes), no se puede cambiar de campeonato en absoluto, ni elegir uno existente ni crear
uno nuevo (que se activa de inmediato); (2) si no está en curso pero sí tiene fechas registradas en el
Calendario, se pide **confirmación explícita** antes de cambiar, explicando que esas fechas van a dejar de
contar como vigentes en el resto del sitio (no se borran, pero dejan de aparecer en las vistas normales).
Nota importante: técnicamente esas fechas **no se eliminan** — Federico las describió como que "se van a
borrar" en su pedido original, pero lo que realmente pasa es que dejan de estar filtradas como "del campeonato
activo" en el resto de pantallas (siguen ahí, visibles en la cuadrícula completa del Administrador). El aviso
se redactó siendo honesto sobre esto en vez de implementar un borrado real — **sigue pendiente de decidir con
Federico** si de verdad quiere que cambiar de campeonato borre las fechas anteriores.

## ⚠️ Caso real: `replace_all` con indentación distinta se saltó una ocurrencia
Al agregar `<VersionBadge />` junto a cada `<Decor />` en `App.jsx` (28ª entrega), se usó un `replace_all`
buscando el string exacto `"        <Decor />"` (con 8 espacios de indentación). Cuatro de las cinco rutas de
`App.jsx` tenían esa indentación, pero la ruta principal (con sesión iniciada — la que Federico usa siempre)
tenía `<Decor />` con **6 espacios**, dentro de un bloque menos anidado. El `replace_all` no la tocó, y el
badge de versión nunca apareció en la pantalla principal — exactamente donde Federico lo estaba buscando.
Fix (29ª entrega): se agregó `<VersionBadge />` a mano en esa quinta ruta. Lección: un `replace_all` con un
string que incluye espacios de indentación específicos puede fallar en silencio si no todas las ocurrencias
comparten el mismo nivel de indentación — conviene verificar el conteo de coincidencias contra el número de
lugares esperados (`grep -c`) en vez de asumir que un `replace_all` sin error cubrió todos los casos.

## ⚠️ El Calendario del Jugador ya puede empezar a mostrar posición/puntos reales (Game Night, 32ª entrega)
Desde la 22ª entrega, cada fecha del Calendario mostraba siempre "Posición: Próximamente (Game Night)" /
"Puntos: Próximamente (Game Night)", porque esos datos requerían resultados que no existían en ningún lado.
Con la 32ª entrega, Game Night ya calcula y guarda (en `tols-gamenight`, derivado en cada lectura — nunca
como dato suelto) la posición de salida y los puntos de cada jugador por torneo. El Calendario del Jugador
quedó pendiente de conectarse a esos datos durante varias entregas — finalmente, en la **72ª entrega**, se
conectó (no a Game Night, que había quedado deprecado desde la 66ª, sino a `/api/estadisticas`, que es la
fuente real de resultados publicados desde entonces): ver el detalle en "Cambios de rondas anteriores" más
abajo.

## ⚠️ Caso real: renombrar un campeonato solo se propagaba a Tablero, no a Calendario/Cobranza/Game Night
Cada módulo que necesita saber a qué campeonato pertenece algo (Calendario, Cobranza, Game Night) lo guarda
como el **nombre** en texto plano (no un id estable): `torneos[].temporada` en Calendario,
`movimientos[].campeonato` (y el id `gn-{campeonato}-{fecha}-{correo}`) en Cobranza, y la llave del mapa
`{ [campeonato]: {...} }` en Game Night. `Tablero.jsx`'s `renombrarCampeonato()` solo actualizaba
`tols-campeonatos` y `tols-tablero` — nunca los otros tres, así que después de un renombre esas pantallas
seguían mostrando el nombre viejo (y el combo de fecha/torneo de Cobranza quedaba vacío para el campeonato
recién renombrado, porque filtraba por un nombre que ya no existía en `torneosCal`). Fix (33ª entrega): un
solo endpoint (`accion: "renombrar"` en `/api/campeonatos`) hace el renombre y en cascada llama a una función
exportada por cada módulo (`renombrarCampeonatoEnTablero`, `...EnCalendario`, `...EnCobranza`,
`...EnGameNight`) — cada una best-effort (si una falla no revierte el renombre principal, pero se devuelven
`avisos` para revisar a mano). También se agregó una validación nueva: si el campeonato está **"en curso"**
(mismo criterio de siempre) no se permite renombrarlo, ni desde el servidor ni desde el botón del Tablero.
**Extendida en la 76ª entrega:** `renombrarCampeonatoEnCobranza()` ahora también remapea las llaves de los
tres mapas nuevos de pagos/depósitos confirmados (ver esa entrega más abajo) — mismo criterio, el nombre del
campeonato vive dentro de la llave del mapa en vez de en un campo aparte. **Extendida de nuevo en la 88ª
entrega**, para el cuarto mapa nuevo de esa ronda (`pagosInscripcion`) — mismo criterio exacto.

## ⚠️ Caso real: `RangeExceedsLimit` (HTTP 400) al leer la hoja Jugadores del Excel
El botón "Importar desde Excel" empezó a fallar con `Graph API 400 ... RangeExceedsLimit` al leerse contra
`/workbook/worksheets('Jugadores')/usedRange`. Causa: la API `usedRange` de Excel considera que una hoja tiene
datos mucho más allá de lo real si alguna vez se formateó o seleccionó una fila/columna completa (una acción
muy común sin querer), y Graph impone un límite máximo de celdas sobre ese rango inflado. No es un problema
exclusivo de la hoja Jugadores — puede pasarle a cualquier hoja que alguna vez haya sido "tocada" así. Fix
(33ª entrega, general, no solo para Jugadores): se reemplazó `readSheetUsedRange()` por `readSheetAcotado()`
en `netlify/functions/lib/msgraph.js`, que en vez de pedir `usedRange` pide un rango fijo acotado
(`A1:AF4000` por default) y recorta las filas vacías al final — nunca vuelve a depender de qué tan "inflado"
esté el `usedRange` de una hoja.

## ⚠️ Caso real (resuelto): `GameNight_Killers`/`GameNight_Resultados` — hojas vestigiales, sin relación con el código actual
Federico preguntó por qué renombrar un campeonato no actualizaba las hojas "GameNight_Killers" y
"GameNight_Resultados" del Excel. Al revisar el `TOLS3.0-Base-de-Datos.xlsx` real (subido por Federico el
2026-09-15) se confirmó que esas dos hojas **sí existen**, pero son un boceto armado *antes* de que se
construyera Game Night (32ª entrega) — con columnas y filas de ejemplo pensadas para fórmulas manuales de
Excel (ej. la nota en `GameNight_Resultados`: "agregá primero al jugador en 'Cobranza_Resumen' — acá el
Nombre se trae solo por correo"), muy distintas al diseño que terminamos implementando (todo calculado del
lado del sitio, sin fórmulas). La propia hoja "Léeme" de ese archivo todavía dice en el punto 16 que "MOD 4 ·
Cobranza y MOD 5 · Game Night todavía no existen como pantallas del sitio" — o sea que ese Excel es de antes
de ambos módulos, y esas dos hojas nunca se conectaron con el código real. Las hojas que el sitio sí sincroniza
son `GameNight_Sesiones` y `GameNight_Jugadores` (se crean solas la primera vez que se usa el módulo — a la
fecha, Federico confirmó que todavía no ha iniciado ningún torneo en Game Night, por eso no existen aún).
**Decisión de Federico (2026-09-15): dejarlo como está** — el sitio sigue creando
`GameNight_Sesiones`/`GameNight_Jugadores` por su cuenta; las hojas viejas `GameNight_Killers`/
`GameNight_Resultados` quedan sin usarse en el Excel (Federico puede borrarlas a mano si quiere, no hace
falta que el sitio las toque). No se hizo ningún cambio de código por este punto.

## ⚠️ Caso real: Federico insertó a mano una columna nueva en medio de la hoja Jugadores (34ª→35ª entrega)
Federico pidió agregar un campo "Mano favorita" en Mi Perfil y avisó que ya había agregado la columna
correspondiente en el Excel — "la había puesto en la K, pero no quiero mover fórmulas o deshacer algo".
Como toda la lógica de lectura/escritura de la hoja "Jugadores" depende de índices de columna fijos
(0-indexed, documentados en `filasJugadoresUnificadas()` en `msgraph.js`), insertar una columna real en K
corre una posición a la derecha TODO lo que antes vivía de K en adelante — no solo lo nuevo. Se pidió el
Excel real (en vez de adivinar la columna) y, al leer el encabezado con `openpyxl`, se confirmó el
corrimiento completo: Fecha de Registro pasó de K a L, Estatus de L a M, Host de M a N, Host Fecha de N a O,
**Contraseña de O a P, y Perfil de P a Q**. Fix: se actualizaron TODOS los índices de columna en
`msgraph.js` (`filasJugadoresUnificadas`, `leerUsuariosYPermisosDesdeExcel`, `leerJugadoresDesdeExcel`) y la
columna que se oculta con asteriscos (`ocultarColumnaTexto`, de "O" a "P"). Además se eliminó una limpieza
de una sola vez que quedaba en el código desde la 33ª entrega (`Q2:Q401` se borraba automáticamente en cada
sync, porque en ese momento Q era una columna vieja de Perfil que había quedado huérfana) — con la columna
nueva de Federico, Q pasó a ser el Perfil real y esa limpieza automática lo habría borrado en cada guardado.
Lección: cuando alguien inserta una columna real en medio de una hoja que el código lee/escribe por índice
fijo, NUNCA hay que adivinar el nuevo mapeo — hay que pedir el archivo real y leer el encabezado tal cual
quedó, porque el corrimiento afecta a todas las columnas posteriores, no solo a la insertada. También: una
limpieza "de una sola vez" dejada en el código productivo (no detrás de un flag ni removida después de
usarse) es una bomba de tiempo si el layout de la hoja vuelve a cambiar — se debió quitar en cuanto cumplió
su propósito en la 33ª entrega.

## ⚠️ Nueva lección, crítica (87ª entrega): un hook de React colocado después de un `return` condicional temprano puede tumbar el sitio ENTERO, no solo la pantalla donde se agregó
Al agregar el `useEffect` de "retomar el sondeo de exportación" en la 85ª entrega, se lo colocó más abajo en
el archivo, cerca de las funciones que realmente usa (`exportarExcel`, `consultarEstadoExport`) — a simple
vista, un lugar razonable. El problema: `Tablero.jsx` ya tenía, desde antes, dos `return` condicionales
tempranos (`if (loading) return ...`, `if (loadError || !draft) return ...`) más arriba en el componente, y
las Reglas de los Hooks de React exigen que TODOS los hooks se llamen, en el mismo orden, en cada render —
nunca después de un `return` que pueda saltearse en algunos renders y no en otros. Mientras `loading` es
`true`, React nunca llega a ejecutar ese `useEffect` (el `return` corta antes); en cuanto `loading` pasa a
`false` (la carga normal de datos, que tarda uno o dos renders), React de golpe encuentra un hook que no
había visto antes — y tira el error "Rendered more hooks than during the previous render". Como esta base de
código no tiene ningún Error Boundary en ningún lado, ese error no se queda contenido en Tablero: tumba TODO
el árbol de React, dejando visible solo el fondo verde de la página, para absolutamente cualquier usuario que
inicie sesión (Tablero es la pestaña por default tras el login) — no solo quien usara "Exportar todo a
Excel", la función que originó el cambio. **Regla a futuro, sin excepción:** cualquier hook nuevo en un
componente que tenga `return` condicionales tempranos va SIEMPRE junto a los demás hooks, antes de esos
`return` — nunca más abajo, aunque temáticamente encaje mejor cerca del código que lo usa. Vale la pena
además registrar, como hueco arquitectónico conocido (no pedido por Federico, pero relevante dado lo que
pasó acá): esta base de código no tiene ningún Error Boundary — un error de render en cualquier componente
puede tumbar el sitio completo en vez de quedar contenido en esa pantalla. **Aplicada de nuevo en la 90ª
entrega**, preventivamente, para el `useEffect` nuevo de `Estadisticas.jsx` (que resetea la vista de
"Clasificación general" si deja de estar permitida) — se verificó que ese componente SÍ tiene un `return`
condicional temprano (`if (cargando) return ...`) y se colocó el hook nuevo bien arriba, junto a los demás
`useState`, antes de ese `return`. **Aplicada otra vez en la 97ª entrega**, para el `useEffect` nuevo que
descarta la edición de Kills en curso al cambiar de torneo abierto — ver esa entrega más abajo.


## Cambios de esta ronda (2026-10-06 — 102ª entrega)

### 102ª entrega — Resultados: "Clasificación general" por killers ahora también refleja las correcciones killer→killed
Pedido de Federico:

> Se actualiza la tabla de resultados pero no la clasificación general por Killers.
> Revisa

**1. Confirmación del diagnóstico ya documentado en la 101ª entrega.** `killsPorAliasTorneo` (la tabla de
"Resultados Torneos" de un torneo abierto) y `killsTallyDeTorneo()` (usado por "Clasificación general",
vista "por killers", recorriendo TODOS los torneos publicados de un campeonato) eran dos cálculos
independientes: el primero se hizo consciente de `killsAsignados` en la 101ª entrega, pero el segundo se
dejó sin tocar a propósito (brecha documentada en esa misma entrega, punto 7) — seguía contando solo
`j.eliminadoPor`, el dato original fijado al publicar, ignorando cualquier corrección hecha con el botón
"☠ Agregar Killer". Por eso una reasignación se veía en la tabla del torneo pero no en el ranking general.

**2. Fix — `killsTallyDeTorneo(torneo)` usa ahora la misma regla "asignación si la hay, si no
`eliminadoPor`".** Mismo criterio exacto que `killerEfectivo(j)` (101ª entrega, usado para el torneo
abierto): `Object.prototype.hasOwnProperty.call(torneo.killsAsignados, j.alias) ?
torneo.killsAsignados[j.alias] : j.eliminadoPor`. Como esta función recibe el objeto `torneo` completo de
CADA fecha publicada del campeonato (no solo la abierta), lee la `killsAsignados` propia de cada torneo —
una corrección hecha en el torneo del 28/09 solo afecta el tally de ESE torneo, igual que antes de este fix
solo afectaba `eliminadoPor` de ese mismo torneo. Los kills de `logKillersNoResueltos[].asignadoA` (69ª
entrega) siguen siendo aditivos, sin cambios.

**3. Nada más se tocó.** `killerEfectivo(j)` (para el torneo abierto) y la validación del backend
(`"asignarKiller"`) ya usaban esta misma regla desde la 101ª entrega — este fix solo extiende la regla al
helper que faltaba, para que las tres lecturas del dato (tabla del torneo, validación del límite, y
"Clasificación general") coincidan siempre.

**Interpretación deliberada:** ninguna — es exactamente la brecha que la 101ª entrega ya había señalado como
pendiente, cerrada ahora a pedido explícito de Federico.

**Verificación hecha:** se usó el compilador de TypeScript disponible en el entorno (`tsc --noEmit --allowJs
--checkJs false --jsx react-jsx --target esnext --module esnext --noResolve --skipLibCheck`) sobre
`Estadisticas.jsx` — sin errores. Conteo de llaves/paréntesis/corchetes balanceado (920/920 `()`, 192/192
`[]`, 669/669 `{}`). Se confirmó con `grep` que `killsTallyDeTorneo` tiene una sola definición y que su único
llamador (`vistaClasificacion === "killers"`) no cambió de firma. **No se pudo** correr `vite build`
completo, probar en vivo contra Blobs de producción, ni ver la pantalla renderizada (mismas limitaciones de
siempre: sin acceso a `npm`/red ni a las credenciales reales desde este entorno) — vale la pena que Federico,
después de desplegar esta entrega, confirme que una corrección killer→killed hecha con "☠ Agregar Killer" ya
se refleja también en "Clasificación general" (vista "por killers").

## Cambios de rondas anteriores (2026-10-06 — 101ª entrega)

### 101ª entrega — Resultados: Kills rediseñado — de corregir el número a mano a una asignación killer→killed
Pedido de Federico:

> La adecuación de Killers está mal, no debes de poder modificar el número , si no quien aparecer de Killer y luego sumárselo en el total.
> Entonces, elimina la modificación del número en la tabla, y para no hacer tan abultada la información en la tabla, pon hasta arriba un botón para agregar killer e indica desde dos combos:
> "Killer" a "Killed"
> Si el que es killed ya tiene killer, se reemplaza y se suma al killer.
> Si no tiene killer, simplemente se muestra y también se suma.
> Recuerda las reglas:
> 1) no puede haber más killers que el total de jugadores de ese torneo - 1; y
> 2) solo el administrador general puede agregar killers

**1. Por qué se rediseñó por completo, y no solo se ajustó la 97ª/98ª entrega.** La 97ª entrega (corrección
manual del NÚMERO total de Kills de un jugador, vía `killsManual`) resultó, a juicio de Federico, un modelo
mal planteado — no corrige quién mató a quién, solo pisa el total final sin dejar rastro de la causa. Esta
entrega elimina `killsManual` por completo y lo reemplaza por un modelo de asignación: el administrador
general dice QUIÉN ("Killer") eliminó a QUIÉN ("Killed"), y el total de cada jugador se sigue derivando del
mismo tally de siempre (contar cuántas veces aparece como killer), nunca de un número suelto.

**2. Nuevo campo `killsAsignados` (reemplaza a `killsManual`) — un mapa víctima(alias) → killer(alias).**
Guardado dentro de cada torneo en `tols-estadisticas`, normalizado en `normalizarTorneoEst(t)`
(`netlify/functions/estadisticas.js`): `killsAsignados[killed] = killer`. El killer EFECTIVO de cualquier
jugador `j` es `killsAsignados[j.alias]` si existe esa entrada, o si no, el `eliminadoPor` original (el dato
de siempre, fijado al publicar desde el parseo del chat de WhatsApp). Reasignar la misma víctima a un killer
distinto REEMPLAZA la entrada — nunca convive más de un killer por víctima — así que el total del killer
viejo baja solo y el del nuevo sube, sin ningún ajuste adicional, porque el tally se recalcula siempre desde
cero a partir de esta regla "asignación manual si la hay, si no `eliminadoPor`" — exactamente lo que pidió
Federico: "si el que es killed ya tiene killer, se reemplaza y se suma al killer. Si no tiene killer,
simplemente se muestra y también se suma". Cualquier corrección vieja guardada en `killsManual` (un número
suelto, sin víctima asociada) no tiene cómo migrarse a este esquema nuevo y se descarta al normalizar — si
Federico la necesita de nuevo, se vuelve a asignar con el killer y la víctima reales desde el botón nuevo.

**3. Backend — acción `"editarKills"` reemplazada por `"asignarKiller"` en `/api/estadisticas` (PUT).**
Valida que el torneo exista y esté `publicado`, que tanto `killer` como `killed` existan entre los jugadores
de ese torneo, y rechaza `killer === killed` (un jugador no puede eliminarse a sí mismo — una validación de
sentido común no pedida explícitamente por Federico, pero necesaria porque "Killer" y "Killed" son dos combos
independientes sobre la misma lista de jugadores). Para validar el límite de kills, se calcula el tally
EFECTIVO completo después de la reasignación hipotética (mismo criterio "asignación si la hay, si no
`eliminadoPor`", más los kills de `logKillersNoResueltos[].asignadoA`, que siguen siendo aditivos y no se
tocaron en este rediseño) y se rechaza si el killer quedaría con más de `(cantidad de jugadores del torneo −
1)` kills — la regla 1) de Federico, validada contra el mismo número que ve en pantalla. Si todo es válido,
se guarda `torneo.killsAsignados` y se sincroniza con Excel igual que el resto de las acciones de este
endpoint. El chequeo de rol ("Administrador General") queda del lado del cliente, mismo criterio que ya
documenta la "Nota de permisos" de `tablero.js` para el resto del sitio.

**4. Frontend — se quitó por completo la edición en línea del número de Kills.** Se eliminaron el botón "✎"
por fila, el input numérico con los botones ✓/✕, y todo su estado (`editandoKills`, `borradorKills`,
`guardandoKills`, `errorKills`, `guardarKillsManual()`). La columna "Kills" de la tabla de un torneo
publicado volvió a ser una celda de solo lectura, con el número ya calculado (`killsPorAliasTorneo[j.alias]`).

**5. Frontend — nuevo botón "☠ Agregar Killer" arriba de la tabla, junto a "📤 Exportar a Excel".** Para no
"abultar" la tabla con un control por fila (como pidió Federico — "para no hacer tan abultada la información
en la tabla"), se agregó un solo botón en el encabezado de la sección "Resultados torneo {...}", visible
solo para `adminGeneral` (regla 2) de Federico — más estricto que `admin`, que es el gate de "Exportar a
Excel"). Al hacer clic, abre un modal (mismo patrón `modal-backdrop`/`modal-card`/`modal-title`/
`modal-actions`/`login-field`/`login-error` ya usado en Cobranza.jsx) con dos combos — "Killer" y "Killed" —
poblados con los jugadores del torneo abierto, un texto de ayuda recordando el límite de kills
(`maxKillsTorneoActual`, sin cambios de cálculo desde la 97ª entrega: `jugadores del torneo − 1`), y los
botones Cancelar/Agregar. Al confirmar, llama a `"asignarKiller"` y refresca `estData` con la respuesta del
servidor; cualquier error del servidor (killer/killed inexistentes, self-kill, o límite superado) se muestra
dentro del modal.

**6. Frontend — `killerEfectivo(j)` y `killsPorAliasTorneo` recalculados con la misma regla que el backend.**
Nuevo helper `killerEfectivo(j)` (`Object.prototype.hasOwnProperty.call(killsAsignados, j.alias) ?
killsAsignados[j.alias] : j.eliminadoPor`), usado tanto para la columna "Killer" de la tabla (antes mostraba
`j.eliminadoPor` crudo) como para el tally `killsPorAliasTorneo` — ya no hay ningún loop de override por
`killsManual`, el tally se arma siempre contando `killerEfectivo(j)` de cada jugador más los
`logKillersNoResueltos.asignadoA` de siempre. Se agregó un `useEffect` nuevo (colocado junto a los demás
`useState`, antes del `return` condicional de `if (cargando)` — por la lección de la 87ª entrega) que cierra
el modal y limpia su error al cambiar de torneo abierto.

**7. Alcance deliberado — `killsTallyDeTorneo()` (usado por "Clasificación general" por-killers, a través de
TODOS los torneos publicados de un campeonato) NO se tocó, y por lo tanto NO es consciente de
`killsAsignados`.** Es un helper de módulo distinto del `killsPorAliasTorneo` que sí se modificó — sigue
computando puramente desde `j.eliminadoPor` + `logKillersNoResueltos.asignadoA`, igual que siempre. Esto
significa que una corrección killer→killed hecha con el botón nuevo se refleja correctamente en la tabla de
"Resultados Torneos" de ESE torneo (la vista afectada por este pedido), pero todavía **no** se refleja en el
ranking de "Clasificación general" por killers, que sigue contando el `eliminadoPor` original de cada
víctima. Es una brecha real, no resuelta en esta entrega. **Cerrada en la 102ª entrega — ver esa entrega al
principio de este documento: `killsTallyDeTorneo()` ahora usa la misma regla.**

**Interpretación deliberada — resumen de las decisiones que van más allá del pedido literal:** (i) rechazar
`killer === killed` (self-kill), un chequeo de sentido común no pedido explícitamente pero necesario por el
diseño de dos combos independientes; (ii) dejar `killsTallyDeTorneo()`/"Clasificación general" sin tocar,
documentado como una brecha real del punto 7 de arriba — **cerrada en la 102ª entrega, a pedido explícito de
Federico**.

**Verificación hecha:** se usó el compilador de TypeScript disponible en el entorno (`tsc --noEmit --allowJs
--checkJs false --jsx react-jsx --target esnext --module esnext --noResolve --skipLibCheck`) sobre
`Estadisticas.jsx` y `estadisticas.js` juntos — sin errores. `node --check` (parseo puro) limpio en
`estadisticas.js`. Conteo de llaves/paréntesis/corchetes balanceado en ambos archivos (0/0/0 de diferencia
entre apertura y cierre de los tres símbolos). Se confirmó con `grep` que no queda ninguna referencia
colgada a `killsManual`/`editarKills`/`editandoKills`/`borradorKills`/`guardandoKills`/`errorKills` fuera de
los comentarios explicativos que documentan el reemplazo, y que `killsAsignados`/`asignarKiller`/
`killerEfectivo`/`agregarKillerAbierto` se usan de forma consistente entre su declaración y cada punto donde
se leen/llaman. Se confirmó por lectura directa que el `useEffect` nuevo queda antes del `return` condicional
de `if (cargando)` (lección de la 87ª entrega). **No se pudo** correr `vite build` completo, probar en vivo
contra Blobs de producción, ni ver la pantalla renderizada (mismas limitaciones de siempre: sin acceso a
`npm`/red ni a las credenciales reales desde este entorno). **Feedback real recibido al pasar a la 102ª
entrega** — Federico señaló exactamente la brecha ya documentada en el punto 7 de arriba, cerrada ahí.

## Cambios de rondas anteriores (2026-10-06 — 100ª entrega)

### 100ª entrega — Cobranza: correcciones de texto en "Finanzas generales" (sin cambios de cálculo)
Pedido de Federico:

> Solo corrige ahora textos en la página de Finanzas generales.
> -Quita: "Al 06/10/2026. Mismo formato que la hoja "Finanzas" que Federico armó para llevar el control —
> calculado siempre sobre los pagos y depósitos ya confirmados desde "Registrar pagos y depósitos" y los
> montos que ya calcula Estadísticas por jugador y torneo."
> -Agrega la fecha a la cual realizaste el cálculo en el título: "Finanzas Generales (al dd/mm/yyyy)" - Quita
> "Otoño 2026" porque viene arriba en el combo.
> -Quita: "Presupuesto configurado en el Tablero de Control (Tesorero y Hosting son fijos, la Pulsera puede
> variar), no lo efectivamente depositado — se toma inicialmente de las inscripciones.
> "Acum. Campeonato" es el monto ya RESERVADO por lugar (Provisión del 15% repartida según los % del Tablero
> de Control), no un pago confirmado — todavía no hay ninguna forma de registrar desde "Registrar pagos y
> depósitos" el pago real de este premio (de fin de campeonato). Si quieres llevar esto en el sitio, lo
> podemos agregar como un motivo de Depósito nuevo en una próxima entrega.
> "Existente en la cuenta de banco" es el dinero real que ya entró y salió (Subtotal ingresos − Subtotal
> egresos). "Diff" lo valida: le resta lo que todavía hay que reservar para el acumulado y los gastos
> operativos presupuestados que todavía están pendientes de pagar."
> -"Acum. Campeonato (al momento)" cambialo por "Reserva para el Campeonato"
> -Cambia "Ingresos - Egresos" por "Pasivo"; cambia "Reservar" por "Reservado" y "Diff" por "Remanente real"

**Alcance — pedido explícitamente limitado a texto, sin tocar ningún cálculo.** Federico encabezó el pedido
con "Solo corrige ahora textos" — los cuatro puntos son, todos, cambios de rótulo o de contenido explicativo
en el JSX de la sección `vista === "finanzas"` (`Cobranza.jsx`); ninguna variable, cálculo o store de Blobs
se tocó.

**1. Título — se quitó la leyenda/subtítulo vieja y se reformuló con la fecha del cálculo.** Se eliminó el
`<div className="section-sub">` completo ("Al {fechaHoyStr}. Mismo formato que la hoja 'Finanzas'...") que
vivía debajo del título. El propio título (`<div className="section-title">`) pasó de "Finanzas generales —
{campeonatoSel}" a "Finanzas Generales (al {fechaHoyStr})" — se usa la misma variable `fechaHoyStr` que ya
calculaba la pantalla (la fecha de hoy, formato `dd/mm/yyyy`) para armar la leyenda vieja, ahora dentro del
título. `campeonatoSel` (el nombre del campeonato activo, lo que mostraba "Otoño 2026" en el título viejo) se
quitó del título porque, como señaló Federico, ya se ve arriba en el combo de campeonato de la pantalla — la
variable en sí sigue viva y en uso en el resto del archivo, solo se quitó de este título puntual.

**2. "Acum. Campeonato (al momento)" renombrado a "Reserva para el Campeonato".** Cambio de rótulo puro en el
`<FilaSeccionFin label="..." />` de esa sección — el sub-renglón "Total reservado" y las filas por lugar
debajo no se tocaron (Federico no los mencionó).

**3. Bloque de validación ("Pasivo") — se quitaron tres párrafos explicativos y se renombraron cuatro
etiquetas.** Se eliminaron los tres `<div className="section-sub">` que explicaban, en prosa, de dónde salía
cada cifra de esta sección (el presupuesto del Tablero, qué es "Acum. Campeonato", y cómo se valida la cuenta
de banco) — el contenido de esos párrafos sigue siendo cierto (no cambió ningún cálculo), Federico solo pidió
que ya no se mostrara como texto en pantalla. Se renombraron cuatro rótulos dentro de la misma tabla:
"Ingresos − Egresos" (el encabezado de sección) → "Pasivo"; "Reservar" → "Reservado"; "Diff" → "Remanente
real". La cuarta fila de esta tabla ("Existente en la cuenta de banco") y la quinta ("Gastos pendientes") no
se tocaron — Federico no pidió renombrarlas.

**4. Nada más de la pantalla se tocó.** La nota del lado izquierdo ("El 15%/85% se calcula solo sobre pagos
de torneos...", bajo la primera `TablaFin`) y el resto de las secciones (Ingresos, Egresos, Gastos
operativos) quedaron exactamente igual — Federico no las mencionó en este pedido.

**Interpretación deliberada:** ninguna — los cuatro puntos del pedido eran instrucciones de texto
específicas y literales (qué quitar, qué título poner, qué renombrar), sin espacio para una lectura
alternativa.

**Verificación hecha:** se usó el compilador de TypeScript disponible en el entorno (`tsc --noEmit --allowJs
--checkJs false --jsx react-jsx --target esnext --module esnext --noResolve --skipLibCheck`) sobre
`Cobranza.jsx` — sin errores. Conteo de llaves/paréntesis/corchetes balanceado (0/0 de diferencia entre
apertura y cierre de los tres símbolos). Se leyó de nuevo, con `sed`, el bloque final renderizado de
"Finanzas generales" para confirmar visualmente que el título, las dos etiquetas renombradas de "Reserva
para el Campeonato"/"Pasivo" y las tres restantes ("Reservado"/"Remanente real", más "Existente en la cuenta
de banco" y "Gastos pendientes" sin cambios) quedaron exactamente como se pidió, y que los tres párrafos
explicativos y la leyenda vieja ya no aparecen en ningún lado del archivo. **No se pudo** correr `vite build`
completo, ni ver la pantalla renderizada en un navegador real (mismas limitaciones de siempre: sin acceso a
`npm`/red ni a las credenciales reales desde este entorno) — vale la pena que Federico, después de desplegar
esta entrega, confirme que el título muestra la fecha correcta, que ya no aparece ningún párrafo explicativo
en "Finanzas generales", y que las etiquetas nuevas ("Reserva para el Campeonato", "Pasivo", "Reservado",
"Remanente real") se ven donde correspondía la etiqueta vieja.

## Cambios de rondas anteriores (2026-10-06 — 99ª entrega)

### 99ª entrega — Cobranza: botón "Enviar por correo" en "Estado de cuenta"; Resultados: corrección del recuadro de las columnas Main en "Clasificación general" (un solo marco exterior, no un recuadro por celda)
Pedido de Federico (dos puntos en el mismo mensaje):

> Agrega un botón para poder enviar el estado de cuenta por correo al jugador seleccionado.
>
> Cuando dije que pusieras en toda las columnas de Main un recuadro, me refería solo al recuadro externo.

**1. Botón "✉ Enviar por correo" en "Estado de cuenta".** Aparece junto al título de la sección, solo
cuando hay un jugador elegido en el combo de abajo. Al hacer clic, abre un modal con un borrador de
asunto/cuerpo ya armado a partir de la propia tabla de saldo corrido (`estadoCuentaJugador`, de la 79ª
entrega) — una línea por movimiento (fecha, tipo, motivo, monto y saldo, todo desde la perspectiva del
jugador, mismo criterio de signo de la 81ª entrega) y un párrafo final con el saldo actual. El Tesorero
puede editar libremente el asunto y el cuerpo antes de mandarlo — el servidor nunca decide ni redacta el
contenido por su cuenta, solo envía lo que ya fue aprobado en pantalla.

**2. Se reutilizó un endpoint que ya existía en el servidor, pero que ningún botón llamaba todavía.**
Al buscar cómo encajar esta funcionalidad con el patrón ya establecido de correos de Cobranza (`API_ENVIAR_SALDO`/
`cobranza-enviar-saldo.js`, 74ª entrega; `API_ENVIAR_DATOSCUENTA`/`cobranza-enviar-datoscuenta.js`, 89ª
entrega), se encontró que `netlify/functions/cobranza-enviar-estado.js` y `plantillaEstadoCuenta()` (en
`lib/resend.js`) ya existían en el repo — diseñados, por su propio comentario interno, exactamente para este
caso ("el Tesorero ya vio y editó el borrador en pantalla (asunto + cuerpo) — este endpoint solo envía lo
que ya fue aprobado en la UI, nunca genera ni decide el contenido por su cuenta"). Un `grep` confirmó que
ninguna pantalla los llamaba — quedaron de una entrega anterior sin ningún botón que los disparara. En vez
de construir un endpoint nuevo desde cero, se conectó este: `API_ENVIAR_ESTADO = "/api/cobranza-enviar-estado"`
en `Cobranza.jsx`, con el mismo `fetch` POST (`correo`, `asunto`, `cuerpo`) que el endpoint ya esperaba.

**3. Frontend — nuevo estado `enviarEstadoModal` y dos funciones, `abrirEnviarEstado()`/`enviarEstadoCuenta()`.**
`abrirEnviarEstado()` arma el texto del borrador (una línea por movimiento con `moneyContable()`, el mismo
formato con paréntesis para negativos que ya usa el resto del sitio) y abre el modal; `enviarEstadoCuenta()`
valida que asunto/cuerpo no queden vacíos y hace el POST, mostrando un aviso de éxito (`avisoEnviarEstado`)
o el error del servidor (`errorEnviarEstado`) — mismo patrón de `guardando`/`error` que ya usa el modal de
"Aprobar excepción" en este mismo archivo. El modal reutiliza las clases CSS ya existentes
(`modal-backdrop`/`modal-card modal-card-wide`/`modal-title`/`modal-actions`/`login-field`/`login-error`) sin
agregar ningún estilo nuevo.

**4. Corrección del recuadro de Main en "Clasificación general" — un solo marco exterior por columna, no un
recuadro por celda.** La 98ª entrega interpretó "pon todas esas columnas con un recuadro alrededor" como un
borde grueso (`2px solid #b8860b`) en CADA celda de una columna Main (encabezado y cada fila del cuerpo) —
Federico aclaró que se refería solo al marco EXTERIOR de la columna completa (como una sola caja, de arriba
a abajo), no una grilla de cajitas individuales. Fix: la celda del encabezado (`<th>`) de una columna Main
sigue con su borde uniforme de 4 lados gruesos (`border: "2px solid #b8860b"`, sin cambios) — ese grosor en
el borde inferior del encabezado es, a propósito, la "tapa" superior del marco. Cada celda del CUERPO
(`<td>`) de esa columna pasó de un `border` uniforme a cuatro propiedades por lado:
`borderLeft`/`borderRight` gruesos en TODAS las filas (cierran los costados del marco de punta a punta),
`borderTop` fino de siempre (`1px solid #eee`, salvo en la primera fila, donde el borde inferior grueso del
encabezado "gana" sobre este fino al colapsar por `borderCollapse`, dando el efecto de una tapa continua) y
`borderBottom` fino salvo en la ÚLTIMA fila de la tabla (`i === filasClasifOrdenadas.length - 1`), donde se
pone grueso para cerrar el marco por abajo. El resultado visual es un solo rectángulo dorado por columna
Main, de arriba a abajo, en vez de una cajita separada por celda — sin tocar el color/negrita de los números
del cuerpo (sin cambios desde la 98ª entrega) ni ningún otro aspecto de la tabla.

**Interpretación deliberada:** ninguna para el punto 1-3 — el pedido fue explícito y el endpoint/plantilla ya
existentes en el servidor encajaban exactamente con lo pedido (un borrador editable antes de enviar), así
que no hizo falta decidir un diseño alternativo. Para el punto 4, la corrección es literal al mensaje de
Federico ("me refería solo al recuadro externo") — se aprovechó el mismo truco de `border-collapse` (el
borde más ancho de dos celdas que comparten un borde "gana") que ya se documentó como técnica en esta misma
área de código, en vez de agregar una clase CSS nueva o un `<div>` posicionado aparte sobre la tabla.

**Verificación hecha:** se usó el compilador de TypeScript disponible en el entorno (`tsc --noEmit --allowJs
--checkJs false --jsx react-jsx --target esnext --module esnext --noResolve --skipLibCheck`) sobre
`Cobranza.jsx` — sin errores. Conteo de llaves/paréntesis/corchetes balanceado en `Cobranza.jsx`
(confirmado en 0/0 de diferencia entre apertura y cierre de los tres símbolos). Se confirmó con `grep` que
`enviarEstadoModal`/`enviandoEstado`/`errorEnviarEstado`/`avisoEnviarEstado`/`API_ENVIAR_ESTADO`/
`abrirEnviarEstado`/`enviarEstadoCuenta` se usan de forma consistente entre su declaración y cada punto donde
se leen/llaman, y que el cambio de borde en `Estadisticas.jsx` (`esMainCol`, las cuatro propiedades
`border*` nuevas) quedó aplicado dentro del `<td>` de `columnasClasif.map()`, sin afectar la rama `else` de
las columnas Regular (sigue con su `border` uniforme de siempre). **No se pudo** correr `vite build`
completo, probar en vivo el envío real del correo contra Resend, ni ver ninguna de las dos pantallas
renderizadas (mismas limitaciones de siempre: sin acceso a `npm`/red ni a las credenciales reales desde este
entorno) — vale la pena que Federico, después de desplegar esta entrega, confirme que el botón "Enviar por
correo" aparece en "Estado de cuenta", que el borrador se ve razonable y que el correo llega bien con el
formato esperado, y que las columnas Main de "Clasificación general" ahora se ven como un solo marco por
columna en vez de una cajita por celda.

## Cambios de rondas anteriores (2026-10-06 — 98ª entrega)

### 98ª entrega — Cobranza: "Finanzas generales" de recuadros a hoja de trabajo/cuadrícula; Resultados: Kills solo editable por Administrador General, y estilo de podio + recuadro Main en "Clasificación general"; menú: "Jugadores" junto a "Resultados"
Pedido de Federico (cuatro puntos en el mismo mensaje):

> No me gusta la vista con recuadros en las finanzas generales. Es dificil de leer y seguir.
> Quiero que tenga una vista como hoja de trabajo, puede ser tipo tabla o con cuadrícula como excel.
> Proponme algo en este sentido.
>
> Le edición de killers solo la puede modificar el administrador general
>
> Muéveme el botón de Jugadores a la derecha de Resultados en la parte superior de la pantalla.
>
> Me gusta mucho la tabla de Clasificación General. Así como tienes el número de torneo Main de otro color
> en el encabezado de ducha columna, pon del mismo color los números hacia abajo. Es más, pon todas esas
> columnas con un recuadro alrededor para que se vean que son los torneos especiales.
> Los renglones de 1°, 2° y 3° lugar también hazlos visiblemente distintos (como oro, plata y bronce por
> ejemplo).

**1. "Finanzas generales" — de recuadros (`.stats`/`.stat`) a una tabla real, cuadriculada, estilo Excel.**
Federico pidió explícitamente una propuesta ("Proponme algo en este sentido"), pero su propio pedido ya
venía con la especificación concreta ("tipo tabla o con cuadrícula como excel"), así que se implementó
directo en vez de mostrar una maqueta aparte. Se agregaron tres componentes nuevos (`TablaFin`,
`FilaSeccionFin`, `FilaFin`) que reemplazan los `.stats`/`.stat` de la 97ª entrega: cada columna de
"Finanzas generales" (Ingresos/Egresos a la izquierda, Gastos operativos/Acum. Campeonato/Validación a la
derecha) pasó a ser una sola tabla de dos columnas (Concepto | Monto), con filas de sección en gris y
mayúsculas, filas normales, filas con sangría para el detalle de un desglose, y filas de subtotal/total en
negrita con fondo tenue. El contenido y los cálculos **no cambiaron en absoluto** — solo el contenedor
visual pasó de tarjetas a filas de una hoja de cálculo.

**2. Edición de Kills — ahora exclusiva de "Administrador General", ya no de "Administrador" también.**
Desde la 97ª entrega, el botón "✎"/el input de corrección de Kills usaba el mismo helper `esAdmin(rol)`
("Administrador General" O "Administrador") que ya restringe "Subir resultados"/"Exportar a Excel" en esta
pantalla — Federico pidió ahora, explícitamente, que la edición de Kills en particular quede reservada SOLO
al "Administrador General". Se agregó un helper nuevo, `esAdminGeneral(rol)` (`rol === "Administrador
General"`, sin el OR de "Administrador"), usado únicamente en el gate de la celda de Kills.

**3. Menú superior — "Jugadores" movido a la derecha de "Resultados".** Se movió la entrada `{ key:
"jugadores", ... }` del array `TABS` (`App.jsx`) a inmediatamente después de `{ key: "estadisticas", ...,
label: "Resultados", ... }`.

**4. "Clasificación general" — color de las columnas Main hacia abajo, recuadro por columna especial, y
podio oro/plata/bronce en 1°/2°/3° lugar.** Tres ajustes de estilo puro, sin tocar ningún cálculo: color de
los números del cuerpo de una columna Main (no solo el encabezado); recuadro por columna (interpretado como
marco por columna individual, **corregido en la 99ª entrega** a solo el marco exterior); podio oro/plata/
bronce por posición en la tabla ya ordenada (`PODIO_CLASIF`).

**Interpretación deliberada — resumen de las decisiones que van más allá del pedido literal:** (i)
implementar directo el rediseño de Finanzas en vez de mostrar una maqueta aparte antes; (ii) interpretar el
"recuadro alrededor" de las columnas Main como un marco por columna individual, no un único rectángulo que
abarque a todas — **corregido en la 99ª entrega, Federico aclaró que pedía solo el marco exterior**; (iii)
usar colores de podio distintos al dorado ya usado para "torneo Main".

**Verificación hecha:** se usó el compilador de TypeScript disponible en el entorno sobre `Cobranza.jsx`,
`Estadisticas.jsx` y `App.jsx` juntos — sin errores. Conteo de llaves/paréntesis/corchetes balanceado en los
tres archivos y en `global.css`. **Feedback real recibido al pasar a la 99ª entrega** — Federico confirmó el
resto, pero pidió corregir el recuadro de las columnas Main para que fuera solo el marco exterior (ver la
99ª entrega arriba).

## Cambios de rondas anteriores (2026-10-06 — 97ª entrega)

### 97ª entrega — Cobranza: "Finanzas generales" rediseñada de nuevo para calzar con el Excel de Federico; Resultados: el administrador general puede corregir a mano el total de Kills de un jugador en un torneo ya publicado
**Parte A — pedido de Federico (con el Excel adjunto, solo hoja "Finanzas"):** rediseño de "Finanzas
generales" para calzar con el layout exacto del Excel de Federico (dos columnas, INGRESOS/EGRESOS a la
izquierda y PASIVOS a la derecha), con siete preguntas de aclaración respondidas por Federico sobre el 15%/
85%, el presupuesto de gastos operativos, el acumulado de campeonato, y la validación de cuenta de banco —
ver el detalle completo en el historial de esta conversación.

**Parte B — pedido de Federico (mismo mensaje, al final):**

> Una cosa más.
> En la pantalla Resultados, una vez publicado los resultados de los torneos, llegan a haber quejas de los
> jugadores sobre los killers, así es que permite que el administrador general pueda modificar el número de
> killers por cada uno (sin pasarse) del total de jugadores - 1.

**10. Diseño elegido (97ª entrega) — una corrección manual por alias, que PISA el tally calculado, en vez de
reasignar eliminaciones una por una.** Se agregó un mapa nuevo, `killsManual` (alias → número), guardado
dentro de cada torneo en `tols-estadisticas` — cuando un alias tenía entrada ahí, ese valor pisaba el tally
calculado. **Este diseño completo (`killsManual`, la acción `"editarKills"`, y el botón "✎" por fila) quedó
reemplazado en la 101ª entrega** por una asignación killer→killed (`killsAsignados`) — ver esa entrega al
principio de este documento para el diseño actual.

**11. Backend — acción `"editarKills"` en `/api/estadisticas` (PUT), ya reemplazada.** Ver la 101ª entrega.

**12. Frontend — un botón "✎" junto al número de Kills de cada fila, ya eliminado.** Ver la 101ª entrega.

**Interpretación deliberada — resumen (97ª entrega):** (i) corregir el "Subtotal ingresos" para que sume
también los pagos de torneos main; (ii) calcular "Acum. Campeonato (al momento)" como el monto ya RESERVADO
por lugar; (iii) usar `esAdmin(rol)` en vez de restringir la edición de Kills solo a "Administrador General"
en sentido estricto — **revertido en la 98ª entrega**; (iv) seguir señalando la brecha real de que el premio
de acumulado todavía no tiene forma de confirmarse como pagado.

**Verificación hecha:** se usó el compilador de TypeScript disponible en el entorno sobre `Cobranza.jsx`,
`Estadisticas.jsx` y `estadisticas.js` juntos — sin errores. Conteo de llaves/paréntesis/corchetes balanceado
en los tres archivos y en `global.css`. **Build roto por un bug propio al entregarse — ver el detalle en la
nota de la propia 97ª entrega en el historial de esta conversación: `centavosAcumulados` quedó declarado dos
veces en `Cobranza.jsx`, corregido y re-entregado el mismo día.**

## Cambios de rondas anteriores (2026-10-06 — 96ª entrega)

### 96ª entrega — Cobranza: rediseño completo de "Finanzas generales" sobre datos reales (ya no sobre el modelo viejo de `movimientos`)
Pedido de Federico: quitar los cuadros viejos (Recaudado cobrado/pendiente, Premios pagados), reemplazar la
primera línea por los tres grandes totales (Ingresos confirmados, Egresos confirmados, Balance de Cobranza),
agregar "Otros ingresos" (Inscripciones, Separado para el acumulado, Centavos acumulados), "Gastos
operativos" (dinámico desde el Tablero) y "Finanzas por categoría" (a-d: pagos por torneo, premios regulares
por lugar, premios Main, premios de acumulado). Se eliminó `finanzasCampeonato()` (modelo viejo de
`movimientos`, siempre en $0 en producción porque Game Night nunca se usó) y se reconstruyó todo sobre los
cuatro mapas reales de Cobranza (`pagosTorneo`, `depositosTorneo`, `depositosGasto`, `pagosInscripcion`) y
los campos calculados por Estadísticas. La categoría (d) (premios de acumulado) se mostró siempre en $0 con
nota explicativa — brecha real, sin motivo de Depósito para ese pago. **Nota: toda esta pantalla se
reorganizó visualmente en la 98ª entrega (recuadros → tabla cuadriculada) y recibió correcciones de texto en
la 100ª — ver ambas más arriba.**

**Verificación hecha:** `tsc`/`node --check`/balance de llaves limpios en `Cobranza.jsx` y `cobranza.js`
(834/834 `()`, 115/115 `[]`, 635/635 `{}` en Cobranza.jsx; 77/77 `()`, 15/15 `[]`, 25/25 `{}` en
cobranza.js). Sin acceso a `npm`/red ni a Blobs de producción desde este entorno.

## Cambios de rondas anteriores (2026-10-06 — 95ª entrega)

### 95ª entrega — Usuarios: leyendas de encabezado/sección actualizadas, eliminación del perfil "Host" en Permisos por módulo; Cobranza: se reactivó "Finanzas generales"
Se quitó la leyenda vieja del encabezado de Usuarios y se agregó una nueva dentro de la sección "Usuarios".
Se eliminó el perfil "Host" de `perfiles.json` y se agregó un filtro explícito en `normalizar()`
(`perfiles.js`) que lo quita también de lo ya persistido en Blobs, reasignando a "Jugador" cualquier usuario
que hubiera quedado con ese rol — lección: una semilla actualizada nunca limpia por sí sola lo ya guardado.
Se reactivó "Finanzas generales" (inhabilitada desde la 82ª), quitando el flag `inhabilitado` y el `{false
&& ...}` que envolvía el contenido real. **Nota: ese bloque se reemplazó por el rediseño de la 96ª entrega.**

**Verificación hecha:** `node --check`/`tsc`/balance de llaves limpios en `Perfiles.jsx`, `Cobranza.jsx` y
`perfiles.js` (189/189 `()`, 30/30 `[]`, 155/155 `{}` en Perfiles.jsx; 754/754 `()`, 96/96 `[]`, 574/574 `{}`
en Cobranza.jsx).

## Cambios de rondas anteriores (2026-10-04 — 94ª entrega)

### 94ª entrega — Cobranza: en `Cobranza_Confirmados`, los Depósitos se escriben en negativo (solo en esa hoja de Excel); y se le aclaró a Federico dónde se lleva el resguardo de los "centavos" de referencia
Los Depósitos se escriben en negativo únicamente en la hoja `Cobranza_Confirmados` del Excel (presentación
pura, a pedido explícito de Federico) — Blobs y el resto de la pantalla siguen con los montos siempre
positivos, sin ningún cambio. El resguardo de los "centavos" de referencia es el tile "Centavos acumulados"
(78ª entrega) — un valor derivado en vivo en `Cobranza.jsx`, nunca persistido aparte en Blobs ni en Excel.

**Verificación hecha:** `node --check`/`tsc`/balance de llaves limpios en `cobranza.js` (417/417 `()`, 78/78
`[]`, 219/219 `{}`). **Confirmado implícitamente al pasar a la 95ª entrega.**

## Cambios de rondas anteriores (2026-10-04 — 93ª entrega)

### 93ª entrega — Cobranza: el sitio deja de escribir en `Cobranza`/`Cobranza_Resumen` por completo, a pedido de Federico
Tras diagnosticar que un error de "Exportar todo a Excel" era solo el Excel maestro abierto por Federico
(Graph API 409 `EditModeCannotAcquireLock`, no un bug), Federico preguntó por hojas vacías del Excel. Se le
explicó cuáles se auto-crean (seguras de borrar) y cuáles asume el código que ya existen. Confirmó con "si"
que el sitio dejara de escribir en `Cobranza`/`Cobranza_Resumen` (espejo del modelo viejo de `movimientos`,
nunca poblado en producción) — `nucleoSyncCobranza()` y `filasParaExcel()` se simplificaron para ya no
armar/escribir esas dos hojas, solo `Cobranza_Confirmados`.

**Verificación hecha:** `node --check`/`tsc`/balance de llaves limpios en `msgraph.js` y `cobranza.js`
(503/503 `()`, 129/129 `[]`, 181/181 `{}` en msgraph.js; 411/411 `()`, 78/78 `[]`, 219/219 `{}` en
cobranza.js).

## Cambios de rondas anteriores (2026-10-04 — 92ª entrega)

### 92ª entrega — Cobranza: diagnóstico y fix de la brecha histórica en el Excel de "Pagos y depósitos confirmados" (nunca tuvo hoja propia); copia del Excel real convertida a .xls
Federico mandó un Excel real y preguntó por qué no coincidía con el portal. Los resultados de torneos SÍ
estaban en `Estadisticas_Resultados` (solo mezclados con filas de práctica, no agrupados). "Pagos y
depósitos confirmados" nunca tuvo espejo en Excel desde que ese dato existe (76ª entrega) — brecha real y
antigua. Fix: hoja nueva `Cobranza_Confirmados`, auto-creada, armada por `filasConfirmados()` (nueva, en
`cobranza.js`) recorriendo los cuatro mapas de TODOS los campeonatos. Se convirtió el Excel real de Federico
a `.xls` con LibreOffice (round-trip verificado, 24 hojas conservadas) — esa copia refleja el archivo ANTES
de este fix, sin la hoja nueva todavía.

**Verificación hecha:** `openpyxl` para inspeccionar el archivo real; `grep` para confirmar que los cuatro
mapas no aparecían antes en `msgraph.js`; `node --check`/balance de paréntesis limpios (509/509 `()`, 129/129
`[]` en msgraph.js; 424/424 `()`, 81/81 `[]` en cobranza.js).

## Cambios de rondas anteriores (2026-10-03 — 91ª entrega)

### 91ª entrega — bugfix: el avance/resultado de "Exportar todo a Excel" se perdía al volver a Tablero de Control; y se agregó el archivo/ruta real de destino con fecha y hora
El sondeo de montaje de `Tablero.jsx` solo cubría el caso "en-curso"; se extendió para también restaurar
"listo"/"error" desde `tols-exportar-estado` al entrar a la pantalla. Se confirmó que el export siempre
escribió al mismo "archivo base" de OneDrive de siempre (`EXCEL_PATH` en `msgraph.js`) — se agregó
`obtenerInfoExcel()` (archivo/carpeta/ruta siempre disponibles, `webUrl` best-effort vía Graph) mostrado en
el reporte final junto a la hora de término (`fechaHoraFmt()`).

**Verificación hecha:** `tsc`/`node --check`/balance de llaves limpios en `Tablero.jsx`, `msgraph.js` y
`exportar-excel-background.js` (181/181 `{}`, 502/502 `()`, 127/127 `[]` en msgraph.js; 700/700 `{}`, 910/910
`()`, 118/118 `[]` en Tablero.jsx).

## Cambios de rondas anteriores (2026-10-03 — 90ª entrega)

### 90ª entrega — Resultados: "Por resultado" solo para administradores/Tesorero; Tablero de Control: avance en vivo de "Exportar todo a Excel" (y bugfix de fondo: no se veía ni el avance ni el resultado final)
"Por resultado" (dinero) oculto para el rol jugador, vía `puedeVerPorResultado(rol)`. Se diagnosticó y
corrigió un bug de fondo en `consultarEstadoExport()`: el `return` del caso "en-curso" vivía dentro del
`try`, así que el `finally` apagaba `exportando`/`confirmExport` en cada vuelta del sondeo (cada 3s), dando
la falsa impresión de que nada corría. Fix + avance en vivo módulo por módulo (`progresoExport`, separado de
`reporteExport`).

**Verificación hecha:** `tsc`/`node --check`/balance de llaves limpios en `Tablero.jsx` y `Estadisticas.jsx`
(683/683 `{}`, 887/887 `()`, 118/118 `[]` en Tablero.jsx; 612/612 `{}`, 831/831 `()`, 181/181 `[]` en
Estadisticas.jsx). **Confirmado parcialmente al pasar a la 91ª entrega** — los dos bugs relacionados
reportados ahí los corrige la 91ª (ver arriba).

## Cambios de rondas anteriores (2026-10-03 — 89ª entrega)

### 89ª entrega — Cobranza: datos de cuenta + correo al armar un Depósito, "Torneo N" homologado sin fecha, columna Balance, y ancho de columnas para negativos; Calendario: se quitó "Ganancias acumuladas"
Al elegir Depósito + jugador en "Registrar pagos y depósitos" se muestran sus datos de cuenta de cobro, con
botón "Solicitar datos por correo" si faltan (endpoint nuevo `cobranza-enviar-datoscuenta.js`). "Torneo N"
homologado sin fecha en Pago y Depósito (antes solo Pago, desde la 79ª). Columna "Balance" nueva en los
totales de "Pagos y depósitos confirmados". Ancho de columnas ajustado y `white-space: nowrap` para que los
montos negativos no se corten. Se quitó el recuadro "Ganancias Acumuladas" de Calendario.

**Verificación hecha:** `tsc`/`node --check`/balance de llaves limpios en `Cobranza.jsx` y `Calendario.jsx`
(575/575 `{}`, 755/755 `()`, 96/96 `[]` en Cobranza.jsx; 297/297 `{}`, 561/561 `()`, 69/69 `[]` en
Calendario.jsx).

## Cambios de rondas anteriores (2026-10-01 — 88ª entrega)

### 88ª entrega — Cobranza: motivo nuevo de PAGO — Cuota de inscripción (Tablero de Control), en "Registrar pagos y depósitos"
Nuevo motivo "Inscripción" en el combo de Pago, solo si el Tablero tiene cuota configurada y el jugador
todavía no la confirmó ese campeonato. Cuarto mapa nuevo `pagosInscripcion` en `tols-cobranza`
(`"{campeonato}|inscripcion|{correo}"`), `registrarPago` generalizada con `motivoTipo`/`motivoId` sin romper
el comportamiento ya existente para torneos.

**Verificación hecha:** `tsc`/`node --check`/balance de llaves limpios en `Cobranza.jsx` y `cobranza.js`
(536/536 `{}`, 723/723 `()`, 94/94 `[]` en Cobranza.jsx; 201/201 `{}`, 376/376 `()`, 62/62 `[]` en
cobranza.js).

## Cambios de rondas anteriores (2026-10-01 — 87ª entrega)

### 87ª entrega — hotfix crítico: el sitio se quedaba en pantalla verde (en blanco) para TODOS los usuarios al iniciar sesión, por un bug introducido por Claude en la 85ª entrega
Un `useEffect` nuevo de la 85ª entrega quedó ubicado DESPUÉS de dos `return` condicionales tempranos de
`Tablero.jsx`, violando las Reglas de los Hooks de React — tumbaba el sitio ENTERO (sin Error Boundary) para
cualquier usuario al iniciar sesión. Fix: se reubicó ese `useEffect` junto a los demás hooks, antes de los
`return` tempranos. Ver la lección crítica agregada arriba sobre este patrón.

**Verificación hecha:** `grep` confirmó el orden correcto de los tres `useEffect` vs. los dos `return`
tempranos; `tsc` limpio sobre `Tablero.jsx` (652/652 `{}`, 842/842 `()`) — un `tsc` limpio nunca iba a
detectar este bug en particular (error de orden de ejecución, no de tipos).

## Cambios de rondas anteriores (2026-10-01 — 86ª entrega)

### 86ª entrega — bugfix de fondo: "Excel Referencias" ya no reconoce columnas por palabra clave — siempre muestra las columnas reales y pide confirmar el mapeo a mano
Se abandonó por completo el reconocimiento por palabra clave fija (que había fallado tres rondas seguidas).
Nuevo flujo: `adivinarColumnasApodos(header)` solo propone una selección inicial editable;
`construirApodosDesdeMapeo()` arma la tabla a partir de los índices que el administrador confirme. Paso
nuevo "Mapear columnas" muestra siempre encabezado real + ejemplo de cada columna antes de construir nada.

**Verificación hecha:** `tsc` limpio sobre `Estadisticas.jsx` (610/610 `{}`, 817/817 `()`, 178/178 `[]`).

## Cambios de rondas anteriores (2026-10-01 — 85ª entrega)

### 85ª entrega — bugfix de fondo: "Exportar todo a Excel" ahora corre en segundo plano, y se agrega copia de respaldo previa
El timeout de Netlify (función síncrona) causaba el error "Unexpected token '<'" (HTML de gateway timeout en
vez de JSON). Fix: función nueva `exportar-excel-background.js` (`background: true`, Netlify Functions v2),
estado en `tols-exportar-estado`, sondeo cada 3s desde `Tablero.jsx`. Cache del token de Graph API dentro de
una invocación. Copia de respaldo previa (`respaldarExcelActual()`, nombre `"aaaa-mm-dd
TOLS3.0-Base-de-Datos_bkp.xlsx"`, `conflictBehavior: "rename"`) — si falla, la exportación real continúa
igual.

**Verificación hecha:** `tsc`/`node --check`/balance de llaves limpios en los cuatro archivos tocados.
**Confirmado parcialmente al pasar a la 86ª entrega.**

## Cambios de rondas anteriores (2026-10-01 — 84ª entrega)

### 84ª entrega — bug: "Excel Referencias" (Estadísticas) no mostraba nada al fallar, y no reconocía el formato nuevo del archivo
Se repitió el aviso de error justo debajo del botón "Excel Referencias" (antes solo aparecía arriba de todo,
fuera de vista). Se amplió el reconocimiento de columnas a "referencia"/"chat"/"apodo" — **este enfoque
completo quedó abandonado en la 86ª entrega**, reemplazado por confirmación manual de columnas.

## Cambios de rondas anteriores (2026-10-01 — 83ª entrega)

### 83ª entrega — nuevo botón "Exportar todo a Excel" en Tablero de Control: regenera el archivo completo a demanda desde Blobs
Botón nuevo en Tablero de Control, sección "Excel", que regenera las 10 hojas del Excel completo desde
Blobs, con reporte módulo por módulo (a diferencia de la sincronización automática silenciosa, que nunca
avisa errores). Cada `syncX` se partió en un núcleo sin envolver (`nucleoSyncX`, exportado) y el `syncX` de
siempre (que solo envuelve ese núcleo en `safe()`) — sin cambiar ningún llamador existente. Nuevo módulo
`lib/exportar-excel.js` (`exportarTodoDesdeBlobs()`), acción nueva `exportarExcel` en `/api/tablero` (PUT).
**Corregido en la 85ª entrega (corría síncrono, agotaba el tiempo).**

## Cambios de rondas anteriores (2026-09-30 — 82ª entrega)

### 82ª entrega — Cobranza: botón "Finanzas generales" inhabilitado temporalmente; Estadísticas: botones de "Subir resultados" renombrados, eliminado "Apodos de chat", y "Excel Referencias" ahora siempre reemplaza
"Finanzas generales" inhabilitado (no eliminado, código intacto bajo `{false && ...}`) — **reactivado en la
95ª entrega**. Botones de "Subir resultados" renombrados ("Excel PokerStars", "Txt WhatsApp", "Excel
Referencias"). Se eliminó el botón "✎ Apodos de chat". "Excel Referencias" pasó de fusionar (nunca borrar)
a siempre reemplazar lo guardado.

## Cambios de rondas anteriores (2026-09-30 — 81ª entrega)

### 81ª entrega — Cobranza: perspectiva de color por reporte, totales agrupables en "Pagos y depósitos confirmados", inputs de monto sin flechitas/con decimales, y eliminación definitiva del "Historial de movimientos"
"Estado de cuenta" invierte el signo de color (perspectiva del jugador, no de TOLS) — Pago rojo, Depósito
verde. Montos de "Registrar pagos y depósitos" ya no arrancan en "0" fijo, sin flechitas de spin, con
decimales (`step="0.01"`). Totales agrupables por Motivo/Fecha arriba de "Pagos y depósitos confirmados",
columna Jugador con Alias PS, "Tipo" sin óvalo. Se eliminó definitivamente "Historial de movimientos
(Debe/Ganó por torneo)" de "Registrar pagos y depósitos" (ya quitado de "Estado de cuenta" en la 80ª).

## Cambios de rondas anteriores (2026-09-30 — 80ª entrega)

### 80ª entrega — Cobranza: "Estado de cuenta" reducido a una sola tabla cuadriculada, sin stat tiles, sin edición de cuenta/banco y sin el historial viejo
Combo del jugador por Alias PS. Se eliminaron los stat tiles, la edición de cuenta/banco (sigue disponible
desde Mi Perfil/Jugadores) y la tabla "Historial de movimientos" junto con "Redactar estado de cuenta por
correo" (ese endpoint se reconectó después, en la 99ª entrega, desde un lugar distinto). Única tabla
restante: cuadriculada real (`<table>` HTML), columnas centradas, sin badges.

## Cambios de rondas anteriores (2026-09-30 — 79ª entrega)

### 79ª entrega — Cobranza: formato/color en "Pagos y depósitos confirmados", tabla nueva de saldo corrido en "Estado de cuenta", y convención de color verde/rojo para dinero
Motivo de un Pago sin fecha ("Torneo N"). Esperado/Real centrados. Color por TIPO de fila (`MontoPorTipo`):
Pago verde, Depósito rojo con paréntesis. Columna "Real" con centavos (`moneyConCentavos()`) para distinguir
un pago con número de referencia. Tabla nueva de saldo corrido en "Estado de cuenta" (Fecha/Tipo/Motivo/
Saldo inicial/Monto/Saldo final), perspectiva de TOLS en esta entrega (**ajustada a la del jugador en la
81ª**). Convención general `.money-pos`/`.money-neg` (`Monto`/`MontoPorTipo`) aplicada en toda Cobranza.

## Cambios de rondas anteriores (2026-09-30 — 78ª entrega)

### 78ª entrega — Cobranza: "Centavos acumulados", el remanente de referencia de los Pagos confirmados
A pedido/pregunta abierta de Federico sobre qué hacer con los centavos de referencia, se agregó un stat tile
puramente derivado (sin cambios de esquema/backend): suma de `max(0, monto − montoEsperado)` de cada Pago
confirmado del campeonato activo. Decisiones confirmadas por Federico vía `AskUserQuestion`: automático por
Pago, por campeonato, tile aparte (nunca se suma a Saldo neto).

## Cambios de rondas anteriores (2026-09-30 — 77ª entrega)

### 77ª entrega — Cobranza: edición de pagos/depósitos confirmados y eliminación de la hora en el registro nuevo
Botón "✎" en cada fila de "Pagos y depósitos confirmados" para editar Monto real/Fecha, reutilizando
`"registrarPago"`/`"registrarDeposito"` tal cual (idempotentes por llave estable). Se eliminó el campo
"Hora" del formulario de registro nuevo (solo de interfaz, el backend sigue aceptando `hora` si llegara).

## Cambios de rondas anteriores (2026-09-30 — 76ª entrega)

### 76ª entrega — Cobranza: "Registrar pagos y depósitos" rediseñado como confirmación de Pago/Depósito, no como creación de movimientos
Rediseño completo del botón "+ Nuevo movimiento": ya no crea un movimiento manual (Buy-in/Re-buys/Add-on),
ahora confirma un Pago o Depósito real contra un torneo o un gasto del Tablero, con Monto esperado (de
Estadísticas/Tablero) y Monto real editable. Tres mapas nuevos en `tols-cobranza` (`pagosTorneo`,
`depositosTorneo`, `depositosGasto`), acciones nuevas `"registrarPago"`/`"registrarDeposito"`. El modelo
viejo de `movimientos` se conservó como historial (tabla renombrada, eliminada definitivamente en la 80ª/81ª
entregas).

## Cambios de rondas anteriores (2026-09-29 — 75ª entrega)

### 75ª entrega — "Ver como jugador" también disponible para el Tesorero, no solo para Administrador/Administrador General
Nuevo helper `puedeAlternarVistaJugador(rol)` en `App.jsx` (Administrador/Administrador General o
"Tesorero"); `esRealAdmin` renombrado a `puedeAlternarVista`.

## Cambios de rondas anteriores (2026-09-29 — 74ª entrega)

### 74ª entrega — rediseño de "Resultados de Torneos" en Cobranza: correo de "Saldo Torneo" a jugadores con saldo negativo
Combo de torneos publicados, tabla de saldos negativos, selección múltiple y envío de correo "Saldo Torneo"
(`plantillaSaldoTorneo()`, endpoint `cobranza-enviar-saldo.js`), con persistencia de "ya se envió"
(`enviosSaldo` en `tols-cobranza`).

## Cambios de rondas anteriores (2026-09-29 — 73ª entrega)

### 73ª entrega — renombre "Estadísticas" → "Resultados", y cinco ajustes de presentación en "Clasificación general"
Botón renombrado; se quitó la leyenda; la tabla muestra todas las columnas (jugadas o no); encabezados con
solo el número (Main en color distinto); formato de tabla con cuadrícula completa y números centrados;
columna "Lugar" fija 1..n.

## Cambios de rondas anteriores (2026-09-29 — 72ª entrega)

### 72ª entrega — numeración de torneos, resultados reales en el Calendario, "Clasificación general" + "Resultados Torneos" en Estadísticas, y switch "Ver como jugador"
Numeración cronológica compartida (`mapaNumeracionTorneos()` en `src/lib/gamenight.js`); Calendario conectado
a `/api/estadisticas` para Posición/Puntos/Resultado reales; bloque "Clasificación general" en Estadísticas
(por puntos/killers/resultado); "Torneos publicados" renombrado a "Resultados Torneos" con toggle; formato
contable `moneyContable()`; switch "Ver como jugador" en Mi Perfil (`effectiveSession` en `App.jsx`).

## Cambios de rondas anteriores (2026-09-28 — 71ª entrega)

### 71ª entrega — bug: los puntos ya calculados desaparecían al reabrir un torneo publicado en "Estadísticas"
`normalizarJugadorEst()` se usaba tanto para sanear input nuevo como datos ya guardados, borrando
silenciosamente los campos calculados al leer. Fix: función separada `normalizarJugadorEstGuardado()`.

## Cambios de rondas anteriores (2026-09-28 — 70ª entrega)

### 70ª entrega — "Estadísticas" solo con botones (sin auto-abrir), tabla del jugador igual al preview plano, combo de "Subir resultados" con default al siguiente torneo, y puntos configurables por torneo de práctica (Tablero + Excel)
Se quitó el auto-select de torneo; tabla del jugador igual a la tabla plana del preview; combo de "Subir
resultados" preselecciona el siguiente torneo tras el último publicado; puntos de práctica configurables por
fecha (`PUNTOS_PRACTICA_KEY` en `tols-tablero`, hoja Excel `Puntos_Practica`).

## Cambios de rondas anteriores (2026-09-23 — 69ª entrega)

### 69ª entrega — bug crítico de ruteo en `/api/estadisticas` (afectaba TODO el guardado desde la 66ª entrega) + total de kills por jugador con asignación manual de dudosos
`estadisticas.js` nunca tuvo `export const config = { path: "/api/estadisticas" }` — cualquier PUT/GET caía
en el redirect general y devolvía 405. Fix aplicado; Federico tuvo que volver a subir/publicar todo. Columna
"Kills" nueva con asignación manual de killers dudosos vía `<select>` (`logKillersNoResueltos[].asignadoA`
— este campo sigue vigente y aditivo, sin tocar en el rediseño de la 101ª entrega).

## Cambios de rondas anteriores (2026-09-23 — 68ª entrega)

### 68ª entrega — import de referencias que nunca borra, Premio siempre en $, y detalle de killers no resueltos también para el jugador
Botón "📥 Importar Excel de referencias", fusión no-destructiva — **invertida en la 82ª (siempre reemplaza) y
el reconocimiento de columnas reemplazado en la 86ª por mapeo manual**. Columna "Premio" siempre en $.
Resumen de killers no resueltos también visible para el jugador.

## Cambios de rondas anteriores (2026-09-23 — 67ª entrega)

### 67ª entrega — tres ajustes a "Estadísticas": combo del administrador invertido, fila de totales, y Alias PokerStars en vez de nombre
Combo de "Subir resultados" invertido (más antiguo a más reciente); fila de Totales en negrillas; Alias
Pokerstars en vez de nombre en ambas tablas. Desde esta entrega, cada archivo vuelve a llamarse
`TOLS3.0-XXa-entrega.tar.gz` con copia automática en OneDrive.

## Cambios de rondas anteriores (2026-09-23 — 66ª entrega)

### 66ª entrega — se ocultó Game Night (sin borrarlo), se eliminó el concepto de Host por completo, y pantalla nueva "Estadísticas": subir resultados por archivo en vez de seguir el torneo en vivo
Game Night oculto del menú (código intacto); Host eliminado por completo; pantalla nueva "Estadísticas"
(`src/components/Estadisticas.jsx`), con "Subir resultados" (solo administrador) procesando un Excel de
PokerStars + un chat de WhatsApp (`src/lib/killersChat.js`); backend nuevo `netlify/functions/estadisticas.js`,
store `tols-estadisticas`.

## Cambios de rondas anteriores (2026-09-22 — 65ª entrega)

### 65ª entrega — tabla de "Jugadores habilitados" del Host simplificada
Se quitaron Check-in/Amonestación; Buy-in/Add-on como 1/0; Re-buys/Lugar ya no editables; Killer en blanco;
Mejor mano solo en Main Event; columnas reordenadas Puntos/Debe(-)/Premio(+)/Saldo.

## Cambios de rondas anteriores (2026-09-22 — 64ª entrega)

### 64ª entrega — la importación de Excel también fija el Lugar (orden de salida real), no solo Buy-in/Re-buys/Add-on
Confirmado por Federico que el Lugar del archivo es el real — el servidor reconstruye `ordenEliminados` a
partir de los lugares del archivo.

## Cambios de rondas anteriores (2026-09-22 — 63ª entrega)

### 63ª entrega — se quitó el modal "Editar jugadores" (fue mala idea) y se agregó "Importar resultados (Excel)" desde PokerStars
Se quitó el modal de la 62ª entrega; se quitaron las tarjetas "Burbuja"/"Campeón"; nuevo botón "Importar
resultados (Excel)" que lee un Excel de PokerStars (Place/User ID/Rebuys/Addons).
