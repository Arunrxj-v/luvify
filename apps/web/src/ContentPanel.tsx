/**
 * "Content & assets" - the client brief editor.
 *
 * Everything on this screen is rendered from the domain configuration in
 * `@luvify/shared` (`resolveBriefGroups`): pick a website type and the right
 * fields, lists and upload slots appear (menu for a restaurant, rooms for a
 * hotel, doctors for a clinic, ...), plus the groups every website shares.
 * There is no per-domain JSX here on purpose - a new domain is data.
 *
 * The readiness checklist is computed live against the draft, the interview's
 * requirements and the uploaded files, so the banner always answers "what does
 * Luvify still need from me?" honestly: required-and-empty is Missing, the
 * rest is Optional, and nothing here blocks a build.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BRIEF_DOMAIN_OPTIONS,
  briefChecklist,
  briefDomainLabel,
  detectBriefDomain,
  emptyBriefItem,
  isRenderableImage,
  mapCollectionRows,
  resolveBriefGroups,
  type AssetDto,
  type BriefAssetSlotDef,
  type BriefCollectionDef,
  type BriefFieldDef,
  type BriefGroupDef,
  type BriefItem,
  type ProjectBrief,
  type Requirements,
} from "@luvify/shared";
import { deleteAsset, putBrief, uploadAsset } from "./briefApi";
import type { Runner } from "./shell";

interface ContentPanelProps {
  projectId: string;
  brief: ProjectBrief;
  requirements: Requirements;
  assets: AssetDto[];
  runner: Runner;
  onBriefSaved: (brief: ProjectBrief) => void;
  onAssetsChanged: (assets: AssetDto[]) => void;
  notice: (message: string) => void;
}

function acceptFor(slot: BriefAssetSlotDef): string {
  const parts: string[] = [];
  if (slot.kinds.includes("LOGO") || slot.kinds.includes("PHOTO")) parts.push("image/*", ".svg");
  if (slot.kinds.includes("VIDEO")) parts.push("video/*");
  if (slot.kinds.includes("DOCUMENT")) parts.push(".pdf", ".doc", ".docx");
  if (slot.kinds.includes("DATA")) parts.push(".csv", ".tsv", ".xlsx");
  return parts.join(",");
}

/** Drops collection rows the client never filled in, so counts stay honest. */
function pruneBrief(brief: ProjectBrief): ProjectBrief {
  const collections: ProjectBrief["collections"] = {};
  for (const [id, rows] of Object.entries(brief.collections)) {
    const kept = rows.filter((row) => Object.values(row).some((value) => value.trim() !== ""));
    if (kept.length > 0) collections[id] = kept;
  }
  return { ...brief, collections };
}

