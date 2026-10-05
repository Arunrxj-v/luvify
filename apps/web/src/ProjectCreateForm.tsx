/**
 * The "New project" form, shared by the Projects dashboard and the workspace
 * strip. Same fields, same validation, one implementation - so creating a
 * project behaves identically no matter which screen it starts from.
 *
 * The form owns the draft only. Execution (busy/error state) belongs to the
 * screen's runner, and the created project is handed back for that screen to
 * place in its own flow: the dashboard opens it, the workspace switches to it.
 */

import { useState, type FormEvent } from "react";
import {
  WEBSITE_TYPES,
  WEBSITE_TYPE_LABELS,
  type CreateProjectRequest,
  type ProjectDetailDto,
  type TemplateDto,
} from "@luvify/shared";
import { api } from "./api";
import type { Runner } from "./shell";

const initialDraft: CreateProjectRequest = {
  name: "",
  businessDescription: "",
  websiteType: "business",
};

export function ProjectCreateForm({
  templates,
  runner,
  onCreated,
  className,
}: {
  templates: TemplateDto[];
  runner: Runner;
  onCreated: (project: ProjectDetailDto) => void | Promise<void>;
  /** Extra classes on the form itself (the screen owns the surrounding box). */
  className?: string;
}): JSX.Element {
  const [draft, setDraft] = useState<CreateProjectRequest>(initialDraft);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runner.run("create", async () => {
      const created = await api<ProjectDetailDto>("/api/projects", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      // Only a successful create resets the draft: a failed attempt keeps the
      // typed values so nothing has to be written twice.
      setDraft(initialDraft);
      await onCreated(created);
    });
  };

  return (
    <form className={"form" + (className ? ` ${className}` : "")} onSubmit={submit}>
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
            onChange={(event) => setDraft({ ...draft, templateId: event.target.value || undefined })}
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
        className={"btn ink" + (runner.busy === "create" ? " is-loading" : "")}
        type="submit"
        disabled={runner.busy === "create"}
      >
        Create project
      </button>
    </form>
  );
}
