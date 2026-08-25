import { getStore } from "@netlify/blobs";

const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const REDIRECT_URI = "https://tolsv3.netlify.app/api/auth-onedrive-callback";
const SCOPE = "Files.ReadWrite offline_access";

function html(bodyHtml) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>TOLS 3.0 · OneDrive</title></head>
     <body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;text-align:center;color:#1a1a1a;">
       ${bodyHtml}
     </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorDesc = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (errorDesc) {
    return html(`<h1>⚠ No se pudo conectar OneDrive</h1><p>${escapeHtml(errorDesc)}</p>`);
  }
  if (!code) {
    return html(`<h1>⚠ Falta el código de autorización.</h1><p>Vuelve a intentar desde <code>/api/auth-onedrive-start</code>.</p>`);
  }

  try {
    const body = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
    });
    const r = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error_description || json.error || `HTTP ${r.status}`);
    if (!json.refresh_token) throw new Error("Microsoft no devolvió un refresh_token — revisa que el permiso offline_access esté agregado en Azure Portal.");

    const store = getStore("tols-ms-token");
    await store.setJSON("data", { refresh_token: json.refresh_token, updated_at: Date.now() });

    return html(`<h1>✓ OneDrive conectado</h1><p>Ya puedes cerrar esta pestaña. A partir de ahora, cada vez que se guarde algo en el Tablero, el Calendario o Usuarios, el Excel de tu OneDrive se va a actualizar solo.</p>`);
  } catch (e) {
    return html(`<h1>⚠ No se pudo conectar OneDrive</h1><p>${escapeHtml(e.message || String(e))}</p>`);
  }
};

export const config = { path: "/api/auth-onedrive-callback" };