function AssetList({
  assets,
  onRemove,
  disabled,
}: {
  assets: AssetDto[];
  onRemove: (asset: AssetDto) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <ul className="kit-assets">
      {assets.map((asset) => (
        <li key={asset.id}>
          {isRenderableImage(asset.contentType) ? (
            <img src={asset.url} alt={asset.alt || asset.filename} loading="lazy" />
          ) : (
            <span className="kit-file-ico" aria-hidden="true">
              {asset.kind === "VIDEO" ? "\u25b6" : asset.kind === "DATA" ? "\u2261" : "\ud83d\udcc4"}
            </span>
          )}
          <span className="kit-asset-name" title={asset.filename}>
            {asset.filename}
          </span>
          <span className="tag">{asset.kind}</span>
          <button
            className="btn kit-x"
            aria-label={`Remove ${asset.filename}`}
            onClick={() => onRemove(asset)}
            disabled={disabled}
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ContentPanel(props: ContentPanelProps): JSX.Element {
  const { projectId, brief, requirements, assets, runner, onBriefSaved, onAssetsChanged, notice } = props;
  const { busy, run } = runner;

  const [draft, setDraft] = useState<ProjectBrief>(brief);
  const [dirty, setDirty] = useState(false);
  const [localAssets, setLocalAssets] = useState<AssetDto[]>(assets);
  // Fresh props mid-run (e.g. two files uploaded in one action) must not be
  // overwritten by a stale effect, so the sync tracks which brief it applied.
  const syncedRef = useRef<ProjectBrief>(brief);

  useEffect(() => {
    if (syncedRef.current === brief) return;
    syncedRef.current = brief;
    setDraft(brief);
    setDirty(false);
    setLocalAssets(assets);
  }, [assets, brief, projectId]);

  const detectedDomain = useMemo(() => detectBriefDomain(requirements), [requirements]);
  const activeDomain = draft.domain || detectedDomain;
  const groups = useMemo(() => resolveBriefGroups(activeDomain), [activeDomain]);

  const assetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const asset of localAssets) counts[asset.category] = (counts[asset.category] ?? 0) + 1;
    return counts;
  }, [localAssets]);

  // Live checklist: computed against the DRAFT so edits show up immediately.
  const checklist = useMemo(
    () => briefChecklist(draft, requirements, assetCounts),
    [assetCounts, draft, requirements],
  );

  const slotIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) for (const slot of group.assets ?? []) ids.add(slot.id);
    return ids;
  }, [groups]);
  const otherAssets = localAssets.filter((asset) => !slotIds.has(asset.category));

  // --- draft editing ---------------------------------------------------------

  const setField = (groupId: string, fieldId: string, value: string): void => {
    setDirty(true);
    setDraft((prev) => ({
      ...prev,
      fields: { ...prev.fields, [groupId]: { ...(prev.fields[groupId] ?? {}), [fieldId]: value } },
    }));
  };

  const setCollection = (collectionId: string, rows: BriefItem[]): void => {
    setDirty(true);
    setDraft((prev) => ({ ...prev, collections: { ...prev.collections, [collectionId]: rows } }));
  };

  const replaceLocalAssets = (next: AssetDto[]): void => {
    setLocalAssets(next);
    onAssetsChanged(next);
  };

  // --- actions ---------------------------------------------------------------

  const save = (): void => {
    void run("brief-save", async () => {
      const cleaned = pruneBrief(draft);
      const response = await putBrief(projectId, cleaned);
      syncedRef.current = response.brief;
      setDraft(response.brief);
      setDirty(false);
      onBriefSaved(response.brief);
      notice("Content saved - it is used by the next Build / Regenerate");
    });
  };

  const uploadTo = (slot: BriefAssetSlotDef, list: FileList | null): void => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    void run(`upload:${slot.id}`, async () => {
      const uploaded: AssetDto[] = [];
      for (const file of files) {
        uploaded.push((await uploadAsset(projectId, { file, category: slot.id })).asset);
      }
      replaceLocalAssets([...localAssets, ...uploaded]);
      notice(
        `${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded - they appear on your site from the next Build / Regenerate`,
      );
    });
  };

  const importRows = (collection: BriefCollectionDef, list: FileList | null): void => {
    const file = list?.[0];
    if (!file) return;
    void run(`import:${collection.id}`, async () => {
      const result = await uploadAsset(projectId, { file, category: "" });
      if (result.asset) replaceLocalAssets([...localAssets, result.asset]);
      if (!result.parsed || result.parsed.rows.length === 0) {
        throw new Error("No rows found - the file needs a header row plus data rows (CSV/TSV/TXT).");
      }
      const mapped = mapCollectionRows(collection, result.parsed.columns, result.parsed.rows);
      if (mapped.length === 0) {
        throw new Error(
          `No columns matched this list - a "${collection.fields[0]?.label ?? "name"}" column is required.`,
        );
      }
      const existing = draft.collections[collection.id] ?? [];
      setCollection(collection.id, [...existing, ...mapped]);
      notice(`Imported ${mapped.length} rows into ${collection.title} - press Save to keep them`);
    });
  };

  const removeAsset = (asset: AssetDto): void => {
    void run(`asset-delete:${asset.id}`, async () => {
      const result = await deleteAsset(projectId, asset.id);
      replaceLocalAssets(localAssets.filter((entry) => entry.id !== asset.id));
      notice(
        result.documentUpdated
          ? "File removed - the live site already dropped it"
          : "File removed",
      );
    });
  };

  // --- field rendering -------------------------------------------------------

  const renderField = (group: BriefGroupDef, field: BriefFieldDef): JSX.Element => {
    const value = draft.fields[group.id]?.[field.id] ?? "";
    const id = `brief-${group.id}-${field.id}`;
    const label = (
      <label htmlFor={id}>
        {field.label}
        {field.required ? <span className="kit-req"> *</span> : null}
      </label>
    );
    if (field.type === "longtext") {
      return (
        <div className="kit-field kit-field--wide" key={field.id}>
          {label}
          <textarea
            id={id}
            rows={3}
            value={value}
            placeholder={field.placeholder ?? ""}
            onChange={(event) => setField(group.id, field.id, event.target.value)}
          />
          {field.help ? <p className="muted small">{field.help}</p> : null}
        </div>
      );
    }
    if (field.type === "select") {
      return (
        <div className="kit-field" key={field.id}>
          {label}
          <select
            id={id}
            value={value}
            onChange={(event) => setField(group.id, field.id, event.target.value)}
          >
            <option value="">No preference</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {field.help ? <p className="muted small">{field.help}</p> : null}
        </div>
      );
    }
    if (field.type === "color") {
      return (
        <div className="kit-field" key={field.id}>
          {label}
          <span className="kit-color">
            <input
              id={id}
              type="color"
              value={value || "#000000"}
              onChange={(event) => setField(group.id, field.id, event.target.value)}
            />
            <input
              type="text"
              value={value}
              placeholder="#d34318"
              onChange={(event) => setField(group.id, field.id, event.target.value)}
            />
          </span>
        </div>
      );
    }
    return (
      <div className="kit-field" key={field.id}>
        {label}
        <input
          id={id}
          type={
            field.type === "email"
              ? "email"
              : field.type === "tel"
                ? "tel"
                : field.type === "url"
                  ? "url"
                  : "text"
          }
          value={value}
          placeholder={field.placeholder ?? ""}
          onChange={(event) => setField(group.id, field.id, event.target.value)}
        />
        {field.help ? <p className="muted small">{field.help}</p> : null}
      </div>
    );
  };

  const renderCollection = (collection: BriefCollectionDef): JSX.Element => {
    const rows = draft.collections[collection.id] ?? [];
    return (
      <div className="kit-collection" key={collection.id}>
        <div className="kit-subhead">
          <h4>
            {collection.title} <span className="tag">{rows.length}</span>
            {collection.required ? <span className="tag kit-tag-warn">Required</span> : null}
          </h4>
          <div className="row">
            <label className="btn kit-file-btn">
              Import CSV
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                hidden
                onChange={(event) => {
                  importRows(collection, event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              className="btn ink"
              onClick={() => setCollection(collection.id, [...rows, emptyBriefItem(collection)])}
            >
              + {collection.addLabel}
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="muted small">
            Nothing here yet. Add rows one by one, or import a spreadsheet exported as CSV - these
            become real content on your site.
          </p>
        ) : (
          <div className="kit-table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  {collection.fields.map((field) => (
                    <th key={field.id}>{field.label}</th>
                  ))}
                  <th aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {collection.fields.map((field) => (
                      <td key={field.id}>
                        <input
                          value={row[field.id] ?? ""}
                          placeholder={field.placeholder ?? ""}
                          onChange={(event) => {
                            const next = rows.map((entry, rowIndex) =>
                              rowIndex === index
                                ? { ...entry, [field.id]: event.target.value }
                                : entry,
                            );
                            setCollection(collection.id, next);
                          }}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="btn kit-x"
                        aria-label={`Remove row ${index + 1}`}
                        onClick={() =>
                          setCollection(
                            collection.id,
                            rows.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {collection.csvHeaders && collection.csvHeaders.length > 0 ? (
          <p className="muted small">
            CSV header ideas: <code>{collection.csvHeaders.slice(0, 6).join(", ")}</code>
          </p>
        ) : null}
      </div>
    );
  };

  const renderSlot = (slot: BriefAssetSlotDef): JSX.Element => {
    const files = localAssets.filter((asset) => asset.category === slot.id);
    return (
      <div className="kit-slot" key={slot.id}>
        <div className="kit-subhead">
          <h4>
            {slot.title} <span className="tag">{files.length}</span>
            {slot.required ? <span className="tag kit-tag-warn">Required</span> : null}
          </h4>
          <label className="btn kit-file-btn">
            Upload
            <input
              type="file"
              multiple={slot.multiple}
              accept={acceptFor(slot)}
              hidden
              onChange={(event) => {
                uploadTo(slot, event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {slot.help ? <p className="muted small">{slot.help}</p> : null}
        {files.length > 0 ? (
          <AssetList assets={files} onRemove={removeAsset} disabled={busy !== null} />
        ) : null}
      </div>
    );
  };

  const renderGroup = (group: BriefGroupDef): JSX.Element => (
    <details className="kit-group" key={group.id} open>
      <summary>
        <span>{group.title}</span>
        <span className="tag">
          {checklist.groups.find((entry) => entry.id === group.id)?.state ?? ""}
        </span>
      </summary>
      <div className="kit-body">
        {group.help ? <p className="muted small">{group.help}</p> : null}
        {group.fields && group.fields.length > 0 ? (
          <div className="kit-fields">{group.fields.map((field) => renderField(group, field))}</div>
        ) : null}
        {(group.collections ?? []).map((collection) => renderCollection(collection))}
        {(group.assets ?? []).map((slot) => renderSlot(slot))}
      </div>
    </details>
  );

  return (
    <div className="panel kit">
      <header className="kit-head">
        <div>
          <h3>Content &amp; assets</h3>
          <p className="muted small">
            Your real business details and files. The next Build / Regenerate uses them instead of
            placeholder content - prices, contact details and photos are never invented when you
            provide them.
          </p>
        </div>
        <div className="kit-head-actions">
          <label className="kit-domain">
            <span className="kit-domain-label">Website type</span>
            <select
              value={draft.domain}
              onChange={(event) => {
                setDirty(true);
                setDraft((prev) => ({ ...prev, domain: event.target.value }));
              }}
            >
              <option value="">Auto ({briefDomainLabel(detectedDomain)})</option>
              {BRIEF_DOMAIN_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {dirty ? <span className="tag kit-tag-warn">Unsaved changes</span> : null}
          <button
            className={"btn accent" + (busy === "brief-save" ? " is-loading" : "")}
            onClick={save}
            disabled={!dirty || busy !== null}
          >
            Save
          </button>
        </div>
      </header>

      <div className={checklist.ready ? "kit-banner kit-banner--ready" : "kit-banner"}>
        <strong>
          {checklist.ready
            ? `${checklist.provided} provided - Luvify has everything it needs`
            : `${checklist.missing} thing${checklist.missing === 1 ? "" : "s"} will improve your website`}
        </strong>
        {checklist.missingLabels.length > 0 ? (
          <ul className="kit-missing">
            {checklist.missingLabels.slice(0, 8).map((label) => (
              <li key={label}>{label}</li>
            ))}
            {checklist.missingLabels.length > 8 ? (
              <li>+{checklist.missingLabels.length - 8} more</li>
            ) : null}
          </ul>
        ) : (
          <p className="muted small">
            Optional additions (more photos, FAQs, preferences) are always welcome below.
          </p>
        )}
        <p className="muted small kit-counts">
          Provided {checklist.provided} · Missing {checklist.missing} · Optional{" "}
          {checklist.optional}
        </p>
      </div>

      {groups.map((group) => renderGroup(group))}

      {otherAssets.length > 0 ? (
        <details className="kit-group" open>
          <summary>
            <span>Other uploads</span>
            <span className="tag">{otherAssets.length}</span>
          </summary>
          <div className="kit-body">
            <p className="muted small">
              Files not tied to a slot above (imports, spare images). Photos here still get used
              where they fit.
            </p>
            <AssetList assets={otherAssets} onRemove={removeAsset} disabled={busy !== null} />
          </div>
        </details>
      ) : null}

      <p className="muted small kit-foot">
        Files are private to this project and never appear on anyone else&apos;s site. PDFs and
        Excel files are stored safely for now; paste their rows into a list if you want them on the
        page itself.
      </p>
    </div>
  );
}
