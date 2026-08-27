# TOLS 3.0

Sitio de la liga de póker en línea Torrente (Torrente On Line Series). React + Vite, pensado para desplegarse en Netlify conectado a este repo (build command `npm run build`, publish directory `dist` — ya configurado en `netlify.toml`).

## Módulos
Los nombres "MOD 1", "MOD 2", etc. son solo referencia interna de trabajo — no aparecen en ninguna pantalla del sitio. Esta pantalla (`App.jsx`) es la **administración de toda la liga**; **Game Night** es una pantalla aparte (pendiente de definir) y no vive en este menú.

El orden fijo de pestañas es: **Tablero de Control, Calendario, Cobranza, Usuarios**. Cobranza todavía no existe como pantalla real, así que no aparece hasta que se construya. **Usuarios** (antes "Jugadores"/"Perfiles") solo la ve y usa el rol **Administrador General** — es un caso especial fuera de la matriz de permisos normal.

- **Tablero de Control** (`src/components/Tablero.jsx`) — editable en vivo, **por campeonato**. Un combo permite elegir el campeonato activo (con un panel para agregar, renombrar o eliminar campeonatos); los premios, puntos y costos que se ven/editan abajo corresponden solo al campeonato seleccionado. Contiene: premios (por torneo y por campeonato, con % de Rey Killer obligatorio), puntos por posición, cuota de inscripción (por jugador, una vez por campeonato), recompras máximas, gastos del campeonato (Tesorero, Pulsera, etc. — se extraen del acumulado y se descuentan del monto a repartir), cobros por torneo (Buy-in, Re-buy y Add-on siempre presentes y no eliminables) y pagos por torneo (Sale en burbuja, Mejor Mano, etc.). Los montos se muestran en formato `$ ###,###`. Los datos viven en **Netlify Blobs** (`tols-tablero`), servidos por `netlify/functions/tablero.js` en `/api/tablero` como un mapa `{ [nombreCampeonato]: datos }`. `src/data/tablero.json` es solo la semilla inicial.
- **Campeonatos** — registro compartido de nombres de campeonato (ej. `2026-I`), administrado desde el propio Tablero de Control y consumido también por el Calendario. Vive en **Netlify Blobs** (`tols-campeonatos`), servido por `netlify/functions/campeonatos.js` en `/api/campeonatos`. `src/data/campeonatos.json` es la semilla inicial.
- **Calendario** (`src/components/Calendario.jsx`), vista mensual (domingo a sábado) con crear/editar/borrar torneo por día. Cada torneo se asocia a un **campeonato**, elegido con un combo que se llena desde el registro de Campeonatos (ya no es texto libre). El día de pago final se muestra directamente en la cuadrícula con una insignia $ y también se puede editar ahí. Los datos viven en **Netlify Blobs** (`tols-calendario`), servidos por `netlify/functions/calendario.js` en `/api/calendario`. `src/data/calendario.json` es solo la semilla inicial.
- **Usuarios** (`src/components/Perfiles.jsx`) — visible y editable solo para Administrador General. Muestra primero la tabla de usuarios (Nombre, Correo electrónico, Perfil, Contraseña enmascarada con ícono de ojo para mostrar/ocultar, y un botón para cambiar la contraseña directamente), y debajo la tabla de **Permisos por módulo**, con un combo por celda (`sin acceso` / `sólo lectura` / `lectura/escritura`) por cada rol × módulo. El correo electrónico **es** el usuario de acceso al sitio — no hay un campo de "usuario" separado en la tabla; internamente el registro sigue guardando un campo `usuario` (por compatibilidad con cuentas antiguas), pero se mantiene siempre igual al correo al editar desde esta pantalla. Los datos viven en **Netlify Blobs** (`tols-perfiles`), servidos por `netlify/functions/perfiles.js` en `/api/perfiles`. `src/data/perfiles.json` es solo la semilla inicial.
- **Jugadores** (`src/components/Jugadores.jsx` + `src/components/Registro.jsx`) — directorio de jugadores dados de alta por autorregistro. Cualquier visitante puede entrar a `/registro` (sin necesidad de login) y llenar: Nombre y Apellido, Alias Jugador, Alias PokerStars, Teléfono (10 dígitos), Correo electrónico, Contraseña, Fecha de nacimiento y Emoticón. El **Id** lo asigna el sitio, la **Edad** se calcula sola a partir de la fecha de nacimiento (nunca se escribe a mano), el **Tipo de Usuario** siempre inicia como "Jugador", y el **Padrino** solo lo llena un administrador después, desde la pestaña Jugadores — nunca el propio jugador. Antes de crear el registro se valida el correo con un código de 6 dígitos (ver abajo). Al confirmarlo, el jugador queda dado de alta en dos lugares a la vez: la hoja de Jugadores (`tols-jugadores`) y como Usuario normal del sitio con rol "Jugador" (`tols-perfiles`) — inicia sesión después con su correo y la contraseña que eligió, igual que cualquier otro usuario. Los datos viven en **Netlify Blobs** (`tols-jugadores`), servidos por `netlify/functions/jugadores.js` en `/api/jugadores`. Desde la pestaña Jugadores del sitio, quien tenga permiso de escritura en `mod6` puede editar únicamente el Padrino y el Estatus (Activo/Inactivo) de cada jugador — el resto de los campos son de solo lectura ahí porque los llenó el propio jugador.
- Cobranza y **Game Night** (antes "Game Day") — pendientes (permisos ya definidos en el esquema de Usuarios). La hora límite de la Mejor Mano vivirá en Game Night, ya no en el Calendario.

