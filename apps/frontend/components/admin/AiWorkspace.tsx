"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";

type AiProject = {
  id: string;
  projectKey: string;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AiProjectVersion = {
  id: string;
  projectId: string;
  version: number;
  schemaVersion: string;
  sourceFilename: string | null;
  fileHash: string;
  createdAt: string;
};

type AiAgent = {
  id: string;
  agentKey: string;
  name: string;
  description: string | null;
  useCase: string;
  modelKey: string;
  reviewStatus: string;
  isEnabled: boolean;
  inputSchema: unknown;
  outputSchema: unknown;
};

type AiModel = {
  id: string;
  modelKey: string;
  provider: string;
  modelId: string;
  displayName: string;
  isEnabled: boolean;
};

type ProjectPreview = {
  schemaVersion: string;
  projectName: string;
  projectKey: string;
  modelCount: number;
  agentCount: number;
};

function errorText(error: unknown) {
  if (error instanceof AdminApiError) return `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parseJsonText(text: string) {
  if (!text.trim()) throw new Error("JSON đang trống.");
  return JSON.parse(text) as unknown;
}

function buildPreview(json: unknown): ProjectPreview {
  const source = json && typeof json === "object" ? json as Record<string, unknown> : null;
  const project = source?.project && typeof source.project === "object"
    ? source.project as Record<string, unknown>
    : null;
  const models = Array.isArray(source?.models) ? source.models : [];
  const agents = Array.isArray(source?.agents) ? source.agents : [];
  return {
    schemaVersion: typeof source?.schemaVersion === "string" ? source.schemaVersion : "—",
    projectName: typeof project?.name === "string" ? project.name : "—",
    projectKey: typeof project?.key === "string" ? project.key : "—",
    modelCount: models.length,
    agentCount: agents.length,
  };
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function AiWorkspace() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [tab, setTab] = useState<"load" | "select" | "manual">("load");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [projects, setProjects] = useState<AiProject[]>([]);
  const [versions, setVersions] = useState<AiProjectVersion[]>([]);
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");

  const [fileName, setFileName] = useState<string | null>(null);
  const [projectJsonText, setProjectJsonText] = useState("");
  const [projectPreview, setProjectPreview] = useState<ProjectPreview | null>(null);

  const [manualJsonText, setManualJsonText] = useState("{\n  \"note\": \"Nhập JSON thủ công ở đây\"\n}");
  const [manualSchemaText, setManualSchemaText] = useState("");
  const [manualValidation, setManualValidation] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được Clerk token.");
    return value;
  }, [getToken]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ projects: AiProject[] }>("/api/admin/ai-store/projects", authToken);
      setProjects(result.projects);
      if (!selectedProjectId && result.projects[0]) setSelectedProjectId(result.projects[0].id);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, token]);

  const loadVersions = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ versions: AiProjectVersion[] }>(
        `/api/admin/ai-store/projects/${projectId}/versions`,
        authToken,
      );
      setVersions(result.versions);
      setSelectedVersionId(result.versions[0]?.id || "");
      setAgents([]);
      setModels([]);
      setSelectedAgentId("");
      setSelectedModelId("");
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadAgents = useCallback(async () => {
    if (!selectedVersionId) {
      setError("Chọn project version trước khi Load Agent.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ agents: AiAgent[] }>(
        `/api/admin/ai-store/versions/${selectedVersionId}/agents`,
        authToken,
      );
      setAgents(result.agents);
      setSelectedAgentId(result.agents[0]?.id || "");
      setMessage(`Đã load ${result.agents.length} agent.`);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId, token]);

  const loadModels = useCallback(async () => {
    if (!selectedVersionId) {
      setError("Chọn project version trước khi Load Model.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const result = await adminApiFetch<{ models: AiModel[] }>(
        `/api/admin/ai-store/versions/${selectedVersionId}/models`,
        authToken,
      );
      setModels(result.models);
      setSelectedModelId(result.models[0]?.id || "");
      setMessage(`Đã load ${result.models.length} model.`);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId, token]);

  const handleProjectFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setError(null);
    setMessage(null);
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Chỉ nhận file .json.");
      return;
    }
    try {
      const text = await file.text();
      const json = parseJsonText(text);
      setFileName(file.name);
      setProjectJsonText(safeJson(json));
      setProjectPreview(buildPreview(json));
    } catch (fileError) {
      setError(errorText(fileError));
      setProjectPreview(null);
    }
  }, []);

  const previewProjectJson = useCallback(() => {
    try {
      const json = parseJsonText(projectJsonText);
      setProjectPreview(buildPreview(json));
      setError(null);
      setMessage("JSON project parse được. Backend sẽ validate chặt khi lưu.");
    } catch (previewError) {
      setError(errorText(previewError));
      setProjectPreview(null);
    }
  }, [projectJsonText]);

  const saveProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const json = parseJsonText(projectJsonText);
      const authToken = await token();
      const result = await adminApiFetch<{ counts: { models: number; agents: number } }>(
        "/api/admin/ai-store/projects/load-json",
        authToken,
        {
          method: "POST",
          body: JSON.stringify({ filename: fileName, json }),
        },
      );
      setMessage(`Đã lưu project: ${result.counts.models} model, ${result.counts.agents} agent.`);
      await loadProjects();
      setTab("select");
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setLoading(false);
    }
  }, [fileName, loadProjects, projectJsonText, token]);

  const validateManualJson = useCallback(() => {
    try {
      parseJsonText(manualJsonText);
      if (manualSchemaText.trim()) parseJsonText(manualSchemaText);
      setManualValidation("JSON hợp lệ ở frontend. Backend sẽ validate schema khi lưu draft.");
      setError(null);
    } catch (validateError) {
      setManualValidation(null);
      setError(errorText(validateError));
    }
  }, [manualJsonText, manualSchemaText]);

  const saveManualDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const jsonPayload = parseJsonText(manualJsonText);
      const schema = manualSchemaText.trim() ? parseJsonText(manualSchemaText) : undefined;
      const authToken = await token();
      const result = await adminApiFetch<{ document: { id: string; validationStatus: string } }>(
        "/api/admin/ai-store/documents/manual",
        authToken,
        {
          method: "POST",
          body: JSON.stringify({ schemaVersion: "manual-json", jsonPayload, schema }),
        },
      );
      setMessage(`Đã lưu draft ${result.document.id}. Trạng thái: ${result.document.validationStatus}.`);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setLoading(false);
    }
  }, [manualJsonText, manualSchemaText, token]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadProjects();
  }, [isLoaded, isSignedIn, loadProjects]);

  useEffect(() => {
    if (selectedProjectId) void loadVersions(selectedProjectId);
  }, [loadVersions, selectedProjectId]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) || null,
    [models, selectedModelId],
  );

  if (!isLoaded) return <main className="min-h-screen p-8">Đang tải phiên đăng nhập…</main>;
  if (!isSignedIn) return <main className="min-h-screen p-8">Bạn cần đăng nhập để mở AI Workspace.</main>;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Bếp Sỉ AI</p>
            <h1 className="text-2xl font-bold">AI Workspace</h1>
            <p className="mt-1 text-sm text-slate-500">Load JSON project, chọn agent/model và lưu nháp thủ công.</p>
          </div>
          <div className="flex items-center gap-3">
            <a className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/admin">Admin</a>
            <a className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/">Trang bán hàng</a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            ["load", "Load JSON Project"],
            ["select", "Load Agent / Model"],
            ["manual", "Nhập tay / Lưu nháp"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-700"
              }`}
              onClick={() => setTab(key as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
        {message ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}

        {tab === "load" ? (
          <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Load JSON</h2>
              <p className="mt-1 text-sm text-slate-500">Chọn file project JSON. File chỉ được lưu vào DB sau khi bấm lưu.</p>
              <label className="mt-5 block">
                <span className="text-sm font-semibold">File .json</span>
                <input
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void handleProjectFile(event.target.files?.[0] || null)}
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={previewProjectJson}>
                  Preview JSON
                </button>
                <button
                  className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={loading || !projectJsonText.trim()}
                  onClick={() => void saveProject()}
                >
                  Lưu project
                </button>
              </div>
              {projectPreview ? (
                <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
                  <p><b>File:</b> {fileName || "Nhập trực tiếp"}</p>
                  <p><b>Project:</b> {projectPreview.projectName}</p>
                  <p><b>Key:</b> {projectPreview.projectKey}</p>
                  <p><b>Schema:</b> {projectPreview.schemaVersion}</p>
                  <p><b>Models:</b> {projectPreview.modelCount}</p>
                  <p><b>Agents:</b> {projectPreview.agentCount}</p>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">JSON project</h2>
                <button className="text-sm font-semibold text-slate-600 hover:text-slate-950" onClick={() => setProjectJsonText("")}>Xóa</button>
              </div>
              <textarea
                className="min-h-[520px] w-full rounded-xl border border-slate-300 bg-slate-950 p-4 font-mono text-xs text-slate-50"
                value={projectJsonText}
                onChange={(event) => setProjectJsonText(event.target.value)}
                placeholder="Dán project JSON vào đây hoặc chọn file .json"
              />
            </div>
          </section>
        ) : null}

        {tab === "select" ? (
          <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Chọn project version</h2>
              <label className="mt-4 grid gap-1 text-sm font-semibold">
                Project
                <select className="rounded-lg border border-slate-300 px-3 py-2" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  <option value="">Chọn project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.projectKey}</option>)}
                </select>
              </label>
              <label className="mt-4 grid gap-1 text-sm font-semibold">
                Version
                <select className="rounded-lg border border-slate-300 px-3 py-2" value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)}>
                  <option value="">Chọn version</option>
                  {versions.map((version) => <option key={version.id} value={version.id}>v{version.version} · {formatDate(version.createdAt)}</option>)}
                </select>
              </label>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading || !selectedVersionId} onClick={() => void loadAgents()}>
                  Load Agent
                </button>
                <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading || !selectedVersionId} onClick={() => void loadModels()}>
                  Load Model
                </button>
                <button className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200" disabled={loading} onClick={() => void loadProjects()}>
                  Làm mới
                </button>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold">Agents</h2>
                <select className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2" value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
                  <option value="">Chọn agent</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.agentKey}</option>)}
                </select>
                {selectedAgent ? (
                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                    <p><b>Use case:</b> {selectedAgent.useCase}</p>
                    <p><b>Model key:</b> {selectedAgent.modelKey}</p>
                    <p><b>Review:</b> {selectedAgent.reviewStatus}</p>
                    <p><b>Enabled:</b> {selectedAgent.isEnabled ? "Có" : "Không"}</p>
                    <p className="text-slate-600">{selectedAgent.description || "Không có mô tả."}</p>
                    <details><summary className="cursor-pointer font-semibold">Output schema</summary><pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{safeJson(selectedAgent.outputSchema)}</pre></details>
                  </div>
                ) : <p className="mt-4 text-sm text-slate-500">Chưa load hoặc chưa chọn agent.</p>}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold">Models</h2>
                <select className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2" value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)}>
                  <option value="">Chọn model</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.modelKey}</option>)}
                </select>
                {selectedModel ? (
                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                    <p><b>Provider:</b> {selectedModel.provider}</p>
                    <p><b>Model ID:</b> {selectedModel.modelId}</p>
                    <p><b>Model key:</b> {selectedModel.modelKey}</p>
                    <p><b>Enabled:</b> {selectedModel.isEnabled ? "Có" : "Không"}</p>
                  </div>
                ) : <p className="mt-4 text-sm text-slate-500">Chưa load hoặc chưa chọn model.</p>}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "manual" ? (
          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Nhập JSON thủ công</h2>
              <textarea
                className="mt-4 min-h-[520px] w-full rounded-xl border border-slate-300 bg-slate-950 p-4 font-mono text-xs text-slate-50"
                value={manualJsonText}
                onChange={(event) => setManualJsonText(event.target.value)}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Schema kiểm tra tùy chọn</h2>
              <textarea
                className="mt-4 min-h-[260px] w-full rounded-xl border border-slate-300 bg-slate-950 p-4 font-mono text-xs text-slate-50"
                value={manualSchemaText}
                onChange={(event) => setManualSchemaText(event.target.value)}
                placeholder="Dán JSON schema nếu muốn backend validate. Có thể để trống."
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={validateManualJson}>Validate JSON</button>
                <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading} onClick={() => void saveManualDraft()}>Lưu draft</button>
              </div>
              {manualValidation ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{manualValidation}</p> : null}
              <p className="mt-4 text-sm text-slate-500">Draft thủ công được lưu vào DB, không chạy AI và không áp vào nghiệp vụ.</p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
