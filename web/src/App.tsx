import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  FolderOpen,
  KeyRound,
  Layers3,
  LoaderCircle,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
  Zap
} from "lucide-react";
import { api, list, message, unwrap } from "./lib/api";

type User = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

type Provider = {
  id: string;
  name: string;
  auth: {
    type: string;
    fields: {
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      secret?: boolean;
      default?: string;
    }[];
  };
  docsUrl: string;
  limitations?: string;
};

type Connection = {
  id: string;
  providerId: string;
  name: string;
  summary?: { kind?: string; hint?: string };
  credentialSummary?: { kind?: string; hint?: string };
  credentials?: { hint?: string };
  hint?: string;
  lastTest?: { ok?: boolean; latencyMs?: number };
  lastTestOk?: boolean | null;
};

type Model = { id: string; label?: string };

type Settings = {
  duration: number;
  aspect: "16:9" | "9:16" | "1:1";
  resolution: "1080p" | "2160p";
  stylePreset: string;
  extraInstructions: string;
  sfx: boolean;
  music: { enabled: boolean };
};

type Project = {
  id: string;
  title: string;
  prompt?: string;
  settings?: Partial<Settings>;
  connectionId?: string;
  model?: string;
  status?: string;
  updatedAt?: string;
  updated_at?: string;
  thumbnail?: string;
};

type Composition = {
  id: string;
  version?: number;
  status?: string;
  validation?: unknown;
};

type Job = {
  id: string;
  status: string;
  progress: number;
  stage?: string;
  error?: string | { message?: string };
  output?: { path?: string | null; url?: string | null; meta?: unknown } | null;
};

const defaults: Settings = {
  duration: 15,
  aspect: "16:9",
  resolution: "1080p",
  stylePreset: "Ember",
  extraInstructions: "",
  sfx: true,
  music: { enabled: false }
};

function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function useRoute() {
  const [route, setRoute] = useState(
    window.location.pathname + window.location.search
  );
  useEffect(() => {
    const update = () =>
      setRoute(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return route;
}

function Link({
  to,
  children,
  className = "",
  ...rest
}: {
  to: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}

type Toast = { id: number; text: string; error: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(
  () => {}
);

function Toasts({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const add = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, text, error }]);
    timers.current.push(
      setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 6500)
    );
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div className={`toast ${item.error ? "is-error" : ""}`} key={item.id}>
            {item.error ? <X size={18} /> : <CheckCircle2 size={18} />}
            <span>{item.text}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() =>
                setItems((current) => current.filter((t) => t.id !== item.id))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

type Session = {
  user: User | null;
  loading: boolean;
  error: string;
  setUser: (user: User | null) => void;
  refresh: () => void;
};
const AuthContext = createContext<Session>({
  user: null,
  loading: true,
  error: "",
  setUser: () => {},
  refresh: () => {}
});

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    api<{ user: User | null }>("/auth/me")
      .then((data) => setUser(data.user))
      .catch((err) => setError(message(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener("onetake:unauthorized", expire);
    return () => window.removeEventListener("onetake:unauthorized", expire);
  }, []);
  return (
    <AuthContext.Provider value={{ user, setUser, loading, error, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

function ThemeButton({ label = false }: { label?: boolean }) {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme ?? "dark"
  );
  return (
    <button
      className={label ? "nav-item theme-button" : "icon-button"}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("onetake-theme", next);
        } catch {
          // Theme still works when storage is unavailable.
        }
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
      {label && <span>{theme === "dark" ? "Light appearance" : "Dark appearance"}</span>}
    </button>
  );
}

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="ONETAKE STUDIO home">
      <span className="brand-symbol"><span /><span /><span /></span>
      <span>ONETAKE<span className="brand-studio">STUDIO</span></span>
    </Link>
  );
}

function Spinner() {
  return <LoaderCircle size={17} className="spin" aria-hidden="true" />;
}

function ErrorBanner({ text }: { text?: string }) {
  return text ? <div className="error-banner" role="alert">{text}</div> : null;
}

function Skeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="card-grid" aria-label="Loading" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton block" />
          <div className="skeleton line" />
          <div className="skeleton line short" />
        </div>
      ))}
    </div>
  );
}

