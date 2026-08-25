// Visita /api/auth-onedrive-start UNA SOLA VEZ (logueado en tu cuenta de Microsoft) para autorizar
// al sitio a escribir en el Excel de tu OneDrive. Redirige a la pantalla de login/consentimiento de
// Microsoft; al aceptar, Microsoft manda de regreso el código a /api/auth-onedrive-callback.
const REDIRECT_URI = "https://tolsv3.netlify.app/api/auth-onedrive-callback";
const SCOPE = "Files.ReadWrite offline_access";

export default async (req) => {
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) {
    return new Response("Falta configurar la variable de entorno MS_CLIENT_ID en Netlify.", { status: 500 });
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPE,
    prompt: "consent",
  });
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  return new Response(null, { status: 302, headers: { location: url } });
};

export const config = { path: "/api/auth-onedrive-start" };
