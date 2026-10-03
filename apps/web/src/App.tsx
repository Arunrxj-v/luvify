/**
 * Luvify studio - the operator UI. Talks to the Express API through the Vite
 * proxy: projects, the interview chat, specification, live preview (rendered
 * from the same `SiteDocument` the server publishes), export and publish.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  WEBSITE_TYPES,
  WEBSITE_TYPE_LABELS,
  archetypeLabel,
  type CompletenessDto,
  type CreateProjectRequest,
  type DeleteProjectResponseDto,
  type ExportResponseDto,
  type HealthResponseDto,
  type MessageDto,
  type PreviewResponseDto,
  type ProjectDetailDto,
  type ProjectSummaryDto,
  type TemplateDto,
} from "@luvify/shared";
import { api } from "./api";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import { AuthScreens } from "./AuthScreens";
import { useAuth } from "./auth";

type Tab = "chat" | "spec" | "preview" | "files";

const initialDraft: CreateProjectRequest = {
  name: "",
  businessDescription: "",
  websiteType: "business",
};

/** Remembers the open project so a page refresh resumes the conversation. */
const SAVED_PROJECT_KEY = "luvify.project";

/** First letters of the display name - the fallback when there is no avatar. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Studio(): JSX.Element {
  const [health, setHealth] = useState<HealthResponseDto | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [project, setProject] = useState<ProjectDetailDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [completeness, setCompleteness] = useState<CompletenessDto | null>(null);
  const [preview, setPreview] = useState<PreviewResponseDto | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CreateProjectRequest>(initialDraft);
  const [chatText, setChatText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [modifyText, setModifyText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  /**
   * On small screens the projects list and the studio are separate views.
   * The selected project stays loaded while the list is shown so it can be
   * marked as the current one (tint + ink bar), as the reference does.
   */
  const [view, setView] = useState<"studio" | "projects">("studio");

  const messagesRef = useRef<HTMLDivElement | null>(null);
  /** Blocks double-sends in the window before `busy` re-renders the buttons. */
  const sendingRef = useRef(false);
  const retryRef = useRef<{ label: string; task: () => Promise<void> } | null>(null);

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    retryRef.current = null;
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      retryRef.current = { label, task };
    } finally {
      setBusy(null);
    }
  }, []);

  const retryLast = useCallback(() => {
    const failed = retryRef.current;
    if (failed) void run(failed.label, failed.task);
  }, [run]);

  const refreshProjects = useCallback(async (): Promise<ProjectSummaryDto[]> => {
    const list = await api<ProjectSummaryDto[]>("/api/projects");
    setProjects(list);
    return list;
  }, []);

  const openProject = useCallback(async (id: string) => {
    const detail = await api<ProjectDetailDto>(`/api/projects/${id}`);
    // Safety check: verify the loaded project matches the requested project ID.
    if (detail.id !== id) {
      throw new Error(`Project isolation violation: requested project "${id}" but received project "${detail.id}"`);
    }
    setProject(detail);
    const conversation = await api<{ messages: MessageDto[]; completeness: CompletenessDto }>(
      `/api/projects/${id}/conversation`,
    );
    setMessages(conversation.messages);
    setCompleteness(conversation.completeness);
    setPicked(null);
    setPreview(null);
    // Drafts belong to the project they were typed for: clear them so one
    // project's half-written text never appears in another project's UI.
    setChatText("");
    setModifyText("");
    localStorage.setItem(SAVED_PROJECT_KEY, id);
    setView("studio");
  }, []);

  const loadPreview = useCallback(async (id: string, page: string) => {
    setPreview(
      await api<PreviewResponseDto>(`/api/projects/${id}/preview?page=${encodeURIComponent(page)}`),
    );
  }, []);

  // Keep the newest message in view: the transcript flows with the page now.
  useEffect(() => {
    const last = messagesRef.current?.lastElementChild;
    if (last instanceof HTMLElement) last.scrollIntoView({ block: "nearest" });
  }, [messages, tab]);

  // Mirror the stored Product/Business summary into the editable field so the
  // client can review exactly what generation is grounded in.
  useEffect(() => {
    setSummaryText(project?.requirements?.business.productSummary ?? "");
  }, [project?.id, project?.requirements?.business.productSummary]);

  // Nav links inside the preview iframe report back instead of navigating away.
  useEffect(() => {
    if (!project) return;
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; path?: unknown } | null;
      if (data && data.type === "lv:navigate" && typeof data.path === "string") {
        void loadPreview(project.id, data.path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadPreview, project]);

  useEffect(() => {
    void run("boot", async () => {
      const [healthResponse, templateList] = await Promise.all([
        api<HealthResponseDto>("/api/health"),
        api<TemplateDto[]>("/api/templates"),
      ]);
      setHealth(healthResponse);
      setTemplates(templateList);
      const list = await refreshProjects();
      // Restore the last opened project so a refresh resumes the conversation.
      const saved = localStorage.getItem(SAVED_PROJECT_KEY);
      if (saved) {
        if (list.some((item) => item.id === saved)) {
          try {
            await openProject(saved);
          } catch {
            localStorage.removeItem(SAVED_PROJECT_KEY);
          }
        } else {
          localStorage.removeItem(SAVED_PROJECT_KEY);
        }
      }
    });
  }, [openProject, refreshProjects, run]);

  const activeQuestion = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return null;
    return last.payload?.questions[0] ?? null;
  }, [messages]);

  /** Requirements as stored - the source of the summary and the page plan. */
  const requirements = project?.requirements ?? null;

  /**
   * The approved architecture: the requirements plan, else the specification's.
   * Specifications stored before the architecture field existed have neither, so
   * every access is optional-chained - an older project must still render.
   */
  const specificationArchitecture = project?.specification?.architecture;
  const pagePlan = useMemo(
    () =>
      requirements?.website.pagePlan.length
        ? requirements.website.pagePlan
        : (specificationArchitecture?.pages ?? []),
    [specificationArchitecture?.pages, requirements?.website.pagePlan],
  );

  const userJourneys = useMemo(
    () =>
      requirements?.website.userJourneys.length
        ? requirements.website.userJourneys
        : (specificationArchitecture?.userJourneys ?? []),
    [specificationArchitecture?.userJourneys, requirements?.website.userJourneys],
  );

  const createProject = () =>
    run("create", async () => {
      const created = await api<ProjectDetailDto>("/api/projects", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      await refreshProjects();
      setCreating(false);
      setDraft(initialDraft);
      await openProject(created.id);
      setTab("chat");
    });

  const generateSpecification = () =>
    run("spec", async () => {
      if (!project) return;
      await api(`/api/projects/${project.id}/specification/generate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await openProject(project.id);
      setNotice("Specification generated");
      setTab("spec");
    });

  const saveSummary = () =>
    run("summary", async () => {
      if (!project) return;
      // The hand-edited summary is authoritative: the server keeps it verbatim
      // and re-derives the archetype + page plan from it.
      await api(`/api/projects/${project.id}/requirements`, {
        method: "PUT",
        body: JSON.stringify({ business: { productSummary: summaryText } }),
      });
      await openProject(project.id);
      setNotice("Product summary saved - it now drives the next generation");
    });

  const generateWebsite = () =>
    run("generate", async () => {
      if (!project) return;
      await api(`/api/projects/${project.id}/generate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshProjects();
      await openProject(project.id);
      await loadPreview(project.id, "/");
      setNotice("Website generated");
      setTab("preview");
    });

  const modifyWebsite = () =>
    run("modify", async () => {
      if (!project || !modifyText.trim()) return;
      await api(`/api/projects/${project.id}/modify`, {
        method: "POST",
        body: JSON.stringify({ instruction: modifyText }),
      });
      setModifyText("");
      await refreshProjects();
      await openProject(project.id);
      await loadPreview(project.id, "/");
      setNotice("Modification applied");
      setTab("preview");
    });

  const publishWebsite = () =>
    run("publish", async () => {
      if (!project) return;
      await api(`/api/projects/${project.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ provider: "local" }),
      });
      await refreshProjects();
      await openProject(project.id);
      setNotice("Published");
    });

  const deleteProject = () =>
    run("delete", async () => {
      if (!project) return;
      const id = project.id;
      await api<DeleteProjectResponseDto>(`/api/projects/${id}`, { method: "DELETE" });
      if (localStorage.getItem(SAVED_PROJECT_KEY) === id) localStorage.removeItem(SAVED_PROJECT_KEY);
      setConfirmingDelete(false);
      setProject(null);
      setMessages([]);
      setCompleteness(null);
      setPreview(null);
      setTab("chat");
      await refreshProjects();
      setNotice("Project deleted");
    });

  const downloadExport = () =>
    run("export", async () => {
      if (!project) return;
      const bundle = await api<ExportResponseDto>(`/api/projects/${project.id}/export`);
      const zip = new JSZip();
      for (const file of bundle.files) zip.file(file.path, file.content);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bundle.projectName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(`Downloaded ${bundle.files.length} files`);
    });

  const sendMessage = (
    content: string,
    meta?: { questionId?: string; mapsTo?: string; optionLabels?: string[] },
  ) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    void run("chat", async () => {
      if (!project || !content.trim()) return;
      const result = await api<{ messages: MessageDto[]; completeness: CompletenessDto }>(
        `/api/projects/${project.id}/messages`,
        { method: "POST", body: JSON.stringify({ content, ...meta }) },
      );
      setMessages(result.messages);
      setCompleteness(result.completeness);
      setChatText("");
      await refreshProjects();
    }).finally(() => {
      sendingRef.current = false;
      setPicked(null);
    });
  };

  /**
   * The brand is the only back affordance on small screens (the reference
   * design shows no extra chrome): switch to the projects list. The project
   * stays selected so the list can mark it as current; reopening refetches.
   */
  const showProjects = () => {
    setView("projects");
  };

  return (
    <div className="app">
      <header className="header">
        <button className="brand" type="button" onClick={showProjects} aria-label="Luvify studio - projects">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span className="brand-name">
            Luvify <span className="brand-weak">studio</span>
          </span>
        </button>

        <div className="header-status">
          <span
            className={
              health?.database === "connected" && health.aiKeyConfigured ? "status-dot" : "status-dot warn"
            }
            aria-hidden="true"
          />
          <span className="status-text">
            {health
              ? `API ${health.database} · AI ${health.aiProvider}${
                  health.aiProvider === "openrouter" ? (health.aiKeyConfigured ? " ✓" : " · key missing") : ""
                }`
              : "connecting..."}
          </span>
        </div>

        <div className="header-right">
          {project?.deploymentUrl ? (
            <a className="live-link" href={project.deploymentUrl} target="_blank" rel="noreferrer">
              Live site ↗
            </a>
          ) : null}
          <UserMenu />
        </div>
      </header>

      {error || notice ? (
        <div className={error ? "banner error" : "banner"} role="status">
          <span>{error ?? notice}</span>
          {error && retryRef.current ? (
            <button className="banner-retry" onClick={retryLast}>
              Retry
            </button>
          ) : null}
          <button
            className="banner-close"
            onClick={() => {
              if (error) {
                setError(null);
                retryRef.current = null;
              } else {
                setNotice(null);
              }
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="layout">
        <aside className={!project || view === "projects" ? "sidebar sidebar--nav" : "sidebar"}>
          <div className="sidebar-head">
            <h2>Projects</h2>
            <button className="btn ink" onClick={() => setCreating((value) => !value)}>
              {creating ? "Cancel" : "New project"}
            </button>
          </div>

          {creating ? (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void createProject();
              }}
            >
              <label>
                Project name
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Harbour Bakery"
                  minLength={2}
                  required
                />
              </label>
              <label>
                Business name
                <input
                  value={draft.businessName ?? ""}
                  onChange={(event) => setDraft({ ...draft, businessName: event.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label>
                What does the business do?
                <textarea
                  value={draft.businessDescription}
                  onChange={(event) => setDraft({ ...draft, businessDescription: event.target.value })}
                  placeholder="A neighbourhood bakery selling sourdough bread and celebration cakes..."
                  minLength={10}
                  rows={3}
                  required
                />
              </label>
              <div className="row">
                <label>
                  Website type
                  <select
                    value={draft.websiteType}
                    onChange={(event) =>
                      setDraft({ ...draft, websiteType: event.target.value as CreateProjectRequest["websiteType"] })
                    }
                  >
                    {WEBSITE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {WEBSITE_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Template
                  <select
                    value={draft.templateId ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, templateId: event.target.value || undefined })
                    }
                  >
                    <option value="">Auto-pick</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className={"btn ink" + (busy === "create" ? " is-loading" : "")}
                type="submit"
                disabled={busy === "create"}
              >
                Create project
              </button>
            </form>
          ) : null}

          <ul className="project-list">
            {projects.map((item) => (
              <li key={item.id}>
                <button
                  className={project?.id === item.id ? "project-item active" : "project-item"}
                  onClick={() => {
                    setTab("chat");
                    void run("open", () => openProject(item.id));
                  }}
                >
                  <span className="project-name">{item.name}</span>
                  <span className="project-meta">
                    {item.status} · {item.completeness}%
                  </span>
                </button>
              </li>
            ))}
            {projects.length === 0 ? <li className="muted">No projects yet.</li> : null}
          </ul>
        </aside>

        <main className={project && view === "studio" ? "main" : "main main--blank"}>
          {!project ? (
            <div className="empty">
              <h1>Describe your business. Get a website.</h1>
              <p>
                Create a project, answer a few short questions, then generate the specification, the
                site, a live preview and a deployable export - all from the same validated document.
              </p>
            </div>
          ) : null}
          {project ? (
            <div className="project">
              <div className="project-head">
                <div className="project-id">
                  <h1 className="project-title">{project.name}</h1>
                  <p className="project-sub">
                    {project.businessName} · {project.websiteType} · {project.status} ·{" "}
                    {project.currentVersionNumber ? `v${project.currentVersionNumber}` : "no version yet"}
                  </p>
                </div>
                <div className="actions">
                  <button
                    className={"btn" + (busy === "spec" ? " is-loading" : "")}
                    onClick={generateSpecification}
                    disabled={busy !== null}
                  >
                    {project.specification ? "Rebuild spec" : "Generate spec"}
                  </button>
                  <button
                    className={"btn primary" + (busy === "generate" ? " is-loading" : "")}
                    onClick={generateWebsite}
                    disabled={busy !== null}
                  >
                    {project.document ? "Regenerate site" : "Build website"}
                  </button>
                  <button
                    className={"btn" + (busy === "export" ? " is-loading" : "")}
                    onClick={downloadExport}
                    disabled={busy !== null}
                  >
                    Export .zip
                  </button>
                  <button
                    className={"btn" + (busy === "publish" ? " is-loading" : "")}
                    onClick={publishWebsite}
                    disabled={busy !== null}
                  >
                    Publish
                  </button>
                  <span className="actions-divider" aria-hidden="true" />
                  <button
                    className="btn danger"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={busy !== null}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <nav className="tabs">
                {(["chat", "spec", "preview", "files"] as Tab[]).map((name) => (
                  <button
                    key={name}
                    className={tab === name ? "tab active" : "tab"}
                    onClick={() => setTab(name)}
                  >
                    {name === "spec" ? "Specification" : name === "files" ? "Files & export" : name === "chat" ? "Interview" : "Preview"}
                  </button>
                ))}
              </nav>

              {tab === "chat" ? (
                <div className="panel interview">
                  <div className="transcript" ref={messagesRef}>
                    {messages.map((message, index) => {
                      const question = index === messages.length - 1 ? activeQuestion : null;
                      return (
                        <article key={message.id} className={`msg ${message.role}`}>
                          <div className="msg-role">
                            {message.role === "assistant" ? (
                              <>
                                <span className="msg-square" aria-hidden="true" />
                                Luvify assistant
                              </>
                            ) : message.role === "user" ? (
                              "You"
                            ) : (
                              "Build"
                            )}
                          </div>
                          <div className="msg-body">{message.content}</div>
                          {question ? (
                            <>
                              <h2 className="question">{message.payload?.heading || question.question}</h2>
                              {question.help ? (
                                <p className="question-help">{question.help}</p>
                              ) : null}
                              {question.options.length > 0 ? (
                                <div className="options">
                                  {question.options.map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      className={"option" + (picked === option ? " selected" : "")}
                                      disabled={busy !== null}
                                      onClick={() => {
                                        setPicked(option);
                                        void sendMessage(option, {
                                          questionId: question.id,
                                          mapsTo: question.mapsTo,
                                          optionLabels: [option],
                                        });
                                      }}
                                    >
                                      <span className="radio" aria-hidden="true" />
                                      <span>{option}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </article>
                      );
                    })}
                    {messages.length === 0 ? (
                      <p className="transcript-empty">Start the conversation below.</p>
                    ) : null}
                  </div>

                  <form
                    className="composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMessage(
                        chatText,
                        activeQuestion
                          ? { questionId: activeQuestion.id, mapsTo: activeQuestion.mapsTo }
                          : undefined,
                      );
                    }}
                  >
                    <input
                      className="composer-input"
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      placeholder={
                        activeQuestion ? activeQuestion.question : "Tell me about your business..."
                      }
                    />
                    <button
                      className={"btn primary composer-send" + (busy === "chat" ? " is-loading" : "")}
                      type="submit"
                      disabled={busy !== null}
                    >
                      Send
                    </button>
                  </form>
                </div>
              ) : null}

              {tab === "spec" ? (
                <div className="panel">
                  <section className="summary-block">
                    <header>
                      <h3>What we&apos;re building</h3>
                      {requirements?.website.archetype ? (
                        <span className="tag">{archetypeLabel(requirements.website.archetype)}</span>
                      ) : null}
                    </header>
                    <p className="muted">
                      The primary source of truth for every page: the model grounds all copy, CTAs and
                      sections in this summary. Edit it and save - the next build uses your wording.
                    </p>
                    <textarea
                      value={summaryText}
                      onChange={(event) => setSummaryText(event.target.value)}
                      rows={3}
                      placeholder="A bakery specializing in custom wedding cakes, birthday cakes and dessert catering."
                    />
                    <div className="row">
                      <button
                        className={"btn ink" + (busy === "summary" ? " is-loading" : "")}
                        onClick={() => void saveSummary()}
                        disabled={busy !== null || summaryText.trim() === (requirements?.business.productSummary ?? "")}
                      >
                        Save summary
                      </button>
                      <button
                        className="btn"
                        onClick={() => setTab("chat")}
                        disabled={busy !== null}
                      >
                        Refine in chat
                      </button>
                    </div>
                    {requirements?.business.offerings.length ? (
                      <p className="muted small">
                        Offerings we picked up from the conversation:{" "}
                        {requirements.business.offerings.join(" · ")}
                      </p>
                    ) : null}
                  </section>

                  {pagePlan.length > 0 ? (
                    <section className="summary-block">
                      <header>
                        <h3>Website architecture</h3>
                        <span className="tag">{pagePlan.length} pages</span>
                      </header>
                      <p className="muted">
                        Every page has a reason to exist for this project. Pages are never added from a
                        fixed template - ask in chat (&ldquo;add a pricing page&rdquo;) to change the plan.
                      </p>
                      <ul className="spec-pages">
                        {pagePlan.map((page) => (
                          <li key={page.path}>
                            <strong>{page.name}</strong> <code>{page.path}</code>
                            <span className="muted">{page.purpose}</span>
                          </li>
                        ))}
                      </ul>
                      {userJourneys.length > 0 ? (
                        <ul className="journeys">
                          {userJourneys.map((journey) => (
                            <li key={journey.goal}>
                              <strong>{journey.goal}</strong>
                              <span className="muted">{journey.steps.join(" → ")}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}

                  {project.specification ? (
                    <div className="spec">
                      <h3>
                        {project.specification.siteName}{" "}
                        <span className="tag">v{project.specification.version}</span>
                      </h3>
                      <p>{project.specification.summary}</p>
                      <ul className="spec-pages">
                        {project.specification.pages.map((page) => (
                          <li key={page.path}>
                            <strong>{page.name}</strong> <code>{page.path}</code>
                            <span className="muted">{page.sections.join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                      <pre>
                        {JSON.stringify(
                          {
                            design: project.specification.design,
                            features: project.specification.features,
                            seo: project.specification.seo,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  ) : (
                    <p className="muted">
                      No specification yet - press <strong>Generate spec</strong> to derive one from
                      the requirements.
                    </p>
                  )}
                </div>
              ) : null}

              {tab === "preview" ? (
                <div className="panel preview-card">
                  <PreviewErrorBoundary onReset={() => void loadPreview(project.id, preview?.page ?? "/")}>
                    {!project.document ? (
                      <p className="muted">Build the website to see the live preview.</p>
                    ) : null}
                    {project.document && !preview ? (
                      <button className="btn primary" onClick={() => void loadPreview(project.id, "/")}>
                        Load preview
                      </button>
                    ) : null}
                    {preview ? (
                      <>
                        <div className="page-tabs">
                          {preview.pages.map((page) => (
                            <button
                              key={page.path}
                              className={preview.page === page.path ? "tab active" : "tab"}
                              onClick={() => void loadPreview(project.id, page.path)}
                            >
                              {page.name}
                            </button>
                          ))}
                        </div>
                        <iframe
                          className="preview-frame"
                          title="Site preview"
                          srcDoc={preview.html}
                          sandbox="allow-scripts allow-same-origin"
                        />
                      </>
                    ) : null}
                  </PreviewErrorBoundary>
                </div>
              ) : null}

              {tab === "files" ? (
                <div className="panel">
                  <div className="files-head">
                    <strong>{project.files.length} generated files</strong>
                    <button
                      className="btn"
                      onClick={downloadExport}
                      disabled={busy !== null || !project.document}
                    >
                      Download .zip
                    </button>
                  </div>
                  <ul className="file-list">
                    {project.files.map((file) => (
                      <li key={file.id}>
                        <code>{file.path}</code>
                        <span className="muted">
                          {file.language} · {(file.content.length / 1024).toFixed(1)} kB
                        </span>
                      </li>
                    ))}
                    {project.files.length === 0 ? (
                      <li className="muted">No generated files yet.</li>
                    ) : null}
                  </ul>

                  {project.deployments.length > 0 ? (
                    <div className="deployments">
                      <h4>Deployments</h4>
                      {project.deployments.map((deployment) => (
                        <p key={deployment.id} className="muted">
                          {deployment.status} · {deployment.provider} ·{" "}
                          {deployment.url ? (
                            <a href={deployment.url} target="_blank" rel="noreferrer">
                              {deployment.url}
                            </a>
                          ) : (
                            "no url"
                          )}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <section className="requirements">
                <div className="req-info">
                  <div className="req-head">
                    <span className="req-label">
                      Requirements {completeness?.overall ?? project.completeness}%
                    </span>
                    <span className="req-stage">
                      {completeness?.readyForGeneration ? "Ready to build" : "Discovery"}
                    </span>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${completeness?.overall ?? project.completeness}%` }} />
                  </div>
                  {completeness && completeness.blocking.length > 0 ? (
                    <p className="req-note">Still needed: {completeness.blocking.join(", ")}</p>
                  ) : null}
                </div>
                <div className="req-change">
                  <input
                    className="req-input"
                    value={modifyText}
                    onChange={(event) => setModifyText(event.target.value)}
                    placeholder="e.g. shorten the hero headline"
                  />
                  <button
                    className={"btn ink req-apply" + (busy === "modify" ? " is-loading" : "")}
                    onClick={modifyWebsite}
                    disabled={busy !== null}
                  >
                    Apply change
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </main>
      </div>

      {confirmingDelete && project ? (
        <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${project.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Delete {project.name}?</h3>
            <p className="muted">
              This removes the project with its conversation, generated files and the published
              site. It cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmingDelete(false)} disabled={busy === "delete"}>
                Cancel
              </button>
              <button
                className={"btn danger" + (busy === "delete" ? " is-loading" : "")}
                onClick={() => void deleteProject()}
                disabled={busy === "delete"}
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Signed-in identity in the top bar: avatar, name, email and sign out.
 * Deliberately small - it adds an account area without redesigning the shell.
 */
function UserMenu(): JSX.Element {
  const { user, signOut, pending } = useAuth();
  if (!user) return <></>;

  return (
    <div className="header-user">
      {user.avatarUrl ? (
        <img className="avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar" aria-hidden="true">
          {initialsOf(user.name)}
        </span>
      )}
      <span className="user-meta">
        <strong className="user-name">{user.name}</strong>
        <span className="user-email">{user.email}</span>
      </span>
      <button
        className={"sign-out" + (pending ? " is-loading" : "")}
        onClick={() => void signOut()}
        disabled={pending}
      >
        Sign out
      </button>
    </div>
  );
}

export function App(): JSX.Element {
  const { status } = useAuth();

  // Still asking the server who we are: show a splash, never the dashboard.
  if (status === "loading") {
    return (
      <div className="auth-shell auth-loading" role="status" aria-live="polite">
        <span className="brand-mark">L</span>
        <p className="muted">Checking your session...</p>
      </div>
    );
  }

  // No live session -> the project dashboard is unreachable, not merely hidden.
  if (status === "anonymous") return <AuthScreens />;

  return <Studio />;
}
