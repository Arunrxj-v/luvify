/**
 * Projects dashboard - the authenticated home screen.
 *
 * This is where every session starts: `/` renders this list and nothing here
 * ever auto-opens a project. A workspace only appears once the user picks a
 * card, which is what makes the URL (`/projects/:id`) an honest record of an
 * explicit choice - browser back therefore walks from a workspace to this list.
 *
 * The list comes straight from `GET /api/projects`, which the server scopes to
 * the signed-in user, so no screen here can ever see another account's work.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  WEBSITE_TYPE_LABELS,
  type HealthResponseDto,
  type ProjectDetailDto,
  type ProjectSummaryDto,
  type TemplateDto,
} from "@luvify/shared";
import { api } from "./api";
import { Banner, AppHeader, useRunner } from "./shell";
import { ProjectCreateForm } from "./ProjectCreateForm";

/** "3 Oct" style stamp for the card footer - enough to tell projects apart. */
function updatedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `Updated ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

export function ProjectsHome(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const runner = useRunner();

  const [health, setHealth] = useState<HealthResponseDto | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  /**
   * True once the list request has completed at least once. Until then the
   * screen shows a loading line - never the empty state, which would claim
   * "no projects" a moment before the user's projects arrive.
   */
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  /**
   * Carried over from a workspace that just changed state (deletion), so the
   * result of an action stays visible after landing back on the home screen.
   */
  const [notice, setNotice] = useState<string | null>(
    () => ((location.state as { notice?: string } | null)?.notice ?? null),
  );

  const refreshProjects = useCallback(async (): Promise<ProjectSummaryDto[]> => {
    const list = await api<ProjectSummaryDto[]>("/api/projects");
    setProjects(list);
    return list;
  }, []);

  // `run` is stable (a ref-backed callback), so this boots exactly once per
  // mount instead of chasing every busy/error update the runner produces.
  const { run } = runner;

  // Boot the screen: system status, the template choices for the create form,
  // and the caller's own projects. No project is opened here - by design.
  useEffect(() => {
    void run("boot", async () => {
      const [healthResponse, templateList] = await Promise.all([
        api<HealthResponseDto>("/api/health"),
        api<TemplateDto[]>("/api/templates"),
      ]);
      setHealth(healthResponse);
      setTemplates(templateList);
      await refreshProjects();
      setProjectsLoaded(true);
    });
  }, [refreshProjects, run]);

  /**
   * Creating is an explicit choice, so the new project opens the way a click
   * would: navigate to it rather than swapping any state behind the user's
   * back.
   */
  const onCreated = async (created: ProjectDetailDto) => {
    await refreshProjects();
    setCreating(false);
    navigate(`/projects/${created.id}`);
  };

  return (
    <div className="app">
      <AppHeader health={health} />

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

      <main className="home">
        <div className="home-head">
          <div className="home-heading">
            <h1 className="home-title">Projects</h1>
            {projects.length > 0 ? (
              <p className="home-sub muted">Select a project to open its workspace.</p>
            ) : null}
          </div>

          {projects.length > 0 || creating ? (
            <button className="btn primary" onClick={() => setCreating((value) => !value)} disabled={runner.busy === "create"}>
              {creating ? "Cancel" : "New project"}
            </button>
          ) : null}
        </div>

        {creating ? (
          <ProjectCreateForm
            className="home-form"
            templates={templates}
            runner={runner}
            onCreated={onCreated}
          />
        ) : null}

        {!projectsLoaded ? (
          <p className="muted home-loading" role="status">
            Loading projects&hellip;
          </p>
        ) : projects.length > 0 ? (
          <ul className="home-grid">
            {projects.map((item) => (
              <li key={item.id}>
                <Link className="home-card" to={`/projects/${item.id}`}>
                  <span className="home-card-head">
                    <span className="home-card-name">{item.name}</span>
                    <span className="home-card-go" aria-hidden="true">
                      →
                    </span>
                  </span>
                  <span className="home-card-meta">
                    <span className="home-card-status">{item.status}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.completeness}%</span>
                  </span>
                  <span className="meter home-meter">
                    <span style={{ width: `${item.completeness}%` }} />
                  </span>
                  <span className="home-card-foot">
                    {WEBSITE_TYPE_LABELS[item.websiteType as keyof typeof WEBSITE_TYPE_LABELS] ?? item.websiteType}
                    {" · "}
                    {updatedLabel(item.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <section className="empty home-empty">
            <h2>You don&apos;t have any projects yet.</h2>
            <p>
              Create a project, answer a few short questions, then generate the specification, the
              site, a live preview and a deployable export - all from the same validated document.
            </p>
            {!creating ? (
              <div className="empty-actions">
                <button className="btn primary" onClick={() => setCreating(true)}>
                  New project
                </button>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
