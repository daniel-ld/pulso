import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "./store";

// Older installed workers may return the consent SPA while the document URL
// is still /oauth/authorize. Recover the validated request over network-only
// /api rather than falling through to the task workspace or redirect looping.
export function OAuthEntry() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (window.location.pathname !== "/oauth/authorize") {
      setError(
        "Inicia la conexión desde los ajustes de tu asistente usando la URL MCP de Pulso.",
      );
      return;
    }
    void api("/auth/mcp-start" + window.location.search)
      .then(({ authorizationUrl }) => {
        if (!active) return;
        const target = new URL(authorizationUrl);
        if (
          target.origin !== window.location.origin ||
          target.pathname !== "/connect/mcp"
        )
          throw new Error("El destino de autorización no coincide con Pulso.");
        window.location.replace(target.href);
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudo preparar la autorización. La solicitud no es válida o no hay conexión con el servidor. Vuelve a iniciarla desde tu asistente.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="consent-page">
      <section className="consent-card">
        <ShieldCheck size={32} aria-hidden="true" />
        <h1>Conectar con Pulso</h1>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Preparando la autenticación con tu asistente…</p>
        )}
        <a className="secondary" href="/">
          Volver a Pulso
        </a>
      </section>
    </main>
  );
}
