# TOLS 3.0

Sitio de la liga de póker en línea Torrente (Torrente On Line Series). React + Vite, pensado para desplegarse en Netlify conectado a este repo (build command `npm run build`, publish directory `dist` — ya configurado en `netlify.toml`).

## Módulos
Los nombres "MOD 1", "MOD 2", etc. son solo referencia interna de trabajo — no aparecen en ninguna pantalla del sitio. Esta pantalla (`App.jsx`) es la **administración de toda la liga**; **Game Night** es una pantalla aparte (pendiente de definir) y no vive en este menú.

El orden fijo de pestañas es: **Tablero de Control, Calendario, Cobranza, Jugadores**. Cobranza todavía no existe como pantalla real, así que no aparece hasta que se construya.

- **Tablero de Control** (`src/components/Tablero.jsx`) — editable en vivo. Empieza con el **nombre del campeonato** (ej. `2026-I`, el mismo identificador que la temporada del Calendario) al que corresponden los valores de abajo, porque premios/puntos/costos pueden cambiar de un campeonato a otro. Luego: premios (por torneo y por campeonato, con % de Rey Killer obligatorio), puntos por posición, cuota de inscripción (por jugador, una vez por campeonato), gastos del campeonato (Tesorero, Pulsera, etc. — se extraen del acumulado y se descuentan del monto a repartir), cobros por torneo (Buy-in, Re-buy y Add-on siempre presentes y no eliminables) y pagos por torneo (Sale en burbuja, Mejor Mano, etc.). Los datos viven en **Netlify Blobs**, servidos por `netlify/functions/tablero.js` en `/api/tablero`. `src/data/tablero.json` es solo la semilla inicial.
- **Calendario** (`src/components/Calendario.jsx`), vista mensual (domingo a sábado) con crear/editar/borrar torneo por día. Cada torneo tiene una **temporada** (ej. `2026-I`, `2027-II`). El día de pago final se muestra directamente en la cuadrícula con una insignia $ y también se puede editar ahí. Los datos viven en **Netlify Blobs**, servidos por `netlify/functions/calendario.js` en `/api/calendario`. `src/data/calendario.json` es solo la semilla inicial.
- **Jugadores** (`src/components/Perfiles.jsx` + `src/data/perfiles.json`, antes llamado "Perfiles") — matriz de permisos por rol × módulo, y la lista de usuarios; editable solo vía este archivo.
- Cobranza y **Game Night** (antes "Game Day") — pendientes (permisos ya definidos en `perfiles.json`). La hora límite de la Mejor Mano vivirá en Game Night, ya no en el Calendario.

## Permisos por módulo
Todas las pestañas del menú (`src/App.jsx` + `src/lib/permisos.js`) se muestran siempre — las que el rol de la sesión no tiene permitidas aparecen **deshabilitadas** (atenuadas, no clicables) en vez de ocultarse, usando la matriz de `src/data/perfiles.json`. Dentro del Calendario y del Tablero, los controles de edición solo aparecen si el rol tiene "escritura" en `mod1` / `mod2` respectivamente.

## Cómo se actualizan los datos
El **Excel maestro en OneDrive sigue siendo la fuente de verdad** para Perfiles. Cuando cambie algo ahí, pídele a Claude que regenere el `.json` correspondiente en `src/data/` y suba el commit — Netlify redesplegará automáticamente al detectar el push. El Calendario y el Tablero son distintos: una vez desplegados, se editan directo en el sitio y se guardan en Netlify Blobs — los `.json` locales ya no se vuelven a leer salvo que se borre el store de Blobs correspondiente.

## Acceso
Login simple de usuario/contraseña contra `src/data/perfiles.json` — **no es seguridad de nivel bancario**. Al compilar el sitio, ese archivo (usuarios y contraseñas incluidos) queda dentro del paquete JavaScript que se manda al navegador de cualquier visitante: alguien con conocimientos técnicos podría verlo aunque no haya iniciado sesión. Sirve para mantener el sitio fuera de curiosos casuales, no para proteger información sensible.

Usuario semilla: `federico` / `cambia-esta-clave` (rol Administrador General) — cámbiala en `src/data/perfiles.json` cuanto antes.

## Desarrollo local
```bash
npm install
npm run dev
```

## Build de producción
```bash
npm run build
```
