/**
 * Project workspace - interview, specification, preview and export for ONE
 * project, addressed by `/projects/:projectId`.
 *
 * The route parameter is the single source of truth for which project is
 * open: arriving here means either an explicit selection from the Projects
 * dashboard or a deliberately typed URL, and the effect below loads exactly
 * the id in the address bar. Nothing in this file remembers a "last project"
 * or picks one on its own - a project loads only because its id is on screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import JSZip from "jszip";
import {
  archetypeLabel,
  briefChecklist,
  type AssetDto,
  type CompletenessDto,
  type DeleteProjectResponseDto,
  type ExportResponseDto,
  type HealthResponseDto,
  type MessageDto,
  type PreviewResponseDto,
  type ProjectBrief,
  type ProjectDetailDto,
  type ProjectSummaryDto,
  type TemplateDto,
} from "@luvify/shared";
import { api } from "./api";
import { getBrief, listAssets } from "./briefApi";
import { ContentPanel } from "./ContentPanel";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import { AppHeader, Banner, useRunner } from "./shell";
import { ProjectCreateForm } from "./ProjectCreateForm";

type Tab = "chat" | "content" | "spec" | "preview" | "files";

export function Studio(): JSX.Element {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const runner = useRunner();
  const { busy, run } = runner;

  const [health, setHealth] = useState<HealthResponseDto | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [project, setProject] = useState<ProjectDetailDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [completeness, setCompleteness] = useState<CompletenessDto | null>(null);
  const [preview, setPreview] = useState<PreviewResponseDto | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [creating, setCreating] = useState(false);
  const [chatText, setChatText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [modifyText, setModifyText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  // The client brief + its uploaded files: loaded atomically with the project
  // above so the workspace never renders one project's uploads over another
  // project's brief, not even for a frame.
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  /**
   * True once the id in the URL has been tried and failed - it separates
   * "still opening" from "this project is not yours / not here" so the
   * workspace never shows a blank screen it cannot explain.
   */
  const [openFailed, setOpenFailed] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  /** Blocks double-sends in the window before `busy` re-renders the buttons. */
  const sendingRef = useRef(false);

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
    const [conversation, briefResponse, assetList] = await Promise.all([
      api<{ messages: MessageDto[]; completeness: CompletenessDto }>(
        `/api/projects/${id}/conversation`,
      ),
      getBrief(id),
      listAssets(id),
    ]);
    // Commit detail + conversation + brief + assets as one update: the
    // workspace must never render one project's title over another project's
    // transcript or uploads, not even for a frame while a second request is
    // still in flight.
    setProject(detail);
    setMessages(conversation.messages);
    setCompleteness(conversation.completeness);
    setBrief(briefResponse.brief);
    setAssets(assetList.assets);
    setPicked(null);
    setPreview(null);
    // Drafts belong to the project they were typed for: clear them so one
    // project's half-written text never appears in another project's UI.
    setChatText("");
    setModifyText("");
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

  // Shell boot: system status, template choices for the create form and the
  // user's own projects for the strip. It deliberately opens NO project.
  useEffect(() => {
    void run("boot", async () => {
      const [healthResponse, templateList] = await Promise.all([
        api<HealthResponseDto>("/api/health"),
        api<TemplateDto[]>("/api/templates"),
      ]);
      setHealth(healthResponse);
      setTemplates(templateList);
      await refreshProjects();
    });
  }, [refreshProjects, run]);

  const loadedId = project?.id ?? null;

  /**
   * Open the project named in the URL - on arrival and whenever the URL
   * changes (a dashboard click, a strip click or a hand-typed address).
   * This is the ONLY place a project is chosen from outside the app, and it
   * always asks for the explicit id rather than any remembered "recent" one.
   */
  useEffect(() => {
    // `/projects/` with no id at all: there is nothing to open, so say so
    // instead of spinning forever on a screen that can never resolve.
    if (!projectId) {
      setOpenFailed(true);
      return;
    }
    if (loadedId === projectId) return;
    // Switching projects starts on the interview: the other tabs belong to
    // the project being left behind.
    if (loadedId !== null) setTab("chat");
    setOpenFailed(false);
    void run("open", async () => {
      try {
        await openProject(projectId);
      } catch (caught) {
        setOpenFailed(true);
        throw caught;
      }
    });
  }, [loadedId, openProject, projectId, run]);

  const activeQuestion = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return null;
    return last.payload?.questions[0] ?? null;
  }, [messages]);

  /**
   * The first assistant message is the introduction: the reference design puts
   * it (with the assistant identity) in the right-hand context column while
   * the transcript column carries the history and the live question.
   */
  const intro = messages[0]?.role === "assistant" ? messages[0] : null;

  /** Requirements as stored - the source of the summary and the page plan. */
  const requirements = project?.requirements ?? null;

  /**
   * Content readiness: what the client supplied (brief fields + uploads)
   * against what this website type still wants. Drives the pointer block in
   * the interview's context column - the tab itself recomputes it live.
   */
  const checklist = useMemo(() => {
    if (!brief || !requirements) return null;
    const counts: Record<string, number> = {};
    for (const asset of assets) counts[asset.category] = (counts[asset.category] ?? 0) + 1;
    return briefChecklist(brief, requirements, counts);
  }, [assets, brief, requirements]);

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

  /** The URL and the loaded project agree - the real workspace. */
  const projectReady = project !== null && project.id === projectId;

  const createProject = async (created: ProjectDetailDto) => {
    setCreating(false);
    await refreshProjects();
    // Creating is an explicit act, so the new project opens the same way a
    // click would: through its own URL, never through hidden state.
    navigate(`/projects/${created.id}`);
  };

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
      await api<DeleteProjectResponseDto>(`/api/projects/${project.id}`, { method: "DELETE" });
      setConfirmingDelete(false);
      // The workspace has nothing left to show: hand the user back to the
      // dashboard (replacing this entry, so back cannot reopen a project
      // that no longer exists) with the result of their action.
      navigate("/", { replace: true, state: { notice: "Project deleted" } });
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
   * Requirements + change request: one panel used in two places - inside the
   * interview's context column (as the reference shows) and below the other
   * workspace tabs. Same state, same handlers, single source.
   */
  const requirementsSection = (
    <section className="requirements">
      <div className="req-info">
        <div className="req-head">
          <span className="req-label">
            Requirements {completeness?.overall ?? project?.completeness ?? 0}%
          </span>
          <span className="req-stage">{completeness?.readyForGeneration ? "Ready to build" : "Discovery"}</span>
        </div>
        <div className="meter">
          <span style={{ width: `${completeness?.overall ?? project?.completeness ?? 0}%` }} />
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
  );

  return (
    <div className="app">
      <AppHeader
        health={health}
        right={
          projectReady && project?.deploymentUrl ? (
            <a className="live-link" href={project.deploymentUrl} target="_blank" rel="noreferrer">
              Live site ↗
            </a>
          ) : null
        }
      />

      <Banner
        error={runner.error}
        notice={notice}
        canRetry={runner.canRetry}
        onRetry={runner.retry}
        onDismiss={() => {
          runner.clearError();
          setNotice(null);
        }}
      />

      <nav className="strip" aria-label="Projects">
        <div className="strip-row">
          <h2 className="strip-label">
            {/* The switcher's own heading is also the way home: from any
                workspace it returns to the Projects dashboard. */}
            <Link to="/">Projects</Link>
          </h2>
          <button className="btn accent" onClick={() => setCreating((value) => !value)}>
            {creating ? "Cancel" : "New project"}
          </button>

          {creating ? (
            <ProjectCreateForm
              className="strip-form"
              templates={templates}
              runner={runner}
              onCreated={createProject}
            />
          ) : null}

          <ul className="project-list">
            {projects.map((item) => (
              <li key={item.id}>
                <Link
                  className={item.id === projectId ? "project-item active" : "project-item"}
                  to={`/projects/${item.id}`}
                >
                  <span className="project-name">{item.name}</span>
                  <span className="project-meta">
                    {item.status} · {item.completeness}%
                  </span>
                </Link>
              </li>
            ))}
            {projects.length === 0 ? <li className="muted">No projects yet.</li> : null}
          </ul>
        </div>
      </nav>

      <main className={projectReady ? "main" : "main main--blank"}>
          {!projectReady ? (
            <div className="empty" role={openFailed ? undefined : "status"}>
              {openFailed ? (
                <>
                  <h1>Project not available</h1>
                  <p>
                    We couldn&apos;t open this project. It may have been deleted, or it may belong
                    to a different account.
                  </p>
                  <div className="empty-actions">
                    <Link className="btn" to="/">
                      Back to Projects
                    </Link>
                  </div>
                </>
              ) : (
                <p className="muted">Opening project&hellip;</p>
              )}
            </div>
          ) : null}
          {projectReady && project ? (
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
                {(["chat", "content", "spec", "preview", "files"] as Tab[]).map((name) => (
                  <button
                    key={name}
                    className={tab === name ? "tab active" : "tab"}
                    onClick={() => setTab(name)}
                  >
                    {name === "chat"
                      ? "Interview"
                      : name === "content"
                        ? "Content & assets"
                        : name === "spec"
                          ? "Specification"
                          : name === "files"
                            ? "Files & export"
                            : "Preview"}
                  </button>
                ))}
              </nav>

              {tab === "chat" ? (
                <div className="workspace">
                  <div className="panel interview">
                    <div className="transcript" ref={messagesRef}>
                      {messages.map((message, index) => {
                        const question = index === messages.length - 1 ? activeQuestion : null;
                        // The introduction lives in the context column; while it
                        // is also the last message its question still opens here.
                        const lead = intro !== null && index === 0;
                        if (lead && !question) return null;
                        return (
                          <article
                            key={message.id}
                            className={`msg ${message.role}${lead ? " msg--lead" : ""}`}
                          >
                            {lead ? null : (
                              <>
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
                              </>
                            )}
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

                  <aside className="context">
                    {intro ? (
                      <div className="assistant-block">
                        <div className="msg-role">
                          <span className="msg-square" aria-hidden="true" />
                          Luvify assistant
                        </div>
                        <div className="msg-body">{intro.content}</div>
                      </div>
                    ) : null}
                    {requirementsSection}
                    {checklist ? (
                      <section className="brief-nudge">
                        <span className="req-label">Content &amp; assets</span>
                        <p className="req-note">
                          {checklist.ready
                            ? `All set - ${checklist.provided} details and files provided.`
                            : checklist.missingLabels.length > 0
                              ? `${checklist.missing} still missing, e.g. ${checklist.missingLabels
                                  .slice(0, 2)
                                  .join(", ")}`
                              : `${checklist.missing} still missing`}
                        </p>
                        <button className="btn" onClick={() => setTab("content")}>
                          {checklist.ready ? "Review content" : "Open Content & assets"}
                        </button>
                      </section>
                    ) : null}
                  </aside>
                </div>
              ) : null}

              {tab === "content" ? (
                brief && requirements ? (
                  <ContentPanel
                    projectId={project.id}
                    brief={brief}
                    requirements={requirements}
                    assets={assets}
                    runner={runner}
                    onBriefSaved={setBrief}
                    onAssetsChanged={setAssets}
                    notice={setNotice}
                  />
                ) : (
                  <div className="panel">
                    <p className="muted">Loading content&hellip;</p>
                  </div>
                )
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
              {tab !== "chat" ? requirementsSection : null}
            </div>
          ) : null}
        </main>

      {confirmingDelete && projectReady && project ? (
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
