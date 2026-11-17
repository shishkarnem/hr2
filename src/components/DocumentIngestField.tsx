import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Sparkles, Link2, Loader2, Send, CheckCircle2, Copy } from "lucide-react";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import type { LoadingEntity } from "@/lib/loadingPhrases";
import { getUploadService } from "@/services/FileUploadService";
import { formatFileNameWithUserAndTimestamp } from "@/lib/fileNaming";
import { resolveActiveEmployerId } from "@/lib/actorSession";

type Entity = "company" | "vacancy" | "training" | "interview";

const BUCKET: Record<Entity, string> = {
  company: "company-uploads",
  vacancy: "vacancy-uploads",
  training: "training-uploads",
  interview: "interview-uploads",
};

// Universal file/URL → RR → markdown → entity field component.
// Lets user upload a file or paste a URL, runs `ai-ingest-document` which returns
// formatted markdown. The text is editable (max 10k chars) and bound to the parent
// entity field via onChange. Optionally exposes "Внести через ИИ" to redistribute
// the text across entity fields via `ai-distribute-text`.
export function DocumentIngestField({
  entity,
  entityId,
  value,
  onChange,
  onDistributed,
  maxLength = 10000,
  label,
  placeholder,
  showDistribute = true,
  showUrl = true,
}: {
  entity: Entity;
  entityId: string;
  value: string;
  onChange: (text: string) => void;
  onDistributed?: (fields: Record<string, any>) => void;
  maxLength?: number;
  label?: string;
  placeholder?: string;
  showDistribute?: boolean;
  showUrl?: boolean;
}) {
  const { run: aiWaitRun } = useAIWait();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [url, setUrl] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  // After a successful upload we keep the file URL + filename so the user
  // can explicitly trigger RR on step 2.
  const [uploaded, setUploaded] = useState<{ url: string; filename: string } | null>(null);
  const [uploadError, setUploadError] = useState("");

  const busy = uploading || sending;

  async function handleFile(f: File) {
    if (!f) return;
    const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
    if (!isPdf) {
      toast.error("Поддерживается только PDF");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const fileUrl = await getUploadService().uploadFromFile(f);
      setUploaded({ url: fileUrl, filename: f.name });
      toast.success("Файл загружен");
    } catch (e: any) {
      const msg = e?.message || "Не удалось загрузить файл";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function callIngest(body: Record<string, unknown>): Promise<any> {
    const directFileUrl = typeof body.file_url === "string" && body.file_url.startsWith("/")
      ? `${window.location.origin}${body.file_url}`
      : body.file_url;
    const forceProMax = typeof window !== "undefined" && Boolean((window as any).__RR_FORCE_PROMAX);
    const effEmpId = resolveActiveEmployerId();
    const finalBody = {
      employer_id: effEmpId,
      employer_public_id: effEmpId,
      ...body,
      file_url: directFileUrl,
      ...(forceProMax ? { use_promax: true } : {}),
    };

    const apiRes = await fetch("/api/ai-ingest-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalBody),
    });
    const raw = await apiRes.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
    if (!apiRes.ok) {
      const code = parsed?.error || raw || `http_${apiRes.status}`;
      console.error("ai-ingest-document failed", apiRes.status, code, parsed);
      throw new Error(`Сервер вернул ${apiRes.status}: ${code}`);
    }
    return parsed;
  }

  async function sendToRR() {
    if (!uploaded) return;
    setSending(true);
    try {
      const data = await aiWaitRun<any>({
        title: "Распознавание документа",
        task: () => callIngest({
          entity, entity_id: entityId,
          file_url: uploaded.url, filename: uploaded.filename,
        }),
      });
      if (!data) return;
      const text = String(data?.text || "").slice(0, maxLength);
      onChange(text);
      toast.success("Документ разобран");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разобрать файл");
    } finally {
      setSending(false);
    }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setSending(true);
    try {
      const data = await aiWaitRun<any>({
        title: "Разбор ссылки",
        task: () => callIngest({ entity, entity_id: entityId, file_url: url.trim() }),
      });
      if (!data) return;
      onChange(String(data?.text || "").slice(0, maxLength));
      setUrl(""); setUrlOpen(false);
      toast.success("Ссылка разобрана");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разобрать ссылку");
    } finally { setSending(false); }
  }

  async function handleDistribute() {
    if (!value.trim()) { toast.error("Сначала добавьте текст"); return; }
    setDistributing(true);
    try {
      const data = await aiWaitRun<any>({
        title: "ИИ разносит данные по полям",
        task: async () => {
          const forceProMax = typeof window !== "undefined" && Boolean((window as any).__RR_FORCE_PROMAX);
          const effEmpId = resolveActiveEmployerId();
          const apiRes = await fetch("/api/ai-distribute-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity,
              entity_id: entityId,
              employer_id: effEmpId,
              employer_public_id: effEmpId,
              text: value.slice(0, maxLength),
              ...(forceProMax ? { use_promax: true } : {}),
            }),
          });
          const resData = await apiRes.json().catch(() => ({}));
          if (!apiRes.ok || resData?.error) {
            throw new Error(resData?.error || `HTTP ${apiRes.status}`);
          }
          return resData;
        },
      });
      if (!data) return;
      onDistributed?.(data?.fields || {});
      toast.success("ИИ разнёс данные по полям");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось разнести");
    } finally { setDistributing(false); }
  }

  return (
    <div className="brand-editor space-y-2 rounded-2xl p-3">
      {label ? <div className="text-sm font-medium text-white">{label}</div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="btn-brand-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Загружаем файл…" : "Загрузить файл"}
        </Button>
        {showUrl ? (
          <Button type="button" size="sm" className="btn-brand-secondary" disabled={busy} onClick={() => setUrlOpen((v) => !v)}>
            <Link2 className="h-4 w-4" /> Вставить ссылку
          </Button>
        ) : null}
        <input ref={fileRef} type="file" className="hidden"
          accept=".pdf,application/pdf"
          onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ""; setUploaded(null); setUploadError(""); }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {showUrl && urlOpen ? (
        <div className="flex gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <Button type="button" size="sm" className="btn-brand-primary" disabled={busy || !url.trim()} onClick={handleUrl}>
            Распознать текст
          </Button>
        </div>
      ) : null}
      {uploaded ? (
        <div className="flex flex-col gap-2 rounded-xl p-3 text-xs text-white" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(231,199,104,0.3)"}}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="h-4 w-4 text-[#E7C768]"/>Файл загружен в хранилище: {uploaded.filename}</span>
            <Button type="button" size="sm" className="btn-brand-primary" disabled={busy} onClick={sendToRR}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Распознать текст
            </Button>
          </div>
          {(() => {
            const formattedName = formatFileNameWithUserAndTimestamp(uploaded.filename || "resume.pdf");
            const shortDisplayUrl = `${window.location.host}/file/${formattedName}`;
            const downloadUrl = `/api/resume-download?url=${encodeURIComponent(uploaded.url)}`;
            return (
              <div className="flex items-center justify-between gap-2 bg-black/40 p-2 rounded-lg font-mono text-[11px] border border-white/10">
                <div className="flex items-center gap-1.5 min-w-0 text-[#E7C768] truncate">
                  <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="text-white/60 font-sans flex-shrink-0">Ссылка на резюме:</span>
                  <a href={downloadUrl} target="_blank" rel="noreferrer" className="underline truncate text-[#E7C768] hover:text-white" title={shortDisplayUrl}>
                    {shortDisplayUrl}
                  </a>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] text-white/80 hover:text-white flex-shrink-0"
                  onClick={() => {
                    const copyUrl = `${window.location.origin}${downloadUrl}`;
                    navigator.clipboard.writeText(copyUrl);
                    toast.success("Ссылка на резюме скопирована!");
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Скопировать
                </Button>
              </div>
            );
          })()}
        </div>
      ) : null}
      {uploadError ? <div className="text-xs text-[#FF4C4C]">{uploadError}</div> : null}
      {sending ? <LoadingPhrase entity={entity} /> : null}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder || "Вставьте текст вручную или загрузите файл…"}
        className="min-h-[180px]"
        maxLength={maxLength}
      />
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>{value.length} / {maxLength}</span>
        {showDistribute ? (
          <Button type="button" size="sm" className="btn-brand-gold" disabled={distributing || !value.trim()} onClick={handleDistribute}>
            {distributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Оформить красиво через ИИ
          </Button>
        ) : null}
      </div>
      {distributing ? <LoadingPhrase entity={entity} /> : null}
    </div>
  );
}