# TOLS 3.0

Sitio de la liga de póker en línea Torrente (Torrente On Line Series). React + Vite, pensado para desplegarse en Netlify conectado a este repo (build command `npm run build`, publish directory `dist` — ya configurado en `netlify.toml`).

## Módulos
- **MOD 1 — Calendario** (`src/components/Calendario.jsx` + `src/data/calendario.json`)
- **MOD 2 — Tablero de Control** (`src/components/Tablero.jsx` + `src/data/tablero.json`)
- **MOD 3 — Perfiles de usuario / Acceso** (`src/components/Perfiles.jsx` + `src/data/perfiles.json`)
- MOD 4 (Cobranza) y MOD 5 (Game Day) — pendientes.

## Cómo se actualizan los datos
El **Excel maestro en OneDrive sigue siendo la fuente de verdad**. Cuando cambie algo ahí (fechas, premios, usuarios, etc.), pídele a Claude que regenere el `.json` correspondiente en `src/data/` y suba el commit — Netlify redesplegará automáticamente al detectar el push.

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
