# TOLS 3.0

Sitio de la liga de póker en línea Torrente (Torrente On Line Series). React + Vite, pensado para desplegarse en Netlify conectado a este repo (build command `npm run build`, publish directory `dist` — ya configurado en `netlify.toml`).

## Módulos
Los nombres "MOD 1", "MOD 2", etc. son solo referencia interna de trabajo — no aparecen en ninguna pantalla del sitio.

- **Calendario** (`src/components/Calendario.jsx`), vista mensual (domingo a sábado) con crear/editar/borrar torneo por día. Cada torneo tiene una **temporada** (ej. `2026-I`, `2027-II`) para poder tener varias series por año. El día de pago final se muestra directamente en la cuadrícula con una insignia $ y también se puede editar ahí. Los datos viven en **Netlify Blobs**, servidos por la función `netlify/functions/calendario.js` en `/api/calendario` (GET para leer, PUT/POST para guardar) — así los cambios quedan para todos, no solo en el navegador de quien los hizo. `src/data/calendario.json` es solo la **semilla inicial** (se copia a Blobs la primera vez que corre la función; después de eso, Blobs manda).
- **Tablero de Control** (`src/components/Tablero.jsx` + `src/data/tablero.json`) — todavía de solo lectura (datos estáticos, sin backend aún).
- **Perfiles de usuario / Acceso** (`src/components/Perfiles.jsx` + `src/data/perfiles.json`) — matriz de permisos por rol × módulo, editable solo vía este archivo.
- Cobranza y **Game Night** (antes "Game Day") — pendientes (permisos ya definidos en `perfiles.json`). La hora límite de la Mejor Mano vivirá en Game Night, ya no en el Calendario.

## Permisos por módulo
La navegación (`src/App.jsx` + `src/lib/permisos.js`) oculta cada pestaña según el rol de la sesión, usando la matriz de `src/data/perfiles.json`. Dentro del Calendario, el clic para crear-editar-borrar un torneo (o el pago final) solo aparece si el rol tiene "escritura" en `mod1`.

## Cómo se actualizan los datos
El **Excel maestro en OneDrive sigue siendo la fuente de verdad** para Tablero y Perfiles. Cuando cambie algo ahí, pídele a Claude que regenere el `.json` correspondiente en `src/data/` y suba el commit — Netlify redesplegará automáticamente al detectar el push. El Calendario es distinto: una vez desplegado, se edita directo en el sitio (clic en el calendario) y se guarda en Netlify Blobs — el `.json` local ya no se vuelve a leer salvo que se borre el store de Blobs.

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
