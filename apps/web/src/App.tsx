import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CloudUpload as CloudCheck,
  CloudOff,
  Download,
  Flag,
  Hash,
  Inbox,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Tag,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import {
  addDays,
  matchesFilter,
  projectSchema,
  schemas,
  taskSchema,
  today,
  type Entity,
  type EntityType,
  type Label,
  type Pending,
  type Project,
  type SavedFilter,
  type Section,
  type Task,
} from "@pulso/shared";
import {
  api,
  closeLocal,
  db,
  discardRejected,
  exportBackup,
  mutate,
  openUser,
  resolveConflict,
  restoreBackup,
  subscribe,
  synchronize,
  type SyncState,
  type User,
} from "./store";
import { getThemePreference, setThemePreference, subscribeTheme } from "./theme";

type TaskEntity = Entity<Task>;
type View = {
  kind: "today" | "inbox" | "upcoming" | "all" | "project" | "label" | "filter";
  id?: string;
};
type Editor = {
  entity?: TaskEntity;
  projectId?: string;
  sectionId?: string;
  parentId?: string;
  date?: string;
};
const colors = [
  "#6c48e5",
  "#3b82f6",
  "#e28c3d",
  "#29a17c",
  "#d66387",
  "#64748b",
];
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
const objectData = (v: unknown) => v as Record<string, unknown>;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { user } = await api("/me");
        await openUser(user);
        if (active) setUser(user);
      } catch (e) {
        if (!(e as { status?: number }).status) {
          try {
            const cached = JSON.parse(
              localStorage.getItem("pulso-user") ?? "null",
            );
            if (cached?.id) {
              await openUser(cached);
              if (active) setUser(cached);
            }
          } catch {
            /* Login remains available. */
          }
        }
        try {
          const status = await api("/auth/status");
          if (active) setNeedsSetup(status.needsSetup);
        } catch {
          if (active)
            setError(
              "No hay conexión con el servidor. Si ya usaste Pulso aquí, tus tareas siguen guardadas.",
            );
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const onUser = async (user: User) => {
    await openUser(user);
    setNeedsSetup(false);
    setUser(user);
  };
  if (!ready)
    return (
      <div className="loading">
        <Logo />
        <span>Preparando tu espacio…</span>
      </div>
    );
  return user ? (
    <Workspace
      user={user}
      onLogout={() => {
        closeLocal();
        setUser(null);
      }}
    />
  ) : (
    <Auth setup={needsSetup} onUser={onUser} initialError={error} />
  );
}
function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <Check strokeWidth={3} size={23} />
      </span>
      pulso<span className="logo-dot">.</span>
    </span>
  );
}
function Auth({
  setup,
  onUser,
  initialError,
}: {
  setup: boolean;
  onUser: (u: User) => Promise<void>;
  initialError?: string;
}) {
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { user } = await api(setup ? "/auth/setup" : "/auth/login", body);
      await onUser(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <Logo />
        <div className="auth-art">
          <div className="art-orbit">
            <CheckCheck size={64} strokeWidth={1.5} />
          </div>
          <span className="art-note">
            <Circle size={16} /> Un poco más de claridad.
          </span>
          <span className="art-note second">
            <Check size={16} /> Un pendiente menos.
          </span>
        </div>
        <h1>
          Tu día, con
          <br />
          <em>más espacio.</em>
        </h1>
        <p>
          Todo lo que quieres hacer.
          <br />
          En un lugar que es solo tuyo.
        </p>
        <span className="auth-caption">PERSONAL · SIMPLE · A TU RITMO</span>
      </div>
      <section className="auth-form">
        <span className="eyebrow">TU ESPACIO PERSONAL</span>
        <h2>{setup ? "Empecemos con calma." : "Qué bueno verte."}</h2>
        <p>
          {setup
            ? "Crea tu cuenta. Esta instalación es solo para ti."
            : "Entra para continuar con lo importante."}
        </p>
        <form onSubmit={submit}>
          {setup && (
            <label>
              Tu nombre
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="¿Cómo te llamas?"
              />
            </label>
          )}
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="tu@correo.com"
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              required
              minLength={12}
              maxLength={128}
              placeholder="Al menos 12 caracteres"
            />
          </label>
          {setup && (
            <label>
              Clave de instalación
              <input
                name="setupKey"
                type="password"
                autoComplete="off"
                required
                placeholder="SETUP_KEY de tu servidor"
              />
              <small>
                La encuentras en las variables de entorno de Coolify.
              </small>
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Preparando…"
              : setup
                ? "Crear mi espacio"
                : "Entrar a Pulso"}
          </button>
        </form>
        <div className="auth-foot">
          <CloudCheck size={18} /> Tus tareas se guardan también en este
          dispositivo.
        </div>
      </section>
    </main>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const entities = useLiveQuery(() => db.entities.toArray(), []) ?? [];
  const pending =
    useLiveQuery(() => db.outbox.orderBy("localOrder").toArray(), []) ?? [];
  const [view, setView] = useState<View>({ kind: "today" });
  const [layout, setLayout] = useState<"list" | "board" | "calendar">("list");
  const [query, setQuery] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [settings, setSettings] = useState(false);
  const [sync, setSync] = useState<SyncState>({ mode: "online", message: "" });
  const [notice, setNotice] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [renaming, setRenaming] = useState<Entity<Project> | null>(null);
  const [creator, setCreator] = useState<
    "project" | "section" | "label" | "filter" | null
  >(null);
  const [undo, setUndo] = useState<{
    entity: TaskEntity;
    message: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const todayDate = today();
  const active = entities.filter((e) => !e.deletedAt);
  const projects = active.filter(
    (e) => e.type === "project",
  ) as Entity<Project>[];
  const sections = active.filter(
    (e) => e.type === "section",
  ) as Entity<Section>[];
  const labels = active.filter((e) => e.type === "label") as Entity<Label>[];
  const filters = active.filter(
    (e) => e.type === "filter",
  ) as Entity<SavedFilter>[];
  const tasks = active.filter((e) => e.type === "task") as TaskEntity[];
  const inbox = projects.find((e) => e.data.isInbox);
  const currentProject = projects.find((p) => p.id === view.id);
  const conflicts = pending.filter((p) => p.conflict);
  const rejected = pending.filter((p) => p.rejected);
  const navigate = (v: View) => {
    setView(v);
    setQuery("");
    setSidebar(false);
  };
  useEffect(() => subscribe(setSync), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement).matches(
        "input,textarea,select,[contenteditable]",
      );
      if (e.key === "Escape") {
        setEditor(null);
        setCreator(null);
        setSettings(false);
        setSidebar(false);
      }
      if (!editing && e.key === "q") {
        e.preventDefault();
        setEditor({
          projectId: view.kind === "project" ? view.id : inbox?.id,
          date: view.kind === "today" ? todayDate : undefined,
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSidebar(true);
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [view, inbox?.id, todayDate]);
  async function run(fn: () => Promise<unknown>, success?: string) {
    try {
      await fn();
      if (success) setNotice(success);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function complete(entity: TaskEntity) {
    await run(async () => {
      await mutate("task", entity.id, {}, "complete");
      setUndo({
        entity,
        message: entity.data.completedAt
          ? "Tarea reabierta"
          : entity.data.recurrence
            ? "Próxima repetición programada"
            : "Una cosa menos. Bien hecho.",
      });
    });
  }
  function addTask(extra: Editor = {}) {
    setEditor({
      projectId: view.kind === "project" ? view.id : inbox?.id,
      date: view.kind === "today" ? todayDate : undefined,
      ...extra,
    });
  }
  const title = query
    ? "Resultados de búsqueda"
    : view.kind === "today"
      ? "Hoy"
      : view.kind === "inbox"
        ? "Bandeja de entrada"
        : view.kind === "upcoming"
          ? "Próximo"
          : view.kind === "all"
            ? "Todas las tareas"
            : view.kind === "project"
              ? (currentProject?.data.name ?? "Proyecto")
              : view.kind === "label"
                ? (labels.find((l) => l.id === view.id)?.data.name ??
                  "Etiqueta")
                : (filters.find((f) => f.id === view.id)?.data.name ??
                  "Filtro");
  const visible = tasks
    .filter((e) => {
      const t = e.data;
      if (!!t.completedAt !== showCompleted) return false;
      if (
        view.kind !== "project" &&
        projects.find((p) => p.id === t.projectId)?.data.archived
      )
        return false;
      if (query)
        return `${t.title} ${t.description}`
          .toLowerCase()
          .includes(query.toLowerCase());
      if (view.kind === "today")
        return !!t.scheduledDate && t.scheduledDate <= todayDate;
      if (view.kind === "inbox") return t.projectId === inbox?.id;
      if (view.kind === "project") return t.projectId === view.id;
      if (view.kind === "label") return t.labelIds.includes(view.id!);
      if (view.kind === "filter")
        return matchesFilter(
          t,
          filters.find((f) => f.id === view.id)?.data.query ?? "",
          todayDate,
        );
      if (view.kind === "upcoming")
        return !!t.scheduledDate && t.scheduledDate >= todayDate;
      return !projects.find((p) => p.id === t.projectId)?.data.archived;
    })
    .sort(
      (a, b) => a.data.sortOrder - b.data.sortOrder || a.id.localeCompare(b.id),
    );
  const todayTasks = tasks.filter((t) => t.data.scheduledDate === todayDate);
  const finished = todayTasks.filter((t) => t.data.completedAt).length;
  const overdue = visible.filter(
    (t) => t.data.scheduledDate && t.data.scheduledDate < todayDate,
  );
  const ontime = visible.filter(
    (t) => !t.data.scheduledDate || t.data.scheduledDate >= todayDate,
  );
  const greeting = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const countFor = (v: string) =>
    tasks.filter(
      (t) =>
        !t.data.completedAt &&
        (v === "today"
          ? !!t.data.scheduledDate && t.data.scheduledDate <= todayDate
          : t.data.projectId === v),
    ).length;
  async function reorder(entity: TaskEntity, target: TaskEntity) {
    const index = visible.findIndex((t) => t.id === target.id);
    const prev =
      visible[index - 1]?.data.sortOrder ?? target.data.sortOrder - 2000;
    await run(() =>
      mutate("task", entity.id, {
        sortOrder: (prev + target.data.sortOrder) / 2,
      }),
    );
  }
  const taskRow = (entity: TaskEntity) => (
    <TaskRow
      key={entity.id}
      entity={entity}
      projects={projects}
      labels={labels}
      tasks={tasks}
      onComplete={() => {
        void complete(entity);
      }}
      onEdit={() => setEditor({ entity })}
      onSubtask={() =>
        addTask({
          projectId: entity.data.projectId,
          parentId: entity.id,
          sectionId: entity.data.sectionId ?? undefined,
        })
      }
      onDelete={() => {
        if (confirm(`¿Mover “${entity.data.title}” a la papelera?`))
          void run(() => mutate("task", entity.id, {}, "delete"));
      }}
      onDrop={(id) => {
        const task = tasks.find((t) => t.id === id);
        if (task) void reorder(task, entity);
      }}
    />
  );

  return (
    <div className="workspace">
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar navegación"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <span className="personal-badge">PERSONAL</span>
        </div>
        <button className="account" onClick={() => setSettings(true)}>
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{user.name}</strong>
            <small>Mi espacio personal</small>
          </span>
          <ChevronDown size={16} />
        </button>
        <div className="sidebar-search">
          <Search size={17} />
          <input
            ref={searchRef}
            aria-label="Buscar tareas"
            placeholder="Buscar en tu espacio"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <button className="sidebar-add" onClick={() => addTask()}>
          <Plus size={19} /> Añadir tarea <kbd>Q</kbd>
        </button>
        <nav aria-label="Navegación principal">
          <Nav
            icon={<Sun />}
            label="Hoy"
            active={view.kind === "today" && !query}
            count={countFor("today")}
            onClick={() => navigate({ kind: "today" })}
          />
          <Nav
            icon={<Inbox />}
            label="Bandeja de entrada"
            active={view.kind === "inbox" && !query}
            count={countFor(inbox?.id ?? "")}
            onClick={() => navigate({ kind: "inbox" })}
          />
          <Nav
            icon={<CalendarRange />}
            label="Próximo"
            active={view.kind === "upcoming" && !query}
            onClick={() => navigate({ kind: "upcoming" })}
          />
          <Nav
            icon={<LayoutGrid />}
            label="Todas las tareas"
            active={view.kind === "all" && !query}
            onClick={() => navigate({ kind: "all" })}
          />
        </nav>
        <div className="nav-section-title">
          <span>MIS PROYECTOS</span>
          <button
            className="icon-button"
            aria-label="Crear proyecto"
            onClick={() => setCreator("project")}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav aria-label="Proyectos">
          {projects
            .filter((p) => !p.data.isInbox && !p.data.archived)
            .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
            .map((p) => (
              <Nav
                key={p.id}
                icon={<Hash style={{ color: p.data.color }} />}
                label={p.data.name}
                active={view.kind === "project" && view.id === p.id && !query}
                count={countFor(p.id)}
                onClick={() => navigate({ kind: "project", id: p.id })}
              />
            ))}
          {projects.filter((p) => !p.data.isInbox).length === 0 && (
            <button
              className="quiet-link"
              onClick={() => setCreator("project")}
            >
              Un proyecto, un poco de orden
            </button>
          )}
        </nav>
        <div className="nav-section-title">
          <span>FILTROS Y ETIQUETAS</span>
          <button
            className="icon-button"
            aria-label="Crear filtro"
            onClick={() => setCreator("filter")}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav>
          {filters.map((f) => (
            <Nav
              key={f.id}
              icon={<SlidersHorizontal />}
              label={f.data.name}
              active={view.kind === "filter" && view.id === f.id}
              onClick={() => navigate({ kind: "filter", id: f.id })}
            />
          ))}
          {labels.map((l) => (
            <Nav
              key={l.id}
              icon={<Tag style={{ color: l.data.color }} />}
              label={l.data.name}
              active={view.kind === "label" && view.id === l.id}
              onClick={() => navigate({ kind: "label", id: l.id })}
            />
          ))}
          <button className="quiet-link" onClick={() => setCreator("label")}>
            <Plus size={14} /> Crear etiqueta
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Sparkles size={19} />
            <p>
              Lo importante empieza
              <br />
              con un pequeño paso.
            </p>
          </div>
          <button className="settings-link" onClick={() => setSettings(true)}>
            <Settings2 size={18} /> Ajustes y respaldos
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebar(true)}
            aria-label="Abrir navegación"
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Mi espacio <span>/</span> <strong>{title}</strong>
          </span>
          <button
            className={`sync-pill ${sync.mode}`}
            onClick={() => {
              void synchronize();
            }}
            title={sync.message || "Comprobar sincronización"}
          >
            {sync.mode === "syncing" ? (
              <RefreshCw className="spin" size={14} />
            ) : sync.mode === "online" ? (
              <CloudCheck size={16} />
            ) : (
              <CloudOff size={16} />
            )}
            <span>
              {sync.mode === "syncing"
                ? "Sincronizando"
                : sync.mode === "online"
                  ? pending.length
                    ? `${pending.length} pendientes`
                    : "Todo guardado"
                  : sync.mode === "offline"
                    ? "Sin conexión"
                    : sync.mode === "expired"
                      ? "Sesión expirada"
                      : "Revisar conexión"}
            </span>
          </button>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view.kind === "today" ? greeting : "UN LUGAR PARA CADA IDEA"}
              </p>
              <h1>
                {title}
                <span className="title-dot">.</span>
              </h1>
              <p className="page-subtitle">
                {query
                  ? `Buscando “${query}” en todas tus tareas`
                  : view.kind === "today"
                    ? "Un día a la vez. Concéntrate en lo que importa."
                    : view.kind === "inbox"
                      ? "Saca las ideas de tu cabeza. Después les das un lugar."
                      : view.kind === "upcoming"
                        ? "Mira hacia adelante y encuentra tu ritmo."
                        : "Menos ruido. Más claridad para seguir adelante."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => addTask()}
              disabled={!inbox}
            >
              <Plus size={18} /> Nueva tarea
            </button>
          </div>
          {sync.mode === "expired" && (
            <div className="warning">
              <span>{sync.message}</span>
              <button onClick={onLogout}>Volver a iniciar sesión</button>
            </div>
          )}
          {(sync.mode === "error" || sync.mode === "offline") && (
            <div className="connection-note">
              <WifiOff size={16} />{" "}
              {sync.message ||
                "Los cambios se guardan aquí hasta recuperar la conexión."}
            </div>
          )}
          {rejected.length > 0 && (
            <div className="warning">
              <span>
                Hay {rejected.length} cambios que no se pudieron aplicar.
              </span>
              <button onClick={() => setSettings(true)}>Revisar</button>
            </div>
          )}
          {conflicts.length > 0 && (
            <div className="warning">
              <span>
                {conflicts.length}{" "}
                {conflicts.length === 1
                  ? "cambio necesita"
                  : "cambios necesitan"}{" "}
                tu atención. Ambas versiones están guardadas.
              </span>
              <button onClick={() => setSettings(true)}>Resolver</button>
            </div>
          )}
          <div className="workspace-columns">
            <section className="task-area">
              <div className="view-toolbar">
                <div className="view-tabs">
                  <button
                    className={!showCompleted ? "active" : ""}
                    onClick={() => setShowCompleted(false)}
                  >
                    Por hacer{" "}
                    <span>
                      {tasks.filter((t) => !t.data.completedAt).length}
                    </span>
                  </button>
                  <button
                    className={showCompleted ? "active" : ""}
                    onClick={() => setShowCompleted(true)}
                  >
                    Completadas
                  </button>
                </div>
                <div className="layout-switch" aria-label="Presentación">
                  {(
                    [
                      ["list", List, "Lista"],
                      ["board", LayoutGrid, "Tablero"],
                      ["calendar", CalendarDays, "Calendario"],
                    ] as const
                  ).map(([value, Icon, label]) => (
                    <button
                      key={value}
                      className={layout === value ? "active" : ""}
                      aria-label={label}
                      title={label}
                      aria-pressed={layout === value}
                      onClick={() => setLayout(value)}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
              </div>
              {layout === "list" && (
                <div className="task-list">
                  {view.kind === "project" && (
                    <div className="project-tools">
                      {currentProject && (
                        <button
                          className="text-button"
                          onClick={() => setRenaming(currentProject)}
                        >
                          Editar proyecto
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => setCreator("section")}
                      >
                        <Plus size={15} /> Añadir sección
                      </button>
                      {currentProject && !currentProject.data.isInbox && (
                        <button
                          className="text-button"
                          onClick={() => {
                            void run(
                              () =>
                                mutate("project", currentProject.id, {
                                  archived: !currentProject.data.archived,
                                }),
                              currentProject.data.archived
                                ? "Proyecto recuperado"
                                : "Proyecto archivado",
                            );
                            navigate({ kind: "all" });
                          }}
                        >
                          Archivar proyecto
                        </button>
                      )}
                    </div>
                  )}
                  {visible.length === 0 ? (
                    <Empty completed={showCompleted} onAdd={() => addTask()} />
                  ) : view.kind === "today" && !query ? (
                    <>
                      {overdue.length > 0 && (
                        <TaskGroup
                          label="Pendientes de antes"
                          count={overdue.length}
                          danger
                        >
                          {overdue.map(taskRow)}
                        </TaskGroup>
                      )}
                      <TaskGroup label="Para hoy" count={ontime.length}>
                        {ontime.map(taskRow)}
                        {ontime.length === 0 && (
                          <p className="group-empty">
                            Tienes espacio para algo nuevo.
                          </p>
                        )}
                      </TaskGroup>
                    </>
                  ) : view.kind === "project" ? (
                    <>
                      {[
                        null,
                        ...sections
                          .filter((s) => s.data.projectId === view.id)
                          .sort((a, b) => a.data.sortOrder - b.data.sortOrder),
                      ].map((section) => {
                        const items = visible.filter(
                          (t) => t.data.sectionId === (section?.id ?? null),
                        );
                        return (
                          <TaskGroup
                            key={section?.id ?? "none"}
                            label={section?.data.name ?? "Sin sección"}
                            count={items.length}
                          >
                            {items.map(taskRow)}
                            <button
                              className="inline-add"
                              onClick={() =>
                                addTask({ sectionId: section?.id })
                              }
                            >
                              <Plus size={16} /> Añadir tarea
                            </button>
                          </TaskGroup>
                        );
                      })}
                    </>
                  ) : view.kind === "upcoming" && !query ? (
                    [...new Set(visible.map((t) => t.data.scheduledDate!))]
                      .sort()
                      .map((date) => (
                        <TaskGroup
                          key={date}
                          label={dateLabel(date)}
                          count={
                            visible.filter((t) => t.data.scheduledDate === date)
                              .length
                          }
                        >
                          {visible
                            .filter((t) => t.data.scheduledDate === date)
                            .map(taskRow)}
                        </TaskGroup>
                      ))
                  ) : (
                    <TaskGroup
                      label={`${visible.length} tareas`}
                      count={visible.length}
                    >
                      {visible.map(taskRow)}
                    </TaskGroup>
                  )}
                  {visible.length > 0 && view.kind !== "project" && (
                    <button className="inline-add" onClick={() => addTask()}>
                      <Plus size={18} /> Añadir tarea <kbd>Q</kbd>
                    </button>
                  )}
                </div>
              )}
              {layout === "board" && (
                <div className="board">
                  {(view.kind === "project"
                    ? [
                        {
                          id: "",
                          name: "Sin sección",
                          color: currentProject?.data.color,
                        },
                        ...sections
                          .filter((s) => s.data.projectId === view.id)
                          .map((s) => ({
                            id: s.id,
                            name: s.data.name,
                            color: currentProject?.data.color,
                          })),
                      ]
                    : projects
                        .filter((p) => !p.data.archived)
                        .map((p) => ({
                          id: p.id,
                          name: p.data.name,
                          color: p.data.color,
                        }))
                  ).map((column) => {
                    const items = visible.filter((t) =>
                      view.kind === "project"
                        ? (t.data.sectionId ?? "") === column.id
                        : t.data.projectId === column.id,
                    );
                    return (
                      <section
                        key={column.id}
                        className="board-column"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const task = tasks.find(
                            (t) =>
                              t.id === e.dataTransfer.getData("text/plain"),
                          );
                          if (task)
                            void run(() =>
                              mutate(
                                "task",
                                task.id,
                                view.kind === "project"
                                  ? {
                                      sectionId: column.id || null,
                                      sortOrder: Date.now(),
                                    }
                                  : {
                                      projectId: column.id,
                                      sectionId: null,
                                      parentId: null,
                                      sortOrder: Date.now(),
                                    },
                              ),
                            );
                        }}
                      >
                        <h3>
                          <i style={{ background: column.color }} />
                          {column.name}
                          <span>{items.length}</span>
                        </h3>
                        {items.map(taskRow)}
                        <button
                          className="inline-add"
                          onClick={() =>
                            addTask(
                              view.kind === "project"
                                ? { sectionId: column.id || undefined }
                                : { projectId: column.id },
                            )
                          }
                        >
                          <Plus size={16} /> Añadir tarea
                        </button>
                      </section>
                    );
                  })}
                  {view.kind === "project" && (
                    <button
                      className="text-button"
                      onClick={() => setCreator("section")}
                    >
                      <Plus size={16} /> Nueva sección
                    </button>
                  )}
                </div>
              )}
              {layout === "calendar" && (
                <CalendarView
                  tasks={visible}
                  onEdit={(entity) => setEditor({ entity })}
                  onAdd={(date) => addTask({ date })}
                  onMove={(id, date) => {
                    void run(() => mutate("task", id, { scheduledDate: date }));
                  }}
                />
              )}
            </section>
            <aside className="day-aside">
              <div className="focus-card">
                <span className="eyebrow">A TU RITMO</span>
                <h2>
                  Un pequeño paso
                  <br />
                  también cuenta.
                </h2>
                <div className="progress-art">
                  <div
                    className="progress-ring"
                    style={{
                      background: `conic-gradient(var(--accent) ${todayTasks.length ? (finished / todayTasks.length) * 360 : 0}deg, var(--soft) 0deg)`,
                    }}
                  >
                    <div>
                      <span>
                        {finished}
                        <small> / {todayTasks.length}</small>
                      </span>
                      <p>para hoy</p>
                    </div>
                  </div>
                  <span className="sparkle one">✦</span>
                  <span className="sparkle two">✧</span>
                </div>
                <p>
                  {finished > 0
                    ? "Cada tarea terminada deja espacio para lo que sigue."
                    : "Elige una tarea. Dale tu atención. Lo demás puede esperar."}
                </p>
              </div>
              <div className="overview">
                <h3>Tu espacio, en orden</h3>
                <div>
                  <span>
                    <span className="stat-dot violet" />
                    Por hacer
                  </span>
                  <strong>
                    {tasks.filter((t) => !t.data.completedAt).length}
                  </strong>
                </div>
                <div>
                  <span>
                    <span className="stat-dot green" />
                    Completadas
                  </span>
                  <strong>
                    {tasks.filter((t) => t.data.completedAt).length}
                  </strong>
                </div>
                <div>
                  <span>
                    <span className="stat-dot orange" />
                    Proyectos activos
                  </span>
                  <strong>
                    {
                      projects.filter(
                        (p) => !p.data.isInbox && !p.data.archived,
                      ).length
                    }
                  </strong>
                </div>
              </div>
              <div className="keyboard-note">
                <kbd>Q</kbd>
                <span>
                  Una idea nueva.
                  <br />
                  Una tarea nueva.
                </span>
              </div>
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>Hecho para encontrar tu ritmo.</span>
            <span>Tu espacio. Tus datos.</span>
          </footer>
        </main>
      </div>
      <button
        className="mobile-add"
        aria-label="Añadir tarea"
        onClick={() => addTask()}
      >
        <Plus size={26} />
      </button>
      {editor && (
        <TaskEditor
          editor={editor}
          projects={projects}
          sections={sections}
          labels={labels}
          tasks={tasks}
          onClose={() => setEditor(null)}
          onSave={async (data, id) => {
            await mutate("task", id ?? crypto.randomUUID(), objectData(data));
            setEditor(null);
          }}
        />
      )}
      {renaming && (
        <CreateDialog
          kind="project"
          entity={renaming}
          onClose={() => setRenaming(null)}
          onCreated={() => setRenaming(null)}
        />
      )}
      {creator && (
        <CreateDialog
          kind={creator}
          projectId={view.kind === "project" ? view.id : undefined}
          onClose={() => setCreator(null)}
          onCreated={(type, id) => {
            setCreator(null);
            if (type === "project") navigate({ kind: "project", id });
          }}
        />
      )}
      {settings && (
        <Settings
          user={user}
          projects={projects}
          trash={entities.filter((e) => !!e.deletedAt)}
          rejected={rejected}
          conflicts={conflicts}
          onClose={() => setSettings(false)}
          onNotice={setNotice}
          onLogout={async () => {
            if (
              pending.length &&
              !confirm(
                "Hay cambios sin sincronizar. Permanecerán guardados aquí, pero no estarán en otros dispositivos. ¿Cerrar sesión?",
              )
            )
              return;
            await run(async () => {
              await api("/logout", {});
              localStorage.removeItem("pulso-user");
              onLogout();
            });
          }}
        />
      )}
      {(notice || undo) && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          <span>{notice || undo?.message}</span>
          {!notice && undo && (
            <button
              onClick={() => {
                void run(() =>
                  mutate("task", undo.entity.id, objectData(undo.entity.data)),
                );
                setUndo(null);
              }}
            >
              Deshacer
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Cerrar aviso"
            onClick={() => {
              setNotice("");
              setUndo(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Nav({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && <small>{count}</small>}
    </button>
  );
}
function TaskGroup({
  label,
  count,
  danger,
  children,
}: {
  label: string;
  count: number;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="task-group">
      <h2 className={danger ? "danger" : ""}>
        {label}
        <span>{count}</span>
      </h2>
      {children}
    </section>
  );
}
function Empty({
  completed,
  onAdd,
}: {
  completed: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CheckCheck size={35} strokeWidth={1.5} />
      </div>
      <h2>
        {completed
          ? "Aquí vivirán tus avances."
          : "Un poco de espacio para ti."}
      </h2>
      <p>
        {completed
          ? "Las tareas que completes aparecerán aquí."
          : "No hay pendientes en esta vista. Añade algo que quieras hacer y empieza a tu ritmo."}
      </p>
      {!completed && (
        <button className="secondary" onClick={onAdd}>
          <Plus size={17} /> Crear una tarea
        </button>
      )}
    </div>
  );
}
function TaskRow({
  entity,
  projects,
  labels,
  tasks,
  onComplete,
  onEdit,
  onSubtask,
  onDelete,
  onDrop,
}: {
  entity: TaskEntity;
  projects: Entity<Project>[];
  labels: Entity<Label>[];
  tasks: TaskEntity[];
  onComplete: () => void;
  onEdit: () => void;
  onSubtask: () => void;
  onDelete: () => void;
  onDrop: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const t = entity.data;
  return (
    <article
      className={`task-row ${t.completedAt ? "completed" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", entity.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e.dataTransfer.getData("text/plain"));
      }}
    >
      <button
        className={`task-check p${t.priority}`}
        onClick={onComplete}
        aria-label={
          t.completedAt ? `Reabrir ${t.title}` : `Completar ${t.title}`
        }
      >
        {t.completedAt ? (
          <Check size={13} />
        ) : (
          <Check className="check-hover" size={13} />
        )}
      </button>
      <button className="task-content" onClick={onEdit}>
        <span className="task-title">{t.title}</span>
        {t.description && (
          <span className="task-description">{t.description}</span>
        )}
        <span className="task-meta">
          {t.scheduledDate && (
            <span
              className={
                t.scheduledDate < today() && !t.completedAt
                  ? "overdue"
                  : t.scheduledDate === today()
                    ? "due-today"
                    : ""
              }
            >
              <CalendarDays size={12} />
              {t.scheduledDate === today() ? "Hoy" : dateLabel(t.scheduledDate)}
              {t.recurrence && <RefreshCw size={11} />}
            </span>
          )}
          {t.deadline && (
            <span>
              <Flag size={12} /> Límite {dateLabel(t.deadline)}
            </span>
          )}
          {t.parentId && (
            <span>
              ↳{" "}
              {tasks.find((p) => p.id === t.parentId)?.data.title ?? "Subtarea"}
            </span>
          )}
          {t.labelIds.map((id) => (
            <span className="task-label" key={id}>
              <Tag size={11} />
              {labels.find((l) => l.id === id)?.data.name}
            </span>
          ))}
        </span>
      </button>
      <span className="task-project">
        <span
          style={{
            color: projects.find((p) => p.id === t.projectId)?.data.color,
          }}
        >
          #
        </span>{" "}
        {projects.find((p) => p.id === t.projectId)?.data.name}
      </span>
      <div className="task-actions">
        <button
          className="icon-button"
          aria-label={`Opciones de ${t.title}`}
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal size={18} />
        </button>
        {menu && (
          <>
            <button
              className="menu-backdrop"
              aria-label="Cerrar opciones"
              onClick={() => setMenu(false)}
            />
            <div className="dropdown">
              <button
                onClick={() => {
                  setMenu(false);
                  onEdit();
                }}
              >
                Editar tarea
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  onSubtask();
                }}
              >
                Añadir subtarea
              </button>
              <button
                className="danger"
                onClick={() => {
                  setMenu(false);
                  onDelete();
                }}
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      className={`dialog ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
function TaskEditor({
  editor,
  projects,
  sections,
  labels,
  tasks,
  onClose,
  onSave,
}: {
  editor: Editor;
  projects: Entity<Project>[];
  sections: Entity<Section>[];
  labels: Entity<Label>[];
  tasks: TaskEntity[];
  onClose: () => void;
  onSave: (data: Task, id?: string) => Promise<void>;
}) {
  const [task, setTask] = useState<Task>(
    () =>
      editor.entity?.data ??
      taskSchema.parse({
        title: "Nueva tarea",
        projectId: editor.projectId ?? projects.find((p) => p.data.isInbox)!.id,
        sectionId: editor.sectionId ?? null,
        parentId: editor.parentId ?? null,
        scheduledDate: editor.date ?? null,
        sortOrder: Date.now(),
      }),
  );
  const [title, setTitle] = useState(editor.entity?.data.title ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<Task>) => setTask((t) => ({ ...t, ...p }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const parsed = taskSchema.parse({ ...task, title });
      await onSave(parsed, editor.entity?.id);
    } catch (e) {
      setError(
        (e as Error).message.includes("[")
          ? "Revisa los campos. La repetición necesita una fecha."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  function parseTitle() {
    let text = title;
    const lower = text.toLowerCase();
    if (/\bmañana\b/u.test(lower)) {
      patch({ scheduledDate: addDays(today(), 1) });
      text = text.replace(/\bmañana\b/iu, "");
    } else if (/\bhoy\b/i.test(text)) {
      patch({ scheduledDate: today() });
      text = text.replace(/\bhoy\b/i, "");
    }
    const p = text.match(/\bp([1-4])\b/i);
    if (p) {
      patch({ priority: Number(p[1]) });
      text = text.replace(p[0], "");
    }
    const recur = text.match(/cada (día|semana|mes)/iu);
    if (recur) {
      patch({
        scheduledDate: task.scheduledDate ?? today(),
        recurrence: {
          frequency:
            recur[1].toLowerCase() === "día"
              ? "day"
              : recur[1].toLowerCase() === "semana"
                ? "week"
                : "month",
          interval: 1,
          anchor: "calendar",
        },
      });
      text = text.replace(recur[0], "");
    }
    for (const project of projects) {
      const token = "#" + project.data.name;
      if (text.toLowerCase().includes(token.toLowerCase()) && !task.parentId) {
        patch({ projectId: project.id, sectionId: null });
        const i = text.toLowerCase().indexOf(token.toLowerCase());
        text = text.slice(0, i) + text.slice(i + token.length);
      }
    }
    const detectedLabels = new Set(task.labelIds);
    for (const label of labels)
      for (const prefix of ["%", "@"]) {
        const token = prefix + label.data.name;
        const index = text.toLowerCase().indexOf(token.toLowerCase());
        if (index >= 0) {
          detectedLabels.add(label.id);
          text = text.slice(0, index) + text.slice(index + token.length);
        }
      }
    patch({ labelIds: [...detectedLabels] });
    setTitle(text.replace(/\s+/g, " ").trim());
  }
  return (
    <Dialog
      title={
        editor.entity
          ? "Un poco más de detalle"
          : editor.parentId
            ? "Nueva subtarea"
            : "¿Qué tienes en mente?"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <input
          className="title-input"
          aria-label="Título de la tarea"
          autoFocus
          required
          maxLength={500}
          placeholder="Algo que quieras hacer…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="description-input"
          aria-label="Descripción"
          placeholder="Añade detalles, ideas o un primer paso"
          value={task.description}
          maxLength={10000}
          onChange={(e) => patch({ description: e.target.value })}
        />
        <div className="smart-helper">
          <Sparkles size={14} />
          <span>Prueba “Leer mañana p2” o “Caminar cada día”</span>
          <button type="button" onClick={parseTitle}>
            Detectar
          </button>
        </div>
        <div className="form-grid">
          <label>
            Proyecto
            <select
              value={task.projectId}
              disabled={!!task.parentId}
              onChange={(e) =>
                patch({ projectId: e.target.value, sectionId: null })
              }
            >
              {projects
                .filter((p) => !p.data.archived || p.id === task.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.data.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Sección
            <select
              value={task.sectionId ?? ""}
              onChange={(e) => patch({ sectionId: e.target.value || null })}
            >
              <option value="">Sin sección</option>
              {sections
                .filter((s) => s.data.projectId === task.projectId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.data.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Fecha para hacerla
            <input
              type="date"
              value={task.scheduledDate ?? ""}
              onChange={(e) =>
                patch({
                  scheduledDate: e.target.value || null,
                  recurrence: e.target.value ? task.recurrence : null,
                })
              }
            />
          </label>
          <label>
            Fecha límite
            <input
              type="date"
              value={task.deadline ?? ""}
              onChange={(e) => patch({ deadline: e.target.value || null })}
            />
          </label>
          <label>
            Recordatorio
            <input
              type="datetime-local"
              value={
                task.reminderAt
                  ? new Date(
                      new Date(task.reminderAt).getTime() -
                        new Date(task.reminderAt).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                patch({
                  reminderAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
            <small>
              Hora de este dispositivo. Activa los avisos en Ajustes.
            </small>
          </label>
          <label>
            Prioridad
            <select
              value={task.priority}
              onChange={(e) => patch({ priority: Number(e.target.value) })}
            >
              <option value={1}>P1 · Urgente</option>
              <option value={2}>P2 · Alta</option>
              <option value={3}>P3 · Media</option>
              <option value={4}>P4 · Normal</option>
            </select>
          </label>
          <label>
            Repetir
            <select
              value={task.recurrence?.frequency ?? ""}
              onChange={(e) =>
                patch({
                  recurrence: e.target.value
                    ? {
                        frequency: e.target.value as "day" | "week" | "month",
                        interval: 1,
                        anchor: "calendar",
                        anchorDay: Number(
                          (task.scheduledDate ?? today()).slice(-2),
                        ),
                      }
                    : null,
                  scheduledDate: e.target.value
                    ? (task.scheduledDate ?? today())
                    : task.scheduledDate,
                })
              }
            >
              <option value="">No se repite</option>
              <option value="day">Cada día</option>
              <option value="week">Cada semana</option>
              <option value="month">Cada mes</option>
            </select>
          </label>
          {task.recurrence && (
            <>
              <label>
                Intervalo
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={task.recurrence.interval}
                  onChange={(e) =>
                    patch({
                      recurrence: {
                        ...task.recurrence!,
                        interval: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Contar desde
                <select
                  value={task.recurrence.anchor}
                  onChange={(e) =>
                    patch({
                      recurrence: {
                        ...task.recurrence!,
                        anchor: e.target.value as "calendar" | "completion",
                      },
                    })
                  }
                >
                  <option value="calendar">La fecha programada</option>
                  <option value="completion">Cuando la complete</option>
                </select>
              </label>
            </>
          )}
        </div>
        {labels.length > 0 && (
          <fieldset className="labels-field">
            <legend>Etiquetas</legend>
            {labels.map((l) => (
              <label key={l.id}>
                <input
                  type="checkbox"
                  checked={task.labelIds.includes(l.id)}
                  onChange={(e) =>
                    patch({
                      labelIds: e.target.checked
                        ? [...task.labelIds, l.id]
                        : task.labelIds.filter((id) => id !== l.id),
                    })
                  }
                />
                <Tag size={13} style={{ color: l.data.color }} />
                {l.data.name}
              </label>
            ))}
          </fieldset>
        )}
        {task.parentId && (
          <p className="field-note">
            Subtarea de: {tasks.find((t) => t.id === task.parentId)?.data.title}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => patch({ parentId: null })}
            >
              Convertir en tarea independiente
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <footer className="dialog-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Guardando…"
              : editor.entity
                ? "Guardar cambios"
                : "Crear tarea"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function CreateDialog({
  kind,
  projectId,
  entity,
  onClose,
  onCreated,
}: {
  kind: "project" | "section" | "label" | "filter";
  projectId?: string;
  entity?: Entity<Project>;
  onClose: () => void;
  onCreated: (type: EntityType, id: string) => void;
}) {
  const [color, setColor] = useState(entity?.data.color ?? colors[0]);
  const [error, setError] = useState("");
  const names = {
    project: "proyecto",
    section: "sección",
    label: "etiqueta",
    filter: "filtro",
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const id = entity?.id ?? crypto.randomUUID();
    try {
      await mutate(
        kind,
        id,
        objectData(
          schemas[kind].parse({
            ...entity?.data,
            ...data,
            color,
            projectId,
            sortOrder: entity?.data.sortOrder ?? Date.now(),
          }),
        ),
      );
      onCreated(kind, id);
    } catch {
      setError("Revisa el nombre y los campos requeridos");
    }
  }
  return (
    <Dialog
      title={`${entity ? "Editar" : "Crear"} ${names[kind]}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Nombre
          <input
            autoFocus
            name="name"
            defaultValue={entity?.data.name}
            required
            maxLength={kind === "label" ? 60 : 80}
            placeholder={
              kind === "project" ? "Por ejemplo, Personal" : "Dale un nombre"
            }
          />
        </label>
        {(kind === "project" || kind === "label") && (
          <div className="color-picker" aria-label="Color">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                style={{ background: c }}
                aria-label={`Color ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              >
                {c === color && <Check size={16} />}
              </button>
            ))}
          </div>
        )}
        {kind === "filter" && (
          <label>
            Consulta
            <input name="query" required placeholder="hoy & p1" />
            <small>
              Admite hoy, vencidas, sin fecha, p1–p4, texto:palabra. Une con
              &amp; (y), | (o) y ! (no). Sin paréntesis.
            </small>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <footer className="dialog-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary">
            {entity ? "Guardar cambios" : `Crear ${names[kind]}`}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function CalendarView({
  tasks,
  onEdit,
  onAdd,
  onMove,
}: {
  tasks: TaskEntity[];
  onEdit: (e: TaskEntity) => void;
  onAdd: (date: string) => void;
  onMove: (id: string, date: string) => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7) + "-01");
  const first = new Date(month + "T12:00:00");
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(month, -offset);
  function move(by: number) {
    const d = new Date(month + "T12:00:00");
    d.setMonth(d.getMonth() + by);
    setMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }
  return (
    <div className="calendar">
      <header>
        <h2>
          {first.toLocaleDateString("es-MX", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div>
          <button
            className="icon-button"
            aria-label="Mes anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="text-button"
            onClick={() => setMonth(today().slice(0, 7) + "-01")}
          >
            Hoy
          </button>
          <button
            className="icon-button"
            aria-label="Mes siguiente"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div className="calendar-grid">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span className="weekday" key={i}>
            {d}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const date = addDays(start, i);
          return (
            <div
              key={date}
              className={`calendar-day ${date.slice(0, 7) !== month.slice(0, 7) ? "muted" : ""} ${date === today() ? "is-today" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (tasks.some((t) => t.id === id)) onMove(id, date);
              }}
            >
              <button
                className="day-number"
                aria-label={`Añadir tarea el ${dateLabel(date)}`}
                onClick={() => onAdd(date)}
              >
                {Number(date.slice(-2))}
              </button>
              {tasks
                .filter((t) => t.data.scheduledDate === date)
                .map((t) => (
                  <button
                    key={t.id}
                    className={`calendar-task p${t.data.priority}`}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", t.id)
                    }
                    onClick={() => onEdit(t)}
                  >
                    {t.data.title}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Settings({
  user,
  projects,
  trash,
  rejected,
  conflicts,
  onClose,
  onNotice,
  onLogout,
}: {
  user: User;
  projects: Entity<Project>[];
  trash: Entity[];
  rejected: Pending[];
  conflicts: Pending[];
  onClose: () => void;
  onNotice: (s: string) => void;
  onLogout: () => Promise<void>;
}) {
  const theme = useSyncExternalStore(subscribeTheme, getThemePreference);
  const [busy, setBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window)
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => setPushEnabled(!!s));
  }, []);
  async function togglePush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Este navegador no admite Web Push. En iPhone instala primero la app en la pantalla de inicio.",
        );
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await api("/notifications/unsubscribe", {
          endpoint: existing.endpoint,
        });
        await existing.unsubscribe();
        setPushEnabled(false);
        onNotice("Avisos desactivados en este dispositivo");
        return;
      }
      const { publicKey } = await api("/notifications/key");
      if (!publicKey)
        throw new Error(
          "Configura las claves VAPID en el servidor para activar los recordatorios.",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error("No se concedió permiso para notificaciones");
      const binary = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++)
        applicationServerKey[i] = binary.charCodeAt(i);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      try {
        await api("/notifications/subscribe", subscription.toJSON());
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }
      setPushEnabled(true);
      onNotice("Recordatorios activados en este dispositivo");
    } catch (e) {
      onNotice((e as Error).message);
    }
  }
  async function download() {
    const data = await exportBackup();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulso-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      onNotice("El respaldo supera 20 MB");
      return;
    }
    if (
      !confirm(
        "Se combinará el respaldo con tus tareas actuales. Los registros existentes se actualizarán y los demás se conservarán. ¿Continuar?",
      )
    )
      return;
    setBusy(true);
    try {
      await restoreBackup(JSON.parse(await file.text()));
      onNotice("Respaldo restaurado. Sincronizando cambios.");
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Tu espacio, a tu manera" onClose={onClose} wide>
      <div className="settings-body">
        <div className="profile-card">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
          </div>
          <span className="personal-badge">PERSONAL</span>
        </div>
        <fieldset className="theme-picker">
          <legend>Apariencia</legend>
          <p>Elige cómo se ve Pulso en este dispositivo.</p>
          <div className="theme-options">
            {([
              ["light", "Claro", Sun],
              ["dark", "Oscuro", Moon],
              ["system", "Sistema", Monitor],
            ] as const).map(([value, label, Icon]) => (
              <label className="theme-option" key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => setThemePreference(value)}
                />
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <small>
            Sistema sigue automáticamente la apariencia de tu dispositivo.
          </small>
        </fieldset>
        <h3>Datos y respaldos</h3>
        <p>
          La sincronización mantiene tus dispositivos al día. Un respaldo te
          permite recuperar versiones anteriores. Guarda una copia fuera de este
          servidor.
        </p>
        <div className="settings-actions">
          <button
            className="secondary"
            onClick={() => {
              void download();
            }}
          >
            <Download size={17} /> Exportar respaldo
          </button>
          <label className="secondary file-button">
            <Upload size={17} />
            {busy ? "Restaurando…" : "Restaurar respaldo"}
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <h3>Recordatorios</h3>
        <p>
          Recibe avisos de las tareas con recordatorio en este dispositivo.
          Requiere permisos del navegador y claves Web Push configuradas en el
          servidor.
        </p>
        <button
          className="secondary"
          onClick={() => {
            void togglePush();
          }}
        >
          <Bell size={17} />{" "}
          {pushEnabled ? "Desactivar avisos aquí" : "Activar avisos aquí"}
        </button>
        <h3>Instala Pulso</h3>
        <p>
          En Safari para Mac: Archivo → Añadir al Dock. En iPhone: Compartir →
          Añadir a pantalla de inicio. En Chrome o Android usa la opción
          Instalar aplicación del navegador.
        </p>
        {projects.some((p) => p.data.archived) && (
          <>
            <h3>Proyectos archivados</h3>
            {projects
              .filter((p) => p.data.archived)
              .map((p) => (
                <div className="archive-item" key={p.id}>
                  <span>{p.data.name}</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      void mutate("project", p.id, { archived: false });
                    }}
                  >
                    Recuperar
                  </button>
                </div>
              ))}
          </>
        )}
        {rejected.length > 0 && (
          <>
            <h3>Cambios que necesitan revisión</h3>
            {rejected.map((op) => (
              <div className="conflict" key={op.id}>
                <strong>
                  {String(
                    op.patch.title ??
                      op.base.title ??
                      op.base.name ??
                      "Cambio pendiente",
                  )}
                </strong>
                <p>{op.rejected}</p>
                <p>
                  Puedes descartar este cambio, corregir la tarea y volver a
                  guardarla. La alternativa local se conserva en tu respaldo.
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    if (
                      confirm(
                        "¿Descartar los cambios pendientes de este registro y recuperar su versión del servidor?",
                      )
                    )
                      void discardRejected(op.entityId).catch((e) =>
                        onNotice(e.message),
                      );
                  }}
                >
                  Recuperar versión del servidor
                </button>
              </div>
            ))}
          </>
        )}
        {trash.length > 0 && (
          <>
            <h3>Papelera</h3>
            <p>
              Recupera primero los proyectos y las tareas padre si también
              fueron eliminados.
            </p>
            {trash.map((e) => (
              <div className="archive-item" key={e.id}>
                <span>
                  {String((e.data as any).title ?? (e.data as any).name)}
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    void mutate(e.type, e.id, {}, "restore").catch((error) =>
                      onNotice(error.message),
                    );
                  }}
                >
                  Recuperar
                </button>
              </div>
            ))}
          </>
        )}
        {conflicts.length > 0 && (
          <>
            <h3>Resolver cambios simultáneos</h3>
            <p>
              Elige qué versión conservar. Pulso guarda también las alternativas
              en el respaldo local.
            </p>
            {conflicts.map((op) => (
              <div className="conflict" key={op.id}>
                <strong>
                  {String(
                    op.patch.title ??
                      op.base.title ??
                      op.base.name ??
                      "Registro modificado",
                  )}
                </strong>
                <p>Campos: {op.conflict!.fields.join(", ")}</p>
                <pre>
                  {JSON.stringify(
                    {
                      servidor: op.conflict!.server.data,
                      misCambios: op.patch,
                    },
                    null,
                    2,
                  )}
                </pre>
                <div className="settings-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      void resolveConflict(op.id, "server").catch((e) =>
                        onNotice(e.message),
                      );
                    }}
                  >
                    Conservar servidor
                  </button>
                  <button
                    className="primary"
                    disabled={!!op.conflict!.server.deletedAt}
                    onClick={() => {
                      void resolveConflict(op.id, "local").catch((e) =>
                        onNotice(e.message),
                      );
                    }}
                  >
                    Conservar mis cambios
                  </button>
                </div>
                {op.conflict!.server.deletedAt && (
                  <small>
                    El registro fue eliminado en otro dispositivo. La
                    alternativa local permanece en tu respaldo.
                  </small>
                )}
              </div>
            ))}
          </>
        )}
        <div className="settings-logout">
          <span>Pulso · Versión 0.1.0</span>
          <button
            className="text-button"
            onClick={() => {
              void onLogout();
            }}
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>
    </Dialog>
  );
}