function Empty({
  title,
  text,
  children
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Layers3 size={26} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

function Dialog({
  title,
  children,
  close
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          ) close();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Confirm({
  title,
  description,
  action,
  close
}: {
  title: string;
  description: string;
  action: () => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog title={title} close={() => !busy && close()}>
      <p className="muted">{description}</p>
      <ErrorBanner text={error} />
      <div className="actions end">
        <button className="button secondary" disabled={busy} onClick={close}>
          Keep it
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await action();
              close();
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : <Trash2 size={16} />} Delete
        </button>
      </div>
    </Dialog>
  );
}

function Landing() {
  const { user } = useContext(AuthContext);
  const start = user ? "/app" : "/signup";
  return (
    <div className="landing">
      <header className="marketing-nav">
        <Brand />
        <nav className="marketing-links" aria-label="Main navigation">
          <a href="#workflow">How it works</a>
          <a href="#features">Made for creators</a>
          <a href="#cost">Your cost, clearly</a>
        </nav>
        <div className="actions">
          <ThemeButton />
          <Link to={user ? "/app" : "/login"} className="login-link">
            {user ? "Workspace" : "Log in"}
          </Link>
          <Link to={start} className="button small">Start creating <ArrowUpRight size={15} /></Link>
        </div>
      </header>

      <main>
        <section className="hero section-wrap">
          <div className="eyebrow"><span className="live-dot" /> A little less production. A lot more possibility.</div>
          <h1>Good ideas deserve<br />to <span className="accent">move.</span></h1>
          <p className="hero-description">
            Turn a thought into a beautifully composed video.<br className="desktop-only" />
            Bring your AI provider. Keep your creative freedom.
          </p>
          <div className="actions center">
            <Link to={start} className="button large">Make your first video <ArrowRight size={18} /></Link>
            <a href="#workflow" className="button secondary large"><Play size={16} /> See how it works</a>
          </div>
          <p className="hero-note"><ShieldCheck size={14} /> Your keys. Your credits. Local rendering.</p>

          <div className="hero-workbench">
            <div className="workbench-chrome">
              <span className="chrome-dots"><i /><i /><i /></span>
              <span>an idea, taking shape</span>
              <span className="tiny-tag"><span className="live-dot" /> ONETAKE</span>
            </div>
            <div className="demo-layout">
              <div className="demo-composer">
                <span className="eyebrow"><Sparkles size={13} /> THE BRIEF</span>
                <p>A bold launch film for a coffee brand.<br />Warm light. Slow mornings.<br />Something worth waking up for.</p>
                <div className="demo-tags"><span>15 seconds</span><span>16:9</span><span>Ember</span></div>
                <div className="demo-generate"><Check size={16} /> Composition ready <span>01</span></div>
              </div>
              <div className="demo-film">
                <span className="film-caption">SMALL RITUALS. BIG DAYS.</span>
                <div className="orbital orbital-one" />
                <div className="orbital orbital-two" />
                <div className="coffee-word">RISE<br /><span>& SHINE.</span></div>
                <span className="film-bottom">A BETTER KIND OF EVERYDAY.</span>
                <span className="film-time">00:08 / 00:15</span>
              </div>
            </div>
            <div className="demo-timeline">
              <Play size={13} /><span className="timeline-track"><i /></span>
              <span>15.0s</span><span className="tiny-tag">1080p</span>
            </div>
          </div>
          <div className="hero-footnote">FROM THE FIRST SPARK TO THE FINAL FRAME</div>
        </section>

        <section className="section-wrap section-space" id="workflow">
          <div className="section-heading">
            <div><span className="eyebrow">A SHORTER PATH TO PLAY</span><h2>Three steps. One take.</h2></div>
            <p>No timeline wrestling.<br />Just an idea and a little direction.</p>
          </div>
          <div className="three-grid">
            {[
              { icon: KeyRound, title: "Bring your intelligence.", text: "Connect your preferred AI provider securely. Choose the model that fits your idea and your budget." },
              { icon: Sparkles, title: "Tell us what you see.", text: "Describe the story, set the mood, and pick a format. Your prompt becomes a motion composition." },
              { icon: Film, title: "Make it a moving picture.", text: "Preview, refine, and render an MP4 locally. Ready for your feed, your launch, or your next big thing." }
            ].map((step, index) => (
              <article className="step-card" key={step.title}>
                <div className="step-top"><step.icon size={24} /><span>0{index + 1}</span></div>
                <h3>{step.title}</h3><p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-section section-space" id="features">
          <div className="section-wrap">
            <span className="eyebrow">LESS FRICTION. MORE FEELING.</span>
            <h2>A small studio.<br />A surprisingly big toolkit.</h2>
            <div className="feature-grid">
              {[
                [Monitor, "Every frame, your format.", "Landscape, portrait, or square. Draft in 1080p and finish in 2160p."],
                [Layers3, "A look that feels like you.", "Six distinct style directions, plus space for your own creative instructions."],
                [AudioLines, "Give your story a sound.", "Generated sound effects and your own background music, mixed into the render."],
                [ShieldCheck, "Your credentials stay yours.", "Encrypted connections. Masked keys. No provider lock-in."]
              ].map(([Icon, title, text]) => {
                const FeatureIcon = Icon as typeof Monitor;
                return (
                  <article className="feature-card" key={String(title)}>
                    <FeatureIcon size={25} /><h3>{String(title)}</h3><p>{String(text)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section-wrap section-space" id="cost">
          <div className="cost-card">
            <div>
              <span className="eyebrow">NO MYSTERY MATH</span>
              <h2>Creative control.<br />Cost control, too.</h2>
              <p>Composition generation uses your own AI provider credits, at that provider’s rates. Rendering runs locally—there is no paid video-generation API behind the curtain.</p>
              <p className="muted small-text">Provider charges and local compute requirements still apply. Model availability and limits depend on your connected provider.</p>
            </div>
            <div className="cost-receipt">
              <div><KeyRound size={18} /><span>AI composition</span><strong>Your provider</strong></div>
              <div><Monitor size={18} /><span>Video rendering</span><strong>Your machine</strong></div>
              <div><ShieldCheck size={18} /><span>Creative ownership</span><strong>Your work</strong></div>
              <Link to={start} className="button full">Open your studio <ArrowRight size={17} /></Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="marketing-footer section-wrap">
        <Brand />
        <p>Built for ideas that won’t sit still.</p>
        <p className="license-note">Powered by the OneTake engine, licensed under PolyForm Noncommercial. Engine license terms apply; see the bundled engine/LICENSE.</p>
      </footer>
    </div>
  );
}

function AuthPage({ signup }: { signup: boolean }) {
  const { setUser, user } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user) navigate("/app", true);
  }, [user]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();
    if (signup && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (signup && !name) {
      setError("Please enter your name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(`/auth/${signup ? "signup" : "login"}`, {
        method: "POST",
        body: { email, password, ...(signup ? { name } : {}) }
      });
      setUser(result.user);
      navigate("/app", true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header className="auth-header"><Brand /><ThemeButton /></header>
      <main className="auth-main">
        <div className="auth-story">
          <span className="eyebrow">YOUR NEXT IDEA STARTS HERE</span>
          <h1>A thought.<br />A spark.<br /><span className="accent">A first frame.</span></h1>
          <p>A quiet place to make something that moves people.</p>
          <div className="auth-art"><span>MAKE<br />IT MOVE.</span><ArrowUpRight size={64} /></div>
        </div>
        <section className="auth-card">
          <span className="eyebrow">ONETAKE STUDIO</span>
          <h2>{signup ? "Make room for your ideas." : "Back for another take?"}</h2>
          <p className="muted">{signup ? "Create your account. Your studio is waiting." : "Sign in to pick up where inspiration left off."}</p>
          <form onSubmit={submit}>
            {signup && (
              <label>Your name<input name="name" autoComplete="name" maxLength={100} required placeholder="Alex Morgan" /></label>
            )}
            <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
            <label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : 1} maxLength={200} required placeholder={signup ? "At least 8 characters" : "Your password"} /></label>
            <ErrorBanner text={error} />
            <button className="button full" disabled={busy}>
              {busy ? <Spinner /> : <ArrowRight size={18} />}
              {busy ? "One moment…" : signup ? "Create your studio" : "Enter your studio"}
            </button>
          </form>
          <p className="auth-switch">
            {signup ? "Already have a studio? " : "New around here? "}
            <Link to={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Create an account"}</Link>
          </p>
          <p className="fine-print"><ShieldCheck size={15} /> A private, cookie-based session. No keys in your browser storage.</p>
        </section>
      </main>
    </div>
  );
}

const navItems = [
  { to: "/app/projects", label: "Projects", icon: FolderOpen },
  { to: "/app", label: "New video", icon: Plus },
  { to: "/app/providers", label: "Providers", icon: KeyRound },
  { to: "/app/settings", label: "Settings", icon: Settings2 }
];

function Shell({ route, children }: { route: string; children: ReactNode }) {
  const { user, setUser } = useContext(AuthContext);
  const toast = useContext(ToastContext);
  const [loggingOut, setLoggingOut] = useState(false);
  const path = route.split("?")[0];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">YOUR CREATIVE SPACE</div>
        <nav aria-label="Workspace">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-item ${path === item.to ? "active" : ""}`}>
              <item.icon size={19} /><span>{item.label}</span>
              {path === item.to && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note"><span className="live-dot" /><span>Local rendering.<br /><strong>Limitless possibility.</strong></span></div>
          <ThemeButton label />
          <div className="user-chip">
            <span className="avatar">{user?.name?.slice(0, 1).toUpperCase() || "U"}</span>
            <div><strong>{user?.name || "Creator"}</strong><span>{user?.email}</span></div>
            <button
              className="icon-button"
              aria-label="Log out"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                try {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  navigate("/login");
                } catch (err) {
                  toast(message(err), true);
                } finally {
                  setLoggingOut(false);
                }
              }}
            >{loggingOut ? <Spinner /> : <LogOut size={17} />}</button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="workspace-topbar">
          <div className="mobile-brand"><Brand /></div>
          <span className="desktop-only topbar-breadcrumb">Your studio <ChevronRight size={14} /> {navItems.find((item) => item.to === path)?.label ?? "Workspace"}</span>
          <div className="actions">
            <span className="topbar-note"><span className="live-dot" /> MAKE SOMETHING GOOD</span>
            <span className="mobile-theme"><ThemeButton /></span>
          </div>
        </header>
        <main className="workspace-main">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile workspace navigation">
        {navItems.map((item) => (
          <Link to={item.to} key={item.to} className={path === item.to ? "active" : ""}>
            <item.icon size={20} /><span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {children}
    </div>
  );
}

const examples = [
  "A bold 15-second launch film for a sustainable coffee brand. Warm colors, oversized typography, and a slow morning feel.",
  "Explain how solar panels work with playful paper-cut shapes, clear labels, and a satisfying final reveal.",
  "A minimal product teaser for a new running shoe. Kinetic type, confident pacing, and an energetic finish."
];

function validationErrors(validation: unknown): string[] {
  if (!validation) return [];
  if (Array.isArray(validation)) {
    return validation.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item)
    );
  }
  if (typeof validation === "object") {
    const value = validation as { errors?: unknown; valid?: boolean; ok?: boolean; message?: string };
    if (Array.isArray(value.errors)) return validationErrors(value.errors);
    if (value.message && (value.valid === false || value.ok === false)) return [value.message];
  }
  return [];
}

function Workspace({ route }: { route: string }) {
  const projectId = new URLSearchParams(route.split("?")[1]).get("project");
  const toast = useContext(ToastContext);
  const [project, setProject] = useState<Project | null>(null);
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [composition, setComposition] = useState<Composition | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [opening, setOpening] = useState(Boolean(projectId));
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [modelRefresh, setModelRefresh] = useState(0);
  const generationRef = useRef(false);
  const autoRenderRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setConnectionsLoading(true);
    api("/connections")
      .then((data) => {
        if (!live) return;
        const values = list<Connection>(data, "connections");
        setConnections(values);
        if (!projectId && values.length) setConnectionId(values[0].id);
      })
      .catch((err) => live && setConnectionsError(message(err)))
      .finally(() => live && setConnectionsLoading(false));
    return () => { live = false; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setPrompt("");
      setSettings(defaults);
      setComposition(null);
      setJob(null);
      setMusic(null);
      setOpening(false);
      return;
    }
    let live = true;
    setOpening(true);
    setError("");
    Promise.all([
      api(`/projects/${encodeURIComponent(projectId)}`),
      api(`/projects/${encodeURIComponent(projectId)}/compositions`),
      api(`/projects/${encodeURIComponent(projectId)}/jobs`)
    ]).then(([projectData, compositionData, jobData]) => {
      if (!live) return;
      const loaded = unwrap<Project>(projectData, "project");
      setProject(loaded);
      setPrompt(loaded.prompt ?? "");
      setSettings({ ...defaults, ...loaded.settings });
      setConnectionId(loaded.connectionId ?? "");
      setModel(loaded.model ?? "");
      setComposition(list<Composition>(compositionData, "compositions")[0] ?? null);
      setJob(list<Job>(jobData, "jobs")[0] ?? null);
    }).catch((err) => live && setError(message(err)))
      .finally(() => live && setOpening(false));
    return () => { live = false; };
  }, [projectId]);

  useEffect(() => {
    if (!connectionId) {
      setModels([]);
      setModel("");
      return;
    }
    let live = true;
    setModelsLoading(true);
    setModelsError("");
    setModels([]);
    api<{ models: Model[] }>(`/connections/${encodeURIComponent(connectionId)}/models`)
      .then((data) => {
        if (!live) return;
        setModels(data.models);
        setModel((previous) =>
          data.models.some((item) => item.id === previous)
            ? previous
            : data.models[0]?.id ?? ""
        );
      })
      .catch((err) => {
        if (live) {
          setModelsError(message(err));
          setModel("");
        }
      })
      .finally(() => live && setModelsLoading(false));
    return () => { live = false; };
  }, [connectionId, modelRefresh]);

  const activeJob = job?.status === "queued" || job?.status === "running";
  const generating = composition?.status === "generating";

  useEffect(() => {
    if (!job?.id || !activeJob) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await api<{ job: Job }>(`/jobs/${encodeURIComponent(job.id)}`);
        if (!live) return;
        const prevStatus = job.status;
        setJob((previous) => ({ ...previous, ...data.job, id: data.job.id ?? job.id }));
        if (prevStatus !== "succeeded" && data.job.status === "succeeded") {
          toast("Your video is ready.");
        }
        setPollError("");
      } catch (err) {
        if (live) setPollError(message(err));
      } finally {
        if (live) timer = setTimeout(poll, 2000);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { live = false; clearTimeout(timer); };
  }, [job?.id, activeJob]);

  // Keep polling composition while LLM generation runs in the background —
  // user can leave and return; work continues on the server.
  useEffect(() => {
    if (!composition?.id || !generating) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await api<{ composition: Composition }>(
          `/compositions/${encodeURIComponent(composition.id)}`
        );
        if (!live) return;
        const next = data.composition;
        setComposition((previous) => ({ ...previous, ...next, id: next.id ?? composition.id }));
        if (next.status === "ok") {
          toast("Your composition is ready for a first look.");
        }
        setPollError("");
      } catch (err) {
        if (live) setPollError(message(err));
      } finally {
        if (live) timer = setTimeout(poll, 2500);
      }
    };
    timer = setTimeout(poll, 2500);
    return () => { live = false; clearTimeout(timer); };
  }, [composition?.id, generating]);

  // Auto-render when composition becomes ready (once per composition id)
  useEffect(() => {
    if (!project || !composition?.id) return;
    if (composition.status !== "ok") return;
    if (autoRenderRef.current === composition.id) return;
    if (job && (job.status === "queued" || job.status === "running" || job.status === "succeeded")) return;
    autoRenderRef.current = composition.id;
    let cancelled = false;
    (async () => {
      try {
        setRenderBusy(true);
        const result = await api<{ job: Job }>(
          `/projects/${encodeURIComponent(project.id)}/render`,
          {
            method: "POST",
            body: {
              compositionId: composition.id,
              resolution: settings.resolution === "2160p" ? "final" : "draft"
            }
          }
        );
        if (!cancelled && mounted.current) {
          setJob(result.job);
          toast("Rendering your MP4 in the background…");
        }
      } catch (err) {
        if (!cancelled && mounted.current) {
          setError(message(err));
          autoRenderRef.current = null; // allow retry
        }
      } finally {
        if (mounted.current) setRenderBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [composition?.id, composition?.status, project?.id]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }

  async function generate(regenerate = false) {
    if (!prompt.trim() || !connectionId || !model || generationRef.current) return;
    generationRef.current = true;
    setBusy(true);
    setError("");
    try {
      let target = project;
      // A new project preserves the prompt, provider and model contract because
      // PATCH intentionally accepts only title/settings.
      if (
        !target ||
        target.prompt !== prompt.trim() ||
        target.connectionId !== connectionId ||
        target.model !== model
      ) {
        target = unwrap<Project>(
          await api("/projects", {
            method: "POST",
            body: {
              title: prompt.trim().slice(0, 64),
              prompt: prompt.trim(),
              settings: { ...settings, music: { enabled: Boolean(music) || settings.music.enabled } },
              connectionId,
              model
            }
          }),
          "project"
        );
        if (mounted.current) setProject(target);
        regenerate = false;
      } else {
        await api(`/projects/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          body: { settings }
        });
      }
      if (music) {
        const body = new FormData();
        body.append("file", music);
        await api(`/projects/${encodeURIComponent(target.id)}/music`, { method: "POST", body });
      }
      const result = await api<{ composition: Composition }>(
        `/projects/${encodeURIComponent(target.id)}/${regenerate ? "regenerate" : "generate"}`,
        { method: "POST" }
      );
      if (mounted.current) {
        setComposition(result.composition);
        setJob(null);
        toast(
          result.composition?.status === "generating"
            ? "Generation started — you can leave; it keeps running on the server."
            : "Your composition is ready for a first look."
        );
      }
    } catch (err) {
      if (mounted.current) setError(message(err));
    } finally {
      generationRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function render(retry = false) {
    if (!project || !composition) return;
    setRenderBusy(true);
    setError("");
    try {
      const result = await api<{ job: Job }>(
        retry && job
          ? `/jobs/${encodeURIComponent(job.id)}/retry`
          : `/projects/${encodeURIComponent(project.id)}/render`,
        {
          method: "POST",
          ...(retry ? {} : {
            body: {
              compositionId: composition.id,
              resolution: settings.resolution === "2160p" ? "final" : "draft"
            }
          })
        }
      );
      setJob(result.job);
    } catch (err) {
      setError(message(err));
    } finally {
      setRenderBusy(false);
    }
  }

  const errors = validationErrors(composition?.validation);
  const failedComposition = composition?.status === "failed" || errors.length > 0;
  const locked = busy || generating || Boolean(activeJob) || renderBusy;
  const jobError = typeof job?.error === "string" ? job.error : job?.error?.message;

  if (opening) return <><PageHeading eyebrow="YOUR STUDIO" title="Opening your project…" description="Gathering the latest composition and render." /><Skeletons count={2} /></>;

  return (
    <>
      <PageHeading eyebrow="FROM THOUGHT TO FIRST FRAME" title={project ? "A little direction. A lot of possibility." : "What are we making today?"} description="Start with an idea. We’ll help it find its motion.">
        <span className="quiet-badge"><span className="live-dot" /> YOUR CREATIVE SPACE</span>
      </PageHeading>
      <div className="workspace-columns">
        <section className="panel composer-panel">
          <div className="panel-title"><span><Sparkles size={19} /> The creative brief</span><span className="small-text muted">01 / CREATE</span></div>
          <label className="prompt-label" htmlFor="prompt">Describe your video</label>
          <textarea
            id="prompt"
            className="prompt-input"
            value={prompt}
            maxLength={4000}
            disabled={locked}
            placeholder="A product launch. A story worth telling. A big idea in fifteen seconds…"
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className="prompt-meta"><span>Be specific about the story, mood, and motion.</span><span>{prompt.length.toLocaleString()} / 4,000</span></div>
          <div className="example-chips">
            <span className="small-text muted">A little inspiration</span>
            {["Coffee launch", "Solar, simply", "Product teaser"].map((label, i) => (
              <button className="chip" key={label} disabled={locked} onClick={() => setPrompt(examples[i])}>{label}<ArrowUpRight size={12} /></button>
            ))}
          </div>
          <fieldset disabled={locked} className="composer-fields">
            <legend className="sr-only">Composition settings</legend>
            <div className="field-grid">
              <label>Duration<select value={settings.duration} onChange={(event) => update("duration", Number(event.target.value))}>{[10, 15, 20, 30].map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></label>
              <label>Resolution<select value={settings.resolution} onChange={(event) => update("resolution", event.target.value as Settings["resolution"])}><option value="1080p">1080p · Draft</option><option value="2160p">2160p · Final</option></select></label>
            </div>
            <div className="field-label">Frame your story</div>
            <div className="aspect-options" role="group" aria-label="Aspect ratio">
              {(["16:9", "9:16", "1:1"] as const).map((aspect) => (
                <button type="button" className={settings.aspect === aspect ? "aspect-option selected" : "aspect-option"} key={aspect} aria-pressed={settings.aspect === aspect} onClick={() => update("aspect", aspect)}>
                  <span className={`shape shape-${aspect.replace(":", "-")}`} /><span>{aspect}</span><span className="aspect-name">{aspect === "16:9" ? "Landscape" : aspect === "9:16" ? "Portrait" : "Square"}</span>
                </button>
              ))}
            </div>
            <div className="field-grid">
              <label>Visual direction<select value={settings.stylePreset} onChange={(event) => update("stylePreset", event.target.value)}>{["Paper", "Dusk", "Ultramarine", "Riso", "Ember"].map((style) => <option key={style}>{style}</option>)}</select></label>
              <label>Extra direction <span className="optional">optional</span><input value={settings.extraInstructions} maxLength={1000} placeholder="Keep it bold and minimal…" onChange={(event) => update("extraInstructions", event.target.value)} /></label>
            </div>
            <div className="sound-row">
              <div><AudioLines size={19} /><span><strong>Sound effects</strong><small>A little extra atmosphere</small></span></div>
              <button type="button" className={`switch ${settings.sfx ? "on" : ""}`} role="switch" aria-checked={settings.sfx} aria-label="Sound effects" onClick={() => update("sfx", !settings.sfx)}><span /></button>
            </div>
            <label className="upload-zone">
              <Upload size={18} /><span>{music ? music.name : settings.music.enabled ? "Background music attached · replace file" : "Add your own background music"}<small>MP3 or WAV · up to 20 MB</small></span>
              <input
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 20 * 1024 * 1024 || !/\.(mp3|wav)$/i.test(file.name)) {
                    setError("Choose an MP3 or WAV file no larger than 20 MB.");
                    event.target.value = "";
                    return;
                  }
                  setMusic(file);
                  update("music", { enabled: true });
                  setError("");
                }}
              />
            </label>
            {music && <button className="text-button" type="button" onClick={() => { setMusic(null); update("music", { enabled: false }); }}>Remove selected music</button>}
          </fieldset>
          <div className="provider-area">
            <div className="panel-title compact"><span><KeyRound size={16} /> Your intelligence</span><Link to="/app/providers" className="text-link">Manage <ArrowUpRight size={13} /></Link></div>
            <ErrorBanner text={connectionsError || modelsError} />
            {connectionsLoading ? <div className="skeleton line" /> : connections.length ? (
              <div className="field-grid">
                <label>Connection<select disabled={locked} value={connectionId} onChange={(event) => setConnectionId(event.target.value)}><option value="" disabled>Choose a connection</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name || connection.providerId}</option>)}</select></label>
                <label><span className="label-with-action">Model<button type="button" className="icon-button tiny" aria-label="Refresh available models" disabled={!connectionId || modelsLoading || locked} onClick={() => setModelRefresh((value) => value + 1)}><RefreshCw size={13} className={modelsLoading ? "spin" : ""} /></button></span><select disabled={locked || modelsLoading || !models.length} value={model} onChange={(event) => setModel(event.target.value)}><option value="" disabled>{modelsLoading ? "Finding your models…" : "Select a model"}</option>{models.map((item) => <option value={item.id} key={item.id}>{item.label || item.id}</option>)}</select></label>
              </div>
            ) : (
              <div className="connection-empty"><p>Great videos start with a connection. Bring your preferred AI provider.</p><Link to="/app/providers" className="button secondary small"><Plus size={15} /> Connect a provider</Link></div>
            )}
          </div>
          <ErrorBanner text={error} />
          <button className="button full generate-button" disabled={locked || !prompt.trim() || !connectionId || !model || modelsLoading} onClick={() => generate()}>
            {busy ? <Spinner /> : <Sparkles size={18} />}{busy ? "Finding the story in your idea…" : "Generate composition"}{!busy && <ArrowRight size={17} />}
          </button>
          <p className="composer-disclaimer"><ShieldCheck size={13} /> Uses your provider credits. Rendering stays local.</p>
          {project && <p className="small-text muted">Project saved. Editing the brief or model creates a new project to preserve the original.</p>}
        </section>

        <section className="panel preview-panel">
          <div className="panel-title"><span><Play size={18} /> The first look</span><span className="small-text muted">02 / PREVIEW</span></div>
          {busy || generating ? (
            <div className="preview-loading" role="status" aria-live="polite"><div className="skeleton preview-skeleton" /><Spinner /><h3>{generating && !busy ? "Still composing on the server…" : "Good things are taking shape."}</h3><p>{generating && !busy ? "You can leave this page — generation keeps running. Come back anytime." : "Your model is composing the scene. This can take a few minutes."}</p></div>
          ) : composition ? (
            <>
              <div className={`composition-frame aspect-${settings.aspect.replace(":", "-")}`}>
                <iframe title="Generated composition preview" sandbox="allow-scripts" src={`/api/compositions/${encodeURIComponent(composition.id)}/html`} />
              </div>
              <div className="preview-caption"><span className={`status-chip ${failedComposition ? "failed" : "completed"}`}>{failedComposition ? "Needs attention" : "Composition ready"}</span><span className="muted small-text">Version {composition.version ?? 1}</span></div>
              {errors.length > 0 && <div className="error-banner"><strong>Composition validation</strong><ul>{errors.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
              <div className="actions preview-actions">
                <button className="button secondary" disabled={locked} onClick={() => generate(true)}><RefreshCw size={16} /> Regenerate</button>
                <button className="button" disabled={locked || failedComposition} onClick={() => render()}>{renderBusy ? <Spinner /> : <Film size={17} />} Render MP4</button>
              </div>
            </>
          ) : (
            <div className="preview-empty">
              <div className="frame-corners"><div className="preview-mark"><Play size={28} /></div><span>YOUR IDEA GOES HERE.</span></div>
              <h3>A blank canvas.<br />Not for long.</h3><p>Your composition will appear here.<br />Start with a brief on the left.</p>
              <div className="preview-specs"><span>HTML COMPOSITION</span><span>LOCAL MP4 RENDER</span></div>
            </div>
          )}
          {job && (
            <div className="render-section">
              <div className="panel-title compact"><span><Film size={16} /> The final frame</span><span className={`status-chip ${job.status === "succeeded" ? "completed" : job.status === "failed" ? "failed" : "rendering"}`}>{job.status}</span></div>
              {activeJob && (
                <>
                  <div className="progress-label"><span role="status">{job.stage || (job.status === "queued" ? "Waiting for a render worker…" : "Rendering your video…")}</span><strong>{Math.round(Math.max(0, Math.min(1, job.progress || 0)) * 100)}%</strong></div>
                  <progress max={1} value={Math.max(0, Math.min(1, job.progress || 0))} aria-label="Render progress" />
                  <ErrorBanner text={pollError} />
                  <button className="text-button" disabled={cancelBusy} onClick={async () => {
                    setCancelBusy(true);
                    try {
                      await api(`/jobs/${encodeURIComponent(job.id)}/cancel`, { method: "POST" });
                      toast("Cancellation requested. The renderer is stopping safely.");
                    } catch (err) { setError(message(err)); }
                    finally { setCancelBusy(false); }
                  }}>{cancelBusy ? "Requesting cancellation…" : "Cancel render"}</button>
                </>
              )}
              {job.status === "succeeded" && (
                <div className="video-result">
                  <video
                    key={job.output?.url || job.id}
                    controls
                    autoPlay
                    muted
                    playsInline
                    preload="metadata"
                    src={job.output?.url || `/api/jobs/${encodeURIComponent(job.id)}/download`}
                  />
                  <a
                    href={job.output?.url || `/api/jobs/${encodeURIComponent(job.id)}/download`}
                    download
                    target={job.output?.url ? "_blank" : undefined}
                    rel={job.output?.url ? "noreferrer" : undefined}
                    className="button full"
                  >
                    <ArrowDownToLine size={17} /> Download MP4
                  </a>
                </div>
              )}
              {(job.status === "failed" || job.status === "canceled") && (
                <><ErrorBanner text={jobError || (job.status === "canceled" ? "This render was canceled." : "The render failed. No additional error message was returned.")} /><button className="button secondary" disabled={renderBusy || busy} onClick={() => render(true)}>{renderBusy ? <Spinner /> : <RefreshCw size={16} />} Retry render</button></>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function relativeDate(value?: string) {
  if (!value) return "Recently updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const toast = useContext(ToastContext);
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api("/projects").then((data) => setProjects(list<Project>(data, "projects")))
      .catch((err) => setError(message(err))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeading eyebrow="THE WORK, IN PROGRESS" title="Your ideas, collected." description="Every first draft. Every final frame. All right here.">
        <Link to="/app" className="button"><Plus size={18} /> New video</Link>
      </PageHeading>
      <ErrorBanner text={error} />
      {error && <button className="button secondary" onClick={load}><RefreshCw size={16} /> Try again</button>}
      {loading ? <Skeletons count={6} /> : !projects.length && !error ? (
        <Empty title="Your next great idea lives here." text="Make your first video and start a collection worth coming back to."><Link to="/app" className="button"><Plus size={17} /> Make a video</Link></Empty>
      ) : (
        <div className="card-grid projects-grid">
          {projects.map((project, index) => (
            <article className="project-card" key={project.id}>
              <Link to={`/app?project=${encodeURIComponent(project.id)}`} className={`project-thumbnail project-art-${index % 3}`} aria-label={`Open ${project.title}`}>
                {project.thumbnail ? <img src={project.thumbnail} alt="" /> : <><span className="project-art-number">{String(index + 1).padStart(2, "0")}</span><Film size={30} /><span className="project-art-line" /></>}
                <span className="project-open"><ArrowUpRight size={19} /></span>
              </Link>
              <div className="project-content">
                {editing === project.id ? (
                  <form onSubmit={async (event) => {
                    event.preventDefault();
                    if (!title.trim()) return;
                    setSaving(true);
                    try {
                      await api(`/projects/${encodeURIComponent(project.id)}`, { method: "PATCH", body: { title: title.trim() } });
                      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, title: title.trim() } : item));
                      setEditing(null);
                      toast("Project renamed.");
                    } catch (err) { toast(message(err), true); }
                    finally { setSaving(false); }
                  }}>
                    <input aria-label="Project title" autoFocus value={title} maxLength={150} required onChange={(event) => setTitle(event.target.value)} />
                    <div className="actions"><button className="text-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button><button type="button" className="text-button muted" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></div>
                  </form>
                ) : <Link className="project-title" to={`/app?project=${encodeURIComponent(project.id)}`}>{project.title}</Link>}
                <div className="project-meta"><span className={`status-chip ${project.status || "draft"}`}>{project.status || "draft"}</span><span><Clock3 size={12} />{relativeDate(project.updatedAt || project.updated_at)}</span></div>
                <div className="project-card-footer"><span>{project.settings?.duration ?? 15}s · {project.settings?.aspect ?? "16:9"}</span><div className="actions"><button className="icon-button" aria-label={`Rename ${project.title}`} onClick={() => { setEditing(project.id); setTitle(project.title); }}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${project.title}`} onClick={() => setDeleting(project)}><Trash2 size={15} /></button></div></div>
              </div>
            </article>
          ))}
        </div>
      )}
      {deleting && <Confirm title="Delete this project?" description={`“${deleting.title}” and its associated data will be removed. This cannot be undone.`} close={() => setDeleting(null)} action={async () => {
        await api(`/projects/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
        setProjects((current) => current.filter((item) => item.id !== deleting.id));
        toast("Project deleted.");
      }} />}
    </>
  );
}

function ConnectDialog({
  provider,
  close,
  saved
}: {
  provider: Provider;
  close: () => void;
  saved: (connection: Connection) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog title={`Connect ${provider.name}`} close={() => !busy && close()}>
      <p className="muted">Your credentials are encrypted at rest and never returned in full.</p>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const credentials: Record<string, string> = {};
        provider.auth.fields.forEach((field) => {
          credentials[field.key] = String(values.get(field.key) ?? "");
        });
        setBusy(true);
        setError("");
        try {
          const result = await api<{ connection: Connection }>("/connections", {
            method: "POST",
            body: {
              providerId: provider.id,
              name: String(values.get("connectionName") ?? "").trim() || provider.name,
              credentials
            }
          });
          saved(result.connection);
          close();
        } catch (err) { setError(message(err)); }
        finally { setBusy(false); }
      }}>
        <label>Connection name <span className="optional">optional</span><input name="connectionName" placeholder={`My ${provider.name} connection`} maxLength={100} disabled={busy} /></label>
        {provider.auth.fields.map((field) => (
          <label key={field.key}>{field.label}<input name={field.key} placeholder={field.placeholder} defaultValue={field.default} type={field.secret ? "password" : "text"} required={field.required} disabled={busy} autoComplete="off" spellCheck={false} /></label>
        ))}
        <ErrorBanner text={error} />
        <div className="actions between"><a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-link">Provider documentation <ExternalLink size={13} /></a><button className="button" disabled={busy}>{busy ? <Spinner /> : <KeyRound size={16} />} Save connection</button></div>
      </form>
    </Dialog>
  );
}

function ConnectionCard({
  connection,
  provider,
  disconnect
}: {
  connection: Connection;
  provider?: Provider;
  disconnect: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; latencyMs?: number; error?: unknown } | null>(
    connection.lastTest?.ok !== undefined
      ? { ok: connection.lastTest.ok, latencyMs: connection.lastTest.latencyMs }
      : connection.lastTestOk != null ? { ok: connection.lastTestOk } : null
  );
  const [models, setModels] = useState<Model[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hint = connection.summary?.hint || connection.credentialSummary?.hint || connection.credentials?.hint || connection.hint || "Credentials securely stored";
  return (
    <article className="connection-card">
      <div className="connection-heading"><span className="provider-monogram">{(provider?.name || connection.providerId).slice(0, 2).toUpperCase()}</span><div><h3>{connection.name || provider?.name || connection.providerId}</h3><span className="muted small-text">{provider?.name || connection.providerId}</span></div><span className={`connection-dot ${test ? test.ok ? "good" : "bad" : ""}`} title={test ? test.ok ? "Last test passed" : "Last test failed" : "Not tested"} aria-label={test ? test.ok ? "Last test passed" : "Last test failed" : "Not tested"} /></div>
      <code className="key-hint">{hint}</code>
      <ErrorBanner text={error} />
      {test && <p className={`small-text ${test.ok ? "success-text" : "error-text"}`}>{test.ok ? `Connection healthy${test.latencyMs !== undefined ? ` · ${test.latencyMs} ms` : ""}` : typeof test.error === "string" ? test.error : test.error ? JSON.stringify(test.error) : "Connection test failed."}</p>}
      <div className="connection-actions">
        <button className="button secondary small" disabled={testing} onClick={async () => {
          setTesting(true); setError("");
          try {
            const result = await api<{ ok: boolean; latencyMs?: number; error?: unknown }>(`/connections/${encodeURIComponent(connection.id)}/test`, { method: "POST" });
            setTest(result);
          } catch (err) { setTest({ ok: false }); setError(message(err)); }
          finally { setTesting(false); }
        }}>{testing ? <Spinner /> : <Zap size={14} />} Test</button>
        <button className="button secondary small" disabled={loading} onClick={async () => {
          if (models) { setModels(null); return; }
          setLoading(true); setError("");
          try {
            const result = await api<{ models: Model[] }>(`/connections/${encodeURIComponent(connection.id)}/models`);
            setModels(result.models);
          } catch (err) { setError(message(err)); }
          finally { setLoading(false); }
        }}>{loading ? <Spinner /> : <Layers3 size={14} />} Models</button>
        <button className="icon-button disconnect-button" aria-label={`Disconnect ${connection.name}`} onClick={disconnect}><Trash2 size={16} /></button>
      </div>
      {models && <div className="model-browser"><strong>{models.length} available models</strong>{models.length ? <ul>{models.map((model) => <li key={model.id}><span>{model.label || model.id}</span>{model.label && <code>{model.id}</code>}</li>)}</ul> : <p className="muted">This provider returned no models.</p>}</div>}
    </article>
  );
}

function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Connection | null>(null);
  const [query, setQuery] = useState("");
  const toast = useContext(ToastContext);
  const load = useCallback(() => {
    setLoading(true); setError("");
    Promise.all([api("/providers"), api("/connections")])
      .then(([catalog, saved]) => {
        setProviders(list<Provider>(catalog, "providers"));
        setConnections(list<Connection>(saved, "connections"));
      })
      .catch((err) => setError(message(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <PageHeading eyebrow="BRING YOUR OWN INTELLIGENCE" title="Great ideas. Your favorite models." description="Connect a provider once. Choose the right model for every story." />
      <div className="info-strip"><ShieldCheck size={19} /><p>Your keys are encrypted at rest. Generation uses your own provider credits; rendering runs locally.</p></div>
      <ErrorBanner text={error} />
      {error && <button className="button secondary" onClick={load}><RefreshCw size={16} /> Try again</button>}
      <div className="subheading"><h2>Your connections <span>{connections.length}</span></h2><span className="muted small-text">SECURE BY DESIGN</span></div>
      {loading ? <Skeletons count={2} /> : connections.length ? <div className="card-grid">{connections.map((connection) => <ConnectionCard key={connection.id} connection={connection} provider={providers.find((provider) => provider.id === connection.providerId)} disconnect={() => setDeleting(connection)} />)}</div> : <div className="inline-empty"><KeyRound size={24} /><div><h3>No connections yet.</h3><p>Choose a provider below to give your ideas a creative partner.</p></div><a href="#provider-catalog" className="button secondary small">Explore providers <ArrowRight size={15} /></a></div>}
      <div className="subheading catalog-heading" id="provider-catalog"><h2>The provider library <span>{providers.length}</span></h2><input type="search" className="provider-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a provider…" aria-label="Search providers" /></div>
      {loading ? <Skeletons count={6} /> : <div className="card-grid provider-grid">{providers.filter((provider) => provider.name.toLowerCase().includes(query.toLowerCase())).map((provider) => <article className="provider-card" key={provider.id}><div className="provider-card-top"><span className="provider-monogram">{provider.name.slice(0, 2).toUpperCase()}</span><span className="auth-badge">{provider.auth.type === "aws" ? "AWS credentials" : "API key"}</span></div><h3>{provider.name}</h3><a className="text-link small-text" href={provider.docsUrl} target="_blank" rel="noreferrer">Read the docs <ExternalLink size={12} /></a><details><summary>Capabilities & limitations</summary><p>{provider.limitations || "Model availability and limits depend on your provider account."}</p></details><button className="button secondary full small" onClick={() => setSelected(provider)}><Plus size={15} /> Connect provider</button></article>)}</div>}
      {!loading && providers.length > 0 && !providers.some((provider) => provider.name.toLowerCase().includes(query.toLowerCase())) && <Empty title="No matching providers." text="Try another name to find your provider."><button className="button secondary" onClick={() => setQuery("")}>Clear search</button></Empty>}
      {selected && <ConnectDialog provider={selected} close={() => setSelected(null)} saved={(connection) => { setConnections((current) => [...current, connection]); toast("Provider connected. Your next idea is ready to go."); }} />}
      {deleting && <Confirm title="Disconnect this provider?" description={`Remove “${deleting.name}” and its stored credentials? Existing projects will remain, but new generations need a connected provider.`} close={() => setDeleting(null)} action={async () => {
        await api(`/connections/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
        setConnections((current) => current.filter((connection) => connection.id !== deleting.id));
        toast("Provider disconnected.");
      }} />}
    </>
  );
}

function SettingsPage() {
  const { user, setUser } = useContext(AuthContext);
  const toast = useContext(ToastContext);
  const [name, setName] = useState(user?.name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  return (
    <>
      <PageHeading eyebrow="MAKE YOURSELF AT HOME" title="The studio, your way." description="A few essentials for your account and your peace of mind." />
      <div className="settings-layout">
        <section className="panel settings-panel"><div className="settings-section-title"><span className="avatar large-avatar">{user?.name?.slice(0, 1).toUpperCase() || "U"}</span><div><h2>Your profile</h2><p className="muted">{user?.email}</p></div></div><form onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) { setProfileError("Your name cannot be empty."); return; }
          setProfileBusy(true); setProfileError("");
          try {
            const result = await api<{ user: User }>("/auth/me", { method: "PATCH", body: { name: name.trim() } });
            setUser(result.user); toast("Profile updated.");
          } catch (err) { setProfileError(message(err)); }
          finally { setProfileBusy(false); }
        }}><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoComplete="name" /></label><ErrorBanner text={profileError} /><button className="button" disabled={profileBusy}>{profileBusy ? <Spinner /> : <Check size={16} />} Save changes</button></form></section>
        <section className="panel settings-panel"><h2>Keep it private.</h2><p className="muted">Change the password you use to enter your studio.</p><form onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          const next = String(values.get("next") ?? "");
          if (next !== values.get("confirm")) { setPasswordError("The new passwords do not match."); return; }
          setPasswordBusy(true); setPasswordError("");
          try {
            const result = await api<{ user: User }>("/auth/me", { method: "PATCH", body: { password: { current: values.get("current"), next } } });
            setUser(result.user); form.reset(); toast("Password changed.");
          } catch (err) { setPasswordError(message(err)); }
          finally { setPasswordBusy(false); }
        }}><label>Current password<input name="current" type="password" autoComplete="current-password" required maxLength={200} /></label><div className="field-grid"><label>New password<input name="next" type="password" autoComplete="new-password" minLength={8} maxLength={200} required placeholder="At least 8 characters" /></label><label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={200} required /></label></div><ErrorBanner text={passwordError} /><button className="button secondary" disabled={passwordBusy}>{passwordBusy ? <Spinner /> : <KeyRound size={16} />} Update password</button></form></section>
        <aside className="settings-notes"><article><ShieldCheck size={23} /><h3>A note on your session.</h3><p>You’re signed in with an HttpOnly, SameSite cookie. Use the logout control in the sidebar—or below on mobile—when you’re finished on a shared machine.</p><MobileLogout /></article><article><FolderOpen size={23} /><h3>Your data stays close.</h3><p>Account and project records live in the local SQLite file, <code>data/app.db</code>. Deleting a project removes its associated data. Disconnecting a provider removes its saved credentials.</p><p>There is no account-deletion endpoint in this version. For a full installation reset, follow the server’s documented data-removal procedure.</p></article><article><Moon size={23} /><h3>Set the atmosphere.</h3><p>Your appearance preference is saved in this browser.</p><ThemeButton label /></article></aside>
      </div>
    </>
  );
}

function MobileLogout() {
  const { setUser } = useContext(AuthContext);
  const toast = useContext(ToastContext);
  const [busy, setBusy] = useState(false);
  return <button className="button secondary small" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null); navigate("/login");
    } catch (err) { toast(message(err), true); }
    finally { setBusy(false); }
  }}>{busy ? <Spinner /> : <LogOut size={15} />} Log out</button>;
}

function Protected({ route }: { route: string }) {
  const { user, loading, error, refresh } = useContext(AuthContext);
  useEffect(() => {
    if (!loading && !user && !error) navigate("/login", true);
  }, [loading, user, error]);
  if (loading) return <div className="session-screen"><Brand /><Spinner /><p>Opening your studio…</p></div>;
  if (error) return <div className="session-screen"><Brand /><h2>We couldn’t open your session.</h2><ErrorBanner text={error} /><button className="button" onClick={refresh}><RefreshCw size={16} /> Try again</button><Link to="/" className="text-link">Back home</Link></div>;
  if (!user) return null;
  const path = route.split("?")[0];
  let content: ReactNode;
  if (path === "/app") content = <Workspace key={route} route={route} />;
  else if (path === "/app/projects") content = <Projects />;
  else if (path === "/app/providers") content = <Providers />;
  else if (path === "/app/settings") content = <SettingsPage />;
  else content = <Empty title="This room isn’t in the studio." text="Let’s get you back to making something."><Link className="button" to="/app">Back to workspace</Link></Empty>;
  return <Shell route={route}>{content}</Shell>;
}

function Router() {
  const route = useRoute();
  const path = route.split("?")[0];
  useEffect(() => {
    document.title = `${path === "/" ? "Ideas into motion" : path === "/login" ? "Welcome back" : path === "/signup" ? "Create your account" : path === "/app/providers" ? "Providers" : path === "/app/projects" ? "Projects" : path === "/app/settings" ? "Settings" : "Your studio"} — ONETAKE STUDIO`;
  }, [path]);
  if (path === "/") return <Landing />;
  if (path === "/login" || path === "/signup") return <AuthPage key={path} signup={path === "/signup"} />;
  if (path === "/app" || path.startsWith("/app/")) return <Protected route={route} />;
  return <div className="session-screen"><Brand /><h1>A little off-script.</h1><p>This page doesn’t exist.</p><Link to="/" className="button">Back home <ArrowRight size={16} /></Link></div>;
}

export default function App() {
  return <Toasts><AuthProvider><Router /></AuthProvider></Toasts>;
}
