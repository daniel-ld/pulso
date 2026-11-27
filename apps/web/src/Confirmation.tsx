import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  LogOut,
  RotateCcw,
  Trash2,
  Unplug,
  X,
} from "lucide-react";

type ConfirmationOptions = {
  title: string;
  description: string;
  subject?: string;
  confirmLabel: string;
  icon?: "trash" | "restore" | "logout" | "disconnect" | "warning";
  tone?: "neutral" | "danger";
};
type Request = {
  id: number;
  options: ConfirmationOptions;
  resolve: (confirmed: boolean) => void;
  trigger: HTMLElement | null;
  fallback: HTMLElement | null;
};
const Context = createContext<
  ((options: ConfirmationOptions) => Promise<boolean>) | null
>(null);

export function useConfirmation() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error("ConfirmationProvider is required");
  return confirm;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const queue = useRef<Request[]>([]);
  const nextId = useRef(0);
  const [active, setActive] = useState<Request | null>(null);
  const confirm = useCallback(
    (options: ConfirmationOptions) =>
      new Promise<boolean>((resolve) => {
        const trigger =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const fallback =
          trigger
            ?.closest(".task-row")
            ?.querySelector<HTMLElement>(".task-actions .icon-button") ?? null;
        const request = {
          id: ++nextId.current,
          options,
          resolve,
          trigger,
          fallback,
        };
        queue.current.push(request);
        if (queue.current.length === 1) setActive(request);
      }),
    [],
  );
  useEffect(
    () => () => {
      queue.current.splice(0).forEach((request) => request.resolve(false));
    },
    [],
  );
  function settle(request: Request, confirmed: boolean) {
    if (queue.current[0] !== request) return;
    queue.current.shift();
    setActive(queue.current[0] ?? null);
    request.resolve(confirmed);
  }
  return (
    <Context.Provider value={confirm}>
      {children}
      {active && (
        <ConfirmationDialog
          key={active.id}
          request={active}
          onDecision={(confirmed) => settle(active, confirmed)}
        />
      )}
    </Context.Provider>
  );
}

function ConfirmationDialog({
  request,
  onDecision,
}: {
  request: Request;
  onDecision: (confirmed: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decided = useRef(false);
  const headingId = useId();
  const subjectId = useId();
  const descriptionId = useId();
  const { options } = request;
  const Icon = {
    trash: Trash2,
    restore: RotateCcw,
    logout: LogOut,
    disconnect: Unplug,
    warning: AlertTriangle,
  }[options.icon ?? "warning"];
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      const target = request.trigger?.isConnected
        ? request.trigger
        : request.fallback;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [request]);
  function finish(confirmed: boolean) {
    if (decided.current) return;
    decided.current = true;
    dialogRef.current?.close();
    onDecision(confirmed);
  }
  return (
    <dialog
      ref={dialogRef}
      className={`dialog confirmation-dialog ${options.tone === "danger" ? "confirmation-danger" : ""}`}
      role="alertdialog"
      aria-labelledby={headingId}
      aria-describedby={
        options.subject ? `${subjectId} ${descriptionId}` : descriptionId
      }
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) finish(false);
      }}
    >
      <div className="confirmation-body">
        <button
          type="button"
          className="icon-button confirmation-close"
          aria-label="Cerrar confirmación"
          onClick={() => finish(false)}
        >
          <X size={20} />
        </button>
        <span className="confirmation-symbol">
          <Icon size={24} aria-hidden="true" />
        </span>
        <h2 id={headingId}>{options.title}</h2>
        {options.subject && (
          <p id={subjectId} className="confirmation-subject">
            {options.subject}
          </p>
        )}
        <p id={descriptionId} className="confirmation-description">
          {options.description}
        </p>
        <div className="confirmation-actions">
          <button
            type="button"
            ref={cancelRef}
            className="secondary"
            onClick={() => finish(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => finish(true)}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
