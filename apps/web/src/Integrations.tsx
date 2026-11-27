import { useEffect, useState, type FormEvent } from "react";
import { Plug, KeyRound, ShieldCheck, X } from "lucide-react";
import { api, type User } from "./store";

type Connection = {
  id: string;
  name: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
  manual: boolean;
};
export function Integrations() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [access, setAccess] = useState("read");
  const [issued, setIssued] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  async function load() {
    const data = await api("/integrations");
    setConnections(data.connections);
    setEndpoint(data.endpoint);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/integrations/token", { name, access });
      setIssued(data);
      setForm(false);
      setName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(connection: Connection) {
    if (
      !confirm(
        `¿Revocar el acceso de “${connection.name}”? El asistente dejará de acceder a Pulso.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/integrations/revoke", { id: connection.id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="integrations" aria-labelledby="integrations-title">
      <h3 id="integrations-title">
        <Plug size={18} aria-hidden="true" /> Asistentes de IA
      </h3>
      <p>
        Conecta un asistente compatible con MCP remoto. Usa esta URL y elige
        OAuth para iniciar sesión en Pulso y autorizar sus permisos.
      </p>
      {endpoint && (
        <label>
          URL del servidor MCP
          <input
            readOnly
            value={endpoint}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      <p>
        Para clientes que usan una clave en lugar de OAuth, crea un token.
        Puedes revocar cualquier conexión desde aquí.
      </p>
      {!form && (
        <button
          className="secondary"
          onClick={() => {
            setForm(true);
            setIssued(null);
          }}
        >
          <KeyRound size={16} /> Crear token de acceso
        </button>
      )}
      {form && (
        <form
          className="integration-token-form"
          onSubmit={(e) => {
            void create(e);
          }}
        >
          <label>
            Nombre del asistente
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Por ejemplo, mi asistente en Muse"
            />
          </label>
          <label>
            Permisos
            <select value={access} onChange={(e) => setAccess(e.target.value)}>
              <option value="read">Solo consultar</option>
              <option value="write">
                Consultar y gestionar tareas y proyectos
              </option>
            </select>
          </label>
          <small>
            El token dura 90 días. Quien lo tenga podrá usar los permisos
            seleccionados sobre tus datos de Pulso.
          </small>
          <div className="settings-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => setForm(false)}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              Crear token
            </button>
          </div>
        </form>
      )}
      {issued && (
        <div className="issued-token" role="status">
          <strong>Guárdalo ahora: solo se muestra esta vez.</strong>
          <label>
            Token de acceso
            <textarea
              readOnly
              rows={3}
              value={issued.token}
              onFocus={(e) => e.currentTarget.select()}
              spellCheck={false}
            />
          </label>
          <small>
            Configúralo como Authorization: Bearer &lt;token&gt; en tu cliente.
            No lo pegues en conversaciones. Caduca el{" "}
            {new Date(issued.expiresAt).toLocaleDateString("es-MX")}.
          </small>
          <button className="text-button" onClick={() => setIssued(null)}>
            Ya lo guardé, ocultar
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <h4>Conexiones autorizadas</h4>
      {endpoint && !connections.length && (
        <p>Aún no hay asistentes conectados.</p>
      )}
      {connections.map((connection) => (
        <div className="integration-connection" key={connection.id}>
          <div>
            <strong>{connection.name}</strong>
            <small>
              {connection.scope.includes("pulso:write")
                ? "Consultar y gestionar"
                : "Solo consultar"}{" "}
              · {connection.manual ? "Token" : "OAuth"}
            </small>
            <small>
              {connection.last_used_at
                ? `Último uso: ${new Date(connection.last_used_at).toLocaleString("es-MX")}`
                : "Todavía sin uso"}
            </small>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              void revoke(connection);
            }}
          >
            Revocar
          </button>
        </div>
      ))}
    </section>
  );
}

type Authorization = {
  id: string;
  name: string;
  scope: string;
  redirect_uri: string;
};
export function McpConsent({ id, user }: { id: string; user: User }) {
  const [request, setRequest] = useState<Authorization | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api("/integrations/authorize/" + encodeURIComponent(id))
      .then((data) => {
        if (active) setRequest(data.request);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const { redirectUrl } = await api("/integrations/authorize", {
        id,
        approve,
      });
      window.location.assign(redirectUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="consent-page">
      <section className="consent-card">
        <a className="consent-home" href="/" aria-label="Volver a Pulso">
          <X size={20} />
        </a>
        <ShieldCheck size={32} aria-hidden="true" />
        <h1>Conectar un asistente a Pulso</h1>
        <p>
          Sesión de <strong>{user.name}</strong> · {user.email}
        </p>
        {request ? (
          <>
            <h2>{request.name}</h2>
            <p>Esta aplicación solicita acceso a tu espacio personal:</p>
            <ul>
              <li>
                Consultar tus tareas, proyectos, secciones, etiquetas y filtros.
              </li>
              {request.scope.includes("pulso:write") && (
                <li>
                  Crear y editar tareas, proyectos, secciones y etiquetas;
                  completar tareas y mover registros a la papelera o
                  recuperarlos.
                </li>
              )}
            </ul>
            <p>
              El nombre lo declara la aplicación solicitante. Revisa el destino
              al que volverás antes de permitir el acceso:
            </p>
            <code className="consent-destination">{request.redirect_uri}</code>
            <p>Podrás revocar esta conexión en Ajustes → Asistentes de IA.</p>
            <div className="settings-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  void decide(false);
                }}
              >
                Cancelar conexión
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  void decide(true);
                }}
              >
                {busy ? "Conectando…" : "Permitir acceso"}
              </button>
            </div>
          </>
        ) : (
          !error && <p role="status">Preparando la solicitud…</p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error} <a href="/">Volver a Pulso</a>
          </div>
        )}
      </section>
    </main>
  );
}
