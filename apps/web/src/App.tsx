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

type Tab = "chat" | "spec" | "preview" | "files";

const initialDraft: CreateProjectRequest = {
  name: "",
  businessDescription: "",
  websiteType: "business",
};

/** Remembers the open project so a page refresh resumes the conversation. */
const SAVED_PROJECT_KEY = "luvify.project";

export function App(): JSX.Element {
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
  const [modifyText, setModifyText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [summaryText, setSummaryText] = useState("");

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
    setPreview(null);
    localStorage.setItem(SAVED_PROJECT_KEY, id);
  }, []);

  const loadPreview = useCallback(async (id: string, page: string) => {
    setPreview(
      await api<PreviewResponseDto>(`/api/projects/${id}/preview?page=${encodeURIComponent(page)}`),
    );
  }, []);

  // Keep the transcript scrolled to the newest message.
  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
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
    });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">L</span>
          Luvify <span className="brand-sub">studio</span>
        </div>
        <div className="topbar-meta">
          <span
            className={
              health?.database === "connected" && health.aiKeyConfigured ? "pill ok" : "pill warn"
            }
          >
            {health
              ? `API ${health.database} · AI ${health.aiProvider}${
                  health.aiProvider === "openrouter" ? (health.aiKeyConfigured ? " ✓" : " · key missing") : ""
                }`
              : "connecting..."}
          </span>
          {project?.deploymentUrl ? (
            <a className="pill link" href={project.deploymentUrl} target="_blank" rel="noreferrer">
              Live site ↗
            </a>
          ) : null}
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
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Projects</h2>
            <button className="btn primary" onClick={() => setCreating((value) => !value)}>
              {creating ? "Cancel" : "New project"}
            </button>
          </div>

          {creating ? (
            <form
              className="card form"
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
              <button className="btn primary" type="submit" disabled={busy === "create"}>
                {busy === "create" ? "Creating..." : "Create project"}
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

        <main className="main">
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
              <div className="project-head card">
                <div>
                  <h1>{project.name}</h1>
                  <p className="muted">
                    {project.businessName} · {project.websiteType} · {project.status} ·{" "}
                    {project.currentVersionNumber ? `v${project.currentVersionNumber}` : "no version yet"}
                  </p>
                </div>
                <div className="actions">
                  <button className="btn" onClick={generateSpecification} disabled={busy !== null}>
                    {project.specification ? "Rebuild spec" : "Generate spec"}
                  </button>
                  <button className="btn primary" onClick={generateWebsite} disabled={busy !== null}>
                    {busy === "generate" ? "Building..." : project.document ? "Regenerate site" : "Build website"}
                  </button>
                  <button
                    className="btn"
                    onClick={downloadExport}
                    disabled={busy !== null || !project.document}
                  >
                    Export .zip
                  </button>
                  <button
                    className="btn"
                    onClick={publishWebsite}
                    disabled={busy !== null || !project.document}
                  >
                    Publish
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={busy !== null}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="meter-head">
                  <strong>Requirements {completeness?.overall ?? project.completeness}%</strong>
                  <span className={completeness?.readyForGeneration ? "tag ok" : "tag"}>
                    {completeness?.readyForGeneration ? "Ready to build" : "Discovery"}
                  </span>
                </div>
                <div className="meter">
                  <span style={{ width: `${completeness?.overall ?? project.completeness}%` }} />
                </div>
                {completeness && completeness.blocking.length > 0 ? (
                  <p className="muted">Still needed: {completeness.blocking.join(", ")}</p>
                ) : null}
              </div>

              <div className="card">
                <div className="row">
                  <input
                    value={modifyText}
                    onChange={(event) => setModifyText(event.target.value)}
                    placeholder="e.g. shorten the hero headline and add a booking call to action"
                  />
                  <button
                    className="btn"
                    onClick={modifyWebsite}
                    disabled={busy !== null || !project.document || !modifyText.trim()}
                  >
                    Apply change
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
                <div className="card chat">
                  <div className="messages" ref={messagesRef}>
                    {messages.map((message) => (
                      <div key={message.id} className={`message ${message.role}`}>
                        <div className="message-role">
                          {message.role === "user"
                            ? "You"
                            : message.role === "generation"
                              ? "Build"
                              : "Assistant"}
                        </div>
                        <div className="message-body">{message.content}</div>
                      </div>
                    ))}
                    {messages.length === 0 ? (
                      <p className="muted">Start the conversation below.</p>
                    ) : null}
                  </div>

                  {activeQuestion && activeQuestion.options.length > 0 ? (
                    <div className="quick-replies">
                      {activeQuestion.options.map((option) => (
                        <button
                          key={option}
                          className="chip"
                          disabled={busy !== null}
                          onClick={() =>
                            void sendMessage(option, {
                              questionId: activeQuestion.id,
                              mapsTo: activeQuestion.mapsTo,
                              optionLabels: [option],
                            })
                          }
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <form
                    className="chat-form"
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
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      placeholder={
                        activeQuestion ? activeQuestion.question : "Tell me about your business..."
                      }
                    />
                    <button
                      className="btn primary"
                      type="submit"
                      disabled={busy !== null || !chatText.trim()}
                    >
                      {busy === "chat" ? "Sending..." : "Send"}
                    </button>
                  </form>
                </div>
              ) : null}

              {tab === "spec" ? (
                <div className="card">
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
                        className="btn primary"
                        onClick={() => void saveSummary()}
                        disabled={busy !== null || summaryText.trim() === (requirements?.business.productSummary ?? "")}
                      >
                        {busy === "summary" ? "Saving..." : "Save summary"}
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
                <div className="card preview-card">
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
                <div className="card">
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
                className="btn danger"
                onClick={() => void deleteProject()}
                disabled={busy === "delete"}
              >
                {busy === "delete" ? "Deleting..." : "Delete project"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