## Validación de correo al autorregistrarse
Al llenar el formulario de `/registro` y darle clic a "Continuar", el sitio genera un código aleatorio de 6
dígitos, lo guarda en **Netlify Blobs** (`tols-verificacion-jugadores`) con una vigencia de **30 segundos**, y
lo envía por correo (vía **Resend**) a la dirección que escribió el jugador. Aparece entonces una pantalla con
6 casillas para ingresar el código. Si coincide y no ha expirado, se crea el registro (jugador + usuario). Si
expira, se ofrece **Regenerar código** (pide uno nuevo) o **Cancelar** (regresa al formulario). Si el código
no coincide, se muestra el error y se puede reintentar mientras siga vigente.

Nota: 30 segundos es un margen ajustado — así lo pidió explícitamente Federico. Si en la práctica el correo
tarda en llegar y da tiempo justo, se puede alargar la vigencia (`DURACION_MS` en
`netlify/functions/jugadores-codigo.js`) con solo pedírselo a Claude.

**Variables de entorno requeridas en Netlify** (Site settings → Environment variables):
- `EMAIL_RESEND_API` — API key de [resend.com](https://resend.com). Crear una cuenta gratis, generar la key
  desde su panel, y agregarla directo aquí. **Nunca debe viajar por el chat con Claude.**
- `MAIL_FROM` (opcional) — remitente de los correos. Por defecto usa `onboarding@resend.dev`, que funciona sin
  verificar dominio propio (limitado a envíos de prueba/bajo volumen); para un remitente con el dominio de la
  liga (ej. `no-responde@tols.mx`) hay que verificar ese dominio en Resend primero.

## Permisos por módulo
Todas las pestañas del menú (`src/App.jsx` + `src/lib/permisos.js`) se muestran siempre — las que el rol de la sesión no tiene permitidas aparecen **deshabilitadas** (atenuadas, no clicables) en vez de ocultarse, usando la matriz cargada de `/api/perfiles`. Dentro del Calendario y del Tablero, los controles de edición solo aparecen si el rol tiene "lectura/escritura" en `mod1` / `mod2` respectivamente. `accesoDe`/`puedeVer`/`puedeEditar` en `permisos.js` ahora reciben los datos de perfiles como primer parámetro (ya no se importan estáticos), porque viven en Blobs y pueden cambiar en caliente desde la pantalla de Usuarios sin volver a desplegar el sitio.

## Cómo se actualizan los datos
Campeonatos, Tablero, Calendario y Usuarios se editan directo en el sitio (con permiso de escritura) y se guardan en **Netlify Blobs** — los `.json` en `src/data/` son solo semillas iniciales para el primer arranque y ya no se vuelven a leer salvo que se borre el store de Blobs correspondiente.

## Campeonato activo en el Tablero de Control
El combo de campeonato tiene un banner destacado debajo ("Estás viendo y editando: **X**...") y el nombre
del campeonato acompaña cada título de sección (Premios, Puntos, Costos), para que nunca se pierda de
vista cuál campeonato se está editando. Al crear uno nuevo aparece un modal ofreciendo **copiar los
valores** del campeonato que estaba activo o **inicializar todos los parámetros en cero** — nunca hereda
valores en silencio. Al eliminar uno aparece un modal de advertencia (borrado permanente, incluye lo que
en el futuro viva en Cobranza/Game Night para ese campeonato) antes de ejecutar.

## Sincronización con Excel (OneDrive)
El sitio escribe en vivo, directo en un Excel guardado en el OneDrive personal de Federico
(`TOLS3.0-Base-de-Datos.xlsx`), cada vez que se guarda algo en el Tablero, el Calendario o Usuarios —
usando la API de Microsoft Graph (OneDrive/Excel). Ese sentido (**sitio → Excel**) es automático, siempre.

**Excel → sitio (solo para Usuarios, manual y explícito):** en la pantalla de Usuarios hay un botón
**"Importar desde Excel"**, visible solo para Administrador General. Al oprimirlo (con una advertencia
previa, porque **reemplaza** lo que hay guardado y no se puede deshacer), el sitio lee las hojas Usuarios y
Permisos del Excel tal como estén en ese momento y sobrescribe `tols-perfiles` con eso — así el Excel puede
ser la fuente de verdad cuando Federico prefiera editar ahí directo. Esto es intencionalmente manual (no
automático ni periódico) para no arriesgar perder un autorregistro de un jugador (`/registro`) u otro cambio
hecho en el sitio que todavía no esté reflejado en el Excel. Por ahora solo cubre Usuarios/Permisos — el
resto de los módulos (Tablero, Calendario, Campeonatos, Jugadores) siguen siendo de un solo sentido
(sitio → Excel); se puede extender el mismo botón a esos módulos si hace falta.

Piezas del sistema:
- `netlify/functions/lib/msgraph.js` — obtiene un access token fresco a partir de un refresh token
  guardado en **Netlify Blobs** (`tols-ms-token`), y expone `syncCampeonatos`/`syncTablero`/
  `syncCalendario`/`syncPerfiles`/`syncJugadores` (sitio → Excel) y `leerUsuariosYPermisosDesdeExcel`
  (Excel → sitio, solo para el botón de importar). Cada sync de escritura es "best effort": si Graph API
  falla (token vencido, sin conexión, etc.), el guardado en el sitio **no se ve afectado** — solo se
  registra el error en los logs de Netlify.
- `netlify/functions/perfiles-importar-excel.js` (`/api/perfiles-importar-excel`, POST) — lee Usuarios y
  Permisos del Excel, valida el resultado con las mismas reglas que el resto del sitio, y si todo está bien
  sobrescribe `tols-perfiles`. Si el Excel queda con datos inválidos (ej. sin ningún Administrador General),
  la importación se rechaza con un mensaje de error y no se aplica nada.
- `netlify/functions/auth-onedrive-start.js` (`/api/auth-onedrive-start`) — redirige a la pantalla de
  login/consentimiento de Microsoft. Se visita **una sola vez** para autorizar.
- `netlify/functions/auth-onedrive-callback.js` (`/api/auth-onedrive-callback`) — recibe el código de
  autorización, lo cambia por un refresh token, y lo guarda en Blobs. Microsoft rota el refresh token en
  cada uso, así que `msgraph.js` siempre guarda el más reciente después de usarlo.

**Variables de entorno requeridas en Netlify** (Site settings → Environment variables):
- `MS_CLIENT_ID` — el Application (client) ID del registro de app en Azure Portal.
- `MS_CLIENT_SECRET` — el Client Secret generado en Azure Portal. **Nunca debe viajar por el chat con
  Claude** — se agrega directo aquí.
- `MS_EXCEL_PATH` (opcional) — ruta del archivo dentro del OneDrive, relativa a la raíz. Por defecto:
  `Personal/MX/TOLS/TOLS 3.0/TOLS3.0-Base-de-Datos.xlsx`.

**Registro de app en Azure Portal** (una sola vez): App registrations → New registration → cuenta
personal de Microsoft soportada → plataforma **Web** con redirect URI
`https://tolsv3.netlify.app/api/auth-onedrive-callback` → API permissions → Microsoft Graph →
delegated → `Files.ReadWrite` + `offline_access` → Certificates & secrets → nuevo client secret.

**Autorización** (una sola vez, después de desplegar con las variables de entorno ya configuradas):
visitar `https://tolsv3.netlify.app/api/auth-onedrive-start`, iniciar sesión con la cuenta de Microsoft
del OneDrive, aceptar los permisos. La página confirma "OneDrive conectado" cuando queda listo.

## Acceso
Login simple de correo electrónico/contraseña contra los datos de `/api/perfiles` (Netlify Blobs) — **no es
seguridad de nivel bancario**, es una interfaz que pide correo y contraseña y valida contra ese registro.
Sirve para mantener el sitio fuera de curiosos casuales, no para proteger información sensible.

El correo electrónico es el usuario de acceso; para mantener compatibilidad con cuentas creadas antes de este
cambio (que tenían un "usuario" distinto del correo, ej. la cuenta semilla de Federico), el login acepta lo
que se escriba tanto contra el campo `correo` como contra el campo `usuario` de cada registro — así ninguna
cuenta antigua queda bloqueada sin tener que editarla primero.

Cuenta semilla: correo `fagazzola@gmail.com` / contraseña `cambia-esta-clave` (rol Administrador General,
usuario interno `federico`) — cámbiala desde la pantalla de Usuarios en cuanto el sitio esté desplegado.

Todos los campos de contraseña (Entrar, autorregistro, recuperar contraseña) tienen un ícono de ojo para
mostrar/ocultar lo que se escribió (`src/components/CampoPassword.jsx`, reutilizado en los tres lugares).

**Cierre de sesión automático por inactividad**: si no hay ningún clic, tecla, scroll o movimiento del mouse
durante **30 minutos** con una sesión abierta, el sitio la cierra solo y regresa a la pantalla de Entrar (que
es siempre el punto de partida cuando no hay sesión activa o válida). Esto cubre el caso de una pestaña que
se queda abierta y olvidada. La actividad se registra en `localStorage` (`tols-last-activity`) y se revisa
cada minuto; usar el sitio con normalidad renueva el conteo, así que no interrumpe una sesión en uso.

**Importante: los usuarios se dan de alta desde el sitio, no editando el Excel directamente.** El Excel de
OneDrive es un espejo de solo lectura (sitio → Excel automático, ver abajo); si agregas o editas un renglón
de la hoja Usuarios directo en el Excel, ese cambio **no llega al sitio** y el login va a fallar con "Usuario
o contraseña incorrectos" — el sitio solo conoce lo que está guardado en Netlify Blobs. Para dar de alta a
alguien, hazlo desde la pantalla de Usuarios del sitio (o dile a esa persona que se autorregistre en
`/registro`, ver el módulo de Jugadores más abajo).

**Recuperar contraseña**: en la pantalla de Entrar hay un link "¿Olvidaste tu contraseña?". Pide el correo
electrónico registrado, manda un código de 6 dígitos por correo (vía Resend, válido 5 minutos), y al
confirmarlo junto con la nueva contraseña deja la cuenta actualizada e inicia sesión automáticamente. Piezas:
`netlify/functions/reset-codigo.js` (`/api/reset-codigo`) y `netlify/functions/reset-confirmar.js`
(`/api/reset-confirmar`), con los códigos pendientes en Blobs (`tols-verificacion-reset`, efímero). Solo
funciona para usuarios que ya tienen un correo electrónico guardado en su registro.

## Desarrollo local
```bash
npm install
npm run dev
```

## Build de producción
```bash
npm run build
```
