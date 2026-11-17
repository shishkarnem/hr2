import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  FileText,
  ListChecks,
  MessageSquare,
  Award,
  RotateCcw,
  Upload,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Shuffle,
} from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import RichMarkdown from "@/components/RichMarkdown";
import { ResumeDropzone, detectFileTypeFromNameOrMime } from "@/components/ResumeDropzone";
import AudioField from "@/components/AudioField";
import MiniAudioField from "@/components/MiniAudioField";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";
import { buildThemeCss, hexToRgba } from "@/components/LandingStyleEditor";
import { getUploadService } from "@/services/FileUploadService";
import { useAIWait } from "@/components/AIWaitProvider";
import { aiRestart } from "@/lib/aiClient";
import { getDemoUserId, resetDemoUserId } from "@/lib/demoSession";
import { resolveActiveEmployerId } from "@/lib/actorSession";
import { FN } from "@/config";
import { CandidateFieldsEditorBlock } from "@/components/CandidateFieldsEditorBlock";
import { parseVacancyCustomFieldsConfig } from "@/constants/candidateFields";

type ChecklistQKind = "choice" | "multichoice" | "text" | "paragraph";
type ChecklistQ = {
  id: string;
  kind: ChecklistQKind;
  question: string;
  options?: any;
  correct?: any;
  correct_options?: any;
  expected_answer?: string | null;
};
type Situation = { id: string; title: string; brief: string; criteria?: string };
type Stage = "intro" | "resume" | "checklist" | "situations" | "done";

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeQuestionKind(raw: any): ChecklistQKind {
  const k = String(raw || "").toLowerCase().trim();
  if (k === "multichoice" || k === "multiple_choice" || k === "checkbox") return "multichoice";
  if (k === "paragraph" || k === "textarea" || k === "long_text") return "paragraph";
  if (k === "choice" || k === "single_choice" || k === "radio" || k === "select") return "choice";
  return "text";
}

function prepareChecklistQuestions(rawList: any[]): ChecklistQ[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const hasMulti = rawList.some((q) => normalizeQuestionKind(q?.kind) === "multichoice");
  const hasPara = rawList.some((q) => normalizeQuestionKind(q?.kind) === "paragraph");
  let cIdx = 0;
  let oIdx = 0;
  const totalChoice = rawList.filter((q) => {
    const k = normalizeQuestionKind(q?.kind);
    return k === "choice" || k === "multichoice";
  }).length;
  const totalOpen = rawList.length - totalChoice;

  const normalized: ChecklistQ[] = rawList.map((q, idx) => {
    let kind = normalizeQuestionKind(q?.kind);
    if (!hasMulti && kind === "choice") {
      cIdx++;
      if (cIdx > Math.ceil(totalChoice / 2)) kind = "multichoice";
    }
    if (!hasPara && kind === "text") {
      oIdx++;
      if (oIdx > Math.ceil(totalOpen / 2)) kind = "paragraph";
    }

    if (kind === "choice" || kind === "multichoice") {
      const opts = Array.isArray(q?.options) && q.options.length >= 2
        ? shuffleArray(q.options.map((o: any) => String(o || "").trim()).filter(Boolean))
        : shuffleArray(["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"]);
      const correctOpts = Array.isArray(q?.correct_options)
        ? q.correct_options
        : typeof q?.correct === "string" && q.correct.includes("||")
        ? q.correct.split("||").map((s: string) => s.trim()).filter(Boolean)
        : q?.correct
        ? [String(q.correct)]
        : [];
      return {
        id: q?.id || `q${idx + 1}`,
        kind,
        question: String(q?.question || ""),
        options: opts,
        correct: q?.correct || correctOpts.join(" || ") || opts[0] || "",
        correct_options: correctOpts,
      };
    }

    return {
      id: q?.id || `q${idx + 1}`,
      kind,
      question: String(q?.question || ""),
      options: null,
      correct: null,
      expected_answer: String(q?.expected_answer || q?.correct || ""),
    };
  });

  return shuffleArray(normalized);
}

async function call(fn: string, body: any) {
  try {
    const directFileUrl =
      typeof body?.file_url === "string" && body.file_url.startsWith("/")
        ? `${window.location.origin}${body.file_url}`
        : body?.file_url;
    const localRes = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, file_url: directFileUrl }),
    });
    if (localRes.ok) {
      const j = await localRes.json().catch(() => null);
      if (j && !j.error) return j;
    }
  } catch {
    /* fallback to FN */
  }

  const res = await fetch(FN(fn), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) {
    const raw = String(j?.error || "");
    const code =
      res.status === 504 || /504|gateway|timed?\s*out|protalk_5\d\d/i.test(raw)
        ? "ai_timeout"
        : res.status === 402
        ? "no_credits"
        : res.status === 429
        ? "ai_temporary"
        : "ai_temporary";
    throw new Error(code);
  }
  return j;
}

export default function EmployerInterviewPreview() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { run: aiWaitRun } = useAIWait();

  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [vacancyText, setVacancyText] = useState("");
  const [passScore, setPassScore] = useState(70);
  const [employerId, setEmployerId] = useState("100007");
  const [companyTheme, setCompanyTheme] = useState<any>(null);
  const [resumeMd, setResumeMd] = useState("");
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistQ[]>([]);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [antiAi, setAntiAi] = useState<{ resume: boolean; checklist: boolean; situations: boolean }>({
    resume: false,
    checklist: false,
    situations: false,
  });

  const [stage, setStage] = useState<Stage>("intro");
  const restartedRef = useRef(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ url: string; filename: string; fileType?: string } | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeResult, setResumeResult] = useState<any>(null);
  const [customFieldsConfig, setCustomFieldsConfig] = useState<any>(null);

  const [checkAnswers, setCheckAnswers] = useState<Record<string, string | string[]>>({});
  const [checkResult, setCheckResult] = useState<any>(null);
  const [sitAnswers, setSitAnswers] = useState<Record<string, string>>({});
  const [sitResult, setSitResult] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [{ data: blocks }, { data: pr }] = await Promise.all([
        (dbClient as any)
          .from("interview_blocks")
          .select("kind,payload,anti_ai_enabled,settings_json,prompt_override")
          .eq("project_id", projectId),
        (dbClient as any)
          .from("projects")
          .select("role_name,vacancy_text,interview_pass_score,company_id,company_name,employer_id,candidate_fields_config")
          .eq("id", projectId)
          .maybeSingle(),
      ]);
      setProjectName(String((pr as any)?.role_name || ""));
      setVacancyText(String((pr as any)?.vacancy_text || "").slice(0, 5000));
      const dbPass = Number((pr as any)?.interview_pass_score);
      setPassScore(Number.isFinite(dbPass) && dbPass > 0 ? dbPass : 70);
      setCustomFieldsConfig((pr as any)?.candidate_fields_config || null);
      const pEmp = resolveActiveEmployerId(pr as any);
      if (pEmp) setEmployerId(pEmp);
      try {
        const compRes = await fetch("/api/companies").then((r) => (r.ok ? r.json() : []));
        if (Array.isArray(compRes) && pr) {
          const compId = String((pr as any).company_id || "").replace(/^comp-?/i, "");
          const compName = String((pr as any).company_name || "").trim().toLowerCase();
          const empId = String((pr as any).employer_id || "").replace(/\D/g, "");
          const matched =
            compRes.find((c: any) => {
              const cId = String(c.id || "").replace(/^comp-?/i, "");
              const cPid = String(c.public_id || "");
              const cName = String(c.name || "").trim().toLowerCase();
              return (compId && (cId === compId || cPid === compId)) || (compName && cName === compName);
            }) ||
            (empId
              ? compRes.find((c: any) => {
                  const cEmp = String(c.employer_id || c.owner_employer_id || "").replace(/\D/g, "");
                  return cEmp === empId && Boolean(c.theme_config || c.css);
                })
              : undefined);
          const raw = matched?.theme_config || matched?.css;
          if (raw) {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
              setCompanyTheme(parsed);
              if (typeof window !== "undefined") {
                (window as any).__ACTIVE_COMPANY_THEME = parsed;
              }
            }
          }
        }
      } catch {}
      const map: any = {};
      const nextAnti = { resume: false, checklist: false, situations: false };
      (blocks || []).forEach((b: any) => {
        const k = b.kind as "resume" | "checklist" | "situations";
        let pl = b.payload || {};
        if (typeof pl === "string") {
          try {
            pl = JSON.parse(pl);
          } catch {
            pl = {};
          }
        }
        map[k] = pl;
        if (k === "resume" || k === "checklist" || k === "situations") {
          nextAnti[k] = Boolean(
            b.anti_ai_enabled === 1 ||
              b.anti_ai_enabled === true ||
              b.settings_json?.anti_ai_enabled ||
              pl?.anti_ai_enabled
          );
        }
      });
      setAntiAi(nextAnti);
      setResumeMd(String(map.resume?.criteria_md || ""));
      setChecklist(prepareChecklistQuestions(Array.isArray(map.checklist?.questions) ? map.checklist.questions : []));
      setSituations(Array.isArray(map.situations?.situations) ? map.situations.situations : []);
      setLoading(false);
    })();
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__ACTIVE_COMPANY_THEME;
      }
    };
  }, [projectId]);

  const startRestart = async () => {
    if (restartedRef.current) {
      setStage("resume");
      return;
    }
    const demoUserId = getDemoUserId();
    try {
      await aiWaitRun({
        title: "Подготовка ИИ",
        theme: companyTheme,
        task: () => aiRestart(undefined, { demo_user_id: demoUserId }).then(() => ({ ok: true })),
      });
    } catch {}
    restartedRef.current = true;
    setStage("resume");
  };

  const recognizeResume = async (fileObj?: { url: string; filename: string; fileType?: string }) => {
    const target = fileObj || uploadedResume;
    if (!target) return;
    const fType = target.fileType || detectFileTypeFromNameOrMime(target.filename || target.url);
    setParsing(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание резюме",
        theme: companyTheme,
        task: (attempt) =>
          call("ai-ingest-document", {
            entity: "resume",
            entity_id: projectId,
            employer_id: employerId,
            employer_public_id: employerId,
            file_url: target.url,
            filename: target.filename,
            file_type: fType,
            demo_user_id: getDemoUserId(),
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      const text = String(r?.text || r?.result || r?.data?.text || r?.reply || r?.content || "")
        .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim()
        .slice(0, 20000);
      if (text.trim()) {
        setResumeText(text);
      }
    } catch {
      /* handled by overlay */
    } finally {
      setParsing(false);
    }
  };

  const onUploadResume = async (f: File, detectedFileType?: string) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const url = await getUploadService().uploadFromFile(f);
      const fileType = detectedFileType || detectFileTypeFromNameOrMime(f.name, f.type);
      const item = { url, filename: f.name, fileType };
      setUploadedResume(item);
      setUploading(false);
      await recognizeResume(item);
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onResumeLink = async (linkInfo: { url: string; filename: string; fileType: string }) => {
    const item = { url: linkInfo.url, filename: linkInfo.filename, fileType: linkInfo.fileType };
    setUploadedResume(item);
    await recognizeResume(item);
  };

  const submitResume = async () => {
    if (!resumeText.trim() || resumeText.trim().length < 20) return;
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка резюме",
        theme: companyTheme,
        task: (attempt) =>
          call("ai-demo-screen-resume", {
            is_preview: true,
            project_id: projectId,
            employer_id: employerId,
            employer_public_id: employerId,
            anti_ai_enabled: antiAi.resume,
            title: projectName || "Вакансия",
            vacancy_text: vacancyText,
            criteria_md: resumeMd,
            resume_text: resumeText,
            demo_user_id: getDemoUserId(),
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      const baseRes = r.result || r;
      setResumeResult({
        ...baseRes,
        standard_fields: baseRes.standard_fields ?? r.standard_fields ?? {},
        custom_fields: baseRes.custom_fields ?? r.custom_fields ?? {},
      });
      setChecklist((prev) => prepareChecklistQuestions(prev));
    } catch {}
  };

  const submitChecklist = async () => {
    try {
      const r = await aiWaitRun<any>({
        title: "Проверка чек-листа",
        theme: companyTheme,
        task: (attempt) =>
          call("ai-demo-grade-checklist", {
            is_preview: true,
            project_id: projectId,
            employer_id: employerId,
            employer_public_id: employerId,
            anti_ai_enabled: antiAi.checklist,
            title: projectName || "Вакансия",
            questions: checklist,
            answers: checkAnswers,
            demo_user_id: getDemoUserId(),
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      setCheckResult({ score: r.score, feedback: r.feedback });
      setStage("situations");
    } catch {}
  };

  const submitSituations = async () => {
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка ролевых ответов",
        theme: companyTheme,
        task: (attempt) =>
          call("ai-demo-grade-situations", {
            is_preview: true,
            project_id: projectId,
            employer_id: employerId,
            employer_public_id: employerId,
            anti_ai_enabled: antiAi.situations,
            title: projectName || "Вакансия",
            situations,
            answers: sitAnswers,
            demo_user_id: getDemoUserId(),
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      setSitResult({ score: r.score, items: r.items, advice: r.advice });
      setStage("done");
    } catch {}
  };

  const overall = useMemo(() => {
    const scores = [resumeResult?.score, checkResult?.score, sitResult?.score].filter(
      (x): x is number => typeof x === "number"
    );
    return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }, [resumeResult, checkResult, sitResult]);

  const restartAll = () => {
    resetDemoUserId();
    restartedRef.current = false;
    setResumeText("");
    setResumeResult(null);
    setCheckAnswers({});
    setCheckResult(null);
    setSitAnswers({});
    setSitResult(null);
    setChecklist((prev) => prepareChecklistQuestions(prev));
    setStage("intro");
  };

  const shuffleOptionsForQuestion = (qId: string) => {
    setChecklist((prev) =>
      prev.map((q) =>
        q.id === qId && Array.isArray(q.options) && q.options.length > 1
          ? { ...q, options: shuffleArray(q.options) }
          : q
      )
    );
  };

  const pageBg = companyTheme?.pageBgColor
    ? hexToRgba(companyTheme.pageBgColor, companyTheme.pageBgOpacity ?? 100)
    : "#17344F";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#17344F] text-white text-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#E7C768]" />
          Загружаем вакансию…
        </div>
      </div>
    );
  }

  const STEPS: { k: Stage; label: string; Icon: any }[] = [
    { k: "resume", label: "1. Резюме", Icon: FileText },
    { k: "checklist", label: "2. Чек-лист", Icon: ListChecks },
    { k: "situations", label: "3. Ситуации", Icon: MessageSquare },
    { k: "done", label: "Итог", Icon: Award },
  ];

  return (
    <div
      id="employer-interview-preview-root"
      className="min-h-screen relative overflow-hidden p-4 sm:p-6 text-white"
      style={{
        backgroundColor: pageBg,
        backgroundImage: companyTheme?.bgImageUrl ? `url(${companyTheme.bgImageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {companyTheme && (
        <style
          dangerouslySetInnerHTML={{
            __html: buildThemeCss(companyTheme),
          }}
        />
      )}

      {companyTheme?.bgVideoUrl ? (
        <video
          src={companyTheme.bgVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 w-full h-full object-cover pointer-events-none z-0"
        />
      ) : null}

      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <InteractiveLandingBackground
          showBadges={false}
          showSphere={Boolean(companyTheme?.showSphereAnimation ?? companyTheme?.showSphere)}
          showWaves={(companyTheme?.showWaveAnimation ?? companyTheme?.showWaves) !== false}
          themeColors={{
            headingColor: companyTheme?.headingsSolidColor || "#FFFFFF",
            bodyTextColor: companyTheme?.bodyTextColor || "#FFFFFF",
            boldTextColor: companyTheme?.boldTextColor || "#FFFFFF",
            iconColor: companyTheme?.iconColor || "#FFFFFF",
            headingsColorMode: companyTheme?.headingsColorMode || "solid",
            isMonochrome: Boolean(
              companyTheme?.allMediaMonochrome ||
              companyTheme?.sitePreviewMonochrome ||
              (companyTheme?.headingsSolidColor === "#FFFFFF" && (companyTheme?.pageBgColor === "#000000" || !companyTheme?.pageBgColor))
            ),
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/employer"
            className="inline-flex items-center gap-1.5 text-[#E7C768] hover:underline text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> К панели работодателя
          </Link>
          <span className="text-sm font-bold text-[#17344F] bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] rounded-full px-4 py-1.5">
            Демо для работодателя · без списаний
          </span>
        </div>

        <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-5 space-y-2">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            {projectName || "Вакансия"}
          </h1>
          <p className="text-sm text-white/90">
            Полноценный прогон ИИ-интервью по вашей вакансии без списания лимитов. Проходной балл:{" "}
            <strong className="text-[#E7C768]">{passScore}</strong>.
          </p>
        </div>

        {stage !== "intro" && (
          <div className="flex flex-wrap items-center gap-2">
            {STEPS.map(({ k, label, Icon }) => (
              <div
                key={k}
                className={`px-4 py-2.5 rounded-2xl text-sm font-bold border flex items-center gap-2 ${
                  stage === k
                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768]"
                    : "bg-transparent backdrop-blur-xl text-white border-white/25"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </div>
            ))}
            <button
              type="button"
              onClick={restartAll}
              className="ml-auto text-sm text-white hover:text-[#E7C768] inline-flex items-center gap-1.5 border border-white/25 rounded-2xl px-3.5 py-2 backdrop-blur-xl cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#E7C768]" />
              Начать заново
            </button>
          </div>
        )}

        {/* INTRO */}
        {stage === "intro" && (
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-6 space-y-4 text-center">
            <Sparkles className="w-8 h-8 text-[#E7C768] mx-auto" />
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Готовы пройти своё интервью глазами кандидата?
            </h2>
            <p className="text-sm text-white/90">
              Это бесплатный прогон по вашей вакансии. ИИ оценит резюме, ответы на чек-лист и ситуации точно так же, как реальному кандидату.
            </p>
            <button
              type="button"
              onClick={startRestart}
              className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-6 py-3 rounded-2xl inline-flex items-center gap-2 hover:brightness-105 cursor-pointer"
            >
              Начать <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* RESUME */}
        {stage === "resume" && (
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Этап 1 · Скрининг резюме
            </h2>

            {/* Collapsible Resume Criteria */}
            <div className="rounded-2xl border border-[#E7C768]/45 bg-transparent backdrop-blur-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setCriteriaOpen((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  Критерии оценки резюме по вакансии
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#E7C768]">
                  {criteriaOpen ? "Скрыть" : "Показать"}
                  {criteriaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>
              {criteriaOpen && (
                <div className="px-4 pb-4 pt-2 border-t border-white/15 text-sm text-white/95">
                  <RichMarkdown
                    tone="resume"
                    text={resumeMd || vacancyText || "## Критерии оценки резюме\n- Соответствие опыту и требованиям вакансии"}
                  />
                </div>
              )}
            </div>

            <ResumeDropzone
              uploading={uploading}
              parsing={parsing}
              uploaded={uploadedResume}
              hasRecognizedText={resumeText.trim().length > 20}
              onFile={(f, detectedType) => onUploadResume(f, detectedType)}
              onUrl={(linkInfo) => onResumeLink(linkInfo)}
              onSend={() => recognizeResume()}
              onClear={() => setUploadedResume(null)}
              sendLabel="Распознать резюме"
              activeTheme={companyTheme}
            />

            <AudioField
              value={resumeText}
              onChange={setResumeText}
              placeholder="Вставьте текст резюме или загрузите файл выше — текст распознается автоматически..."
              maxLength={10000}
            />

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={submitResume}
                className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl inline-flex items-center gap-2 cursor-pointer"
              >
                Отправить на оценку <Send className="w-4 h-4" />
              </button>
              {resumeResult && (
                <button
                  type="button"
                  onClick={() => setStage("checklist")}
                  className="border border-[#E7C768] text-[#fceabb] font-bold text-sm px-5 py-2.5 rounded-2xl inline-flex items-center gap-2 cursor-pointer"
                >
                  Перейти к чек-листу →
                </button>
              )}
            </div>

            {resumeResult && (
              <div className="space-y-4 pt-3 border-t border-white/15">
                <div className="p-4 rounded-2xl border border-[#E7C768]/50 backdrop-blur-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-[#E7C768]">Оценка резюме ИИ</span>
                    <span className="px-3.5 py-1 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-extrabold">
                      {resumeResult.score ?? 0} / 100
                    </span>
                  </div>
                  {resumeResult.summary && (
                    <p className="text-sm text-white/90 whitespace-pre-wrap">{resumeResult.summary}</p>
                  )}
                </div>

                <CandidateFieldsEditorBlock
                  initialStandardFields={resumeResult.standard_fields || {}}
                  initialCustomFields={resumeResult.custom_fields || {}}
                  customFieldsConfig={parseVacancyCustomFieldsConfig(customFieldsConfig).customFields}
                  persistToDb={false}
                  isEditable={true}
                  title="Извлеченные поля резюме кандидата (предпоказ без сохранения в БД)"
                  subtitle="Проверьте и при необходимости отредактируйте распознанные значения 26 стандартных и кастомных полей"
                  onSaved={({ standardFields, customFields }) => {
                    setResumeResult((prev: any) =>
                      prev
                        ? {
                            ...prev,
                            standard_fields: standardFields,
                            custom_fields: customFields,
                          }
                        : prev
                    );
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* CHECKLIST */}
        {stage === "checklist" && (
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Этап 2 · Чек-лист ({checklist.length} вопр.)
              </h2>
              <button
                type="button"
                onClick={() => setChecklist((prev) => prepareChecklistQuestions(prev))}
                className="px-3.5 py-2 rounded-2xl border border-white/25 text-sm font-bold text-white hover:border-[#E7C768] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Shuffle className="w-4 h-4 text-[#E7C768]" /> Перемешать вопросы
              </button>
            </div>

            <div className="space-y-3.5">
              {checklist.map((q, idx) => {
                const qKind = normalizeQuestionKind(q.kind);
                const rawAns = checkAnswers[q.id];
                const selectedMulti: string[] = Array.isArray(rawAns) ? rawAns : [];
                return (
                  <div
                    key={q.id}
                    className="bg-transparent backdrop-blur-xl border border-white/25 rounded-2xl p-4 space-y-3"
                  >
                    <div className="text-sm font-bold text-white">
                      <span className="text-[#E7C768] mr-1.5">#{idx + 1}.</span>
                      {q.question}
                    </div>
                    {qKind === "choice" && Array.isArray(q.options) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oi) => {
                          const selected = rawAns === opt;
                          return (
                            <button
                              key={`${opt}-${oi}`}
                              type="button"
                              onClick={() => {
                                setCheckAnswers((p) => ({ ...p, [q.id]: opt }));
                                shuffleOptionsForQuestion(q.id);
                              }}
                              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border text-left transition cursor-pointer ${
                                selected
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold"
                                  : "bg-transparent border-white/25 text-white hover:border-[#E7C768]"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : qKind === "multichoice" && Array.isArray(q.options) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oi) => {
                          const checked = selectedMulti.includes(opt);
                          return (
                            <button
                              key={`${opt}-${oi}`}
                              type="button"
                              onClick={() => {
                                const next = checked
                                  ? selectedMulti.filter((x) => x !== opt)
                                  : [...selectedMulti, opt];
                                setCheckAnswers((p) => ({ ...p, [q.id]: next }));
                                shuffleOptionsForQuestion(q.id);
                              }}
                              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border text-left flex items-center gap-2 transition cursor-pointer ${
                                checked
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold"
                                  : "bg-transparent border-white/25 text-white hover:border-[#E7C768]"
                              }`}
                            >
                              <span>{checked ? "☑" : "☐"}</span>
                              <span>{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <MiniAudioField
                        label=""
                        value={typeof rawAns === "string" ? rawAns : ""}
                        onChange={(val) => setCheckAnswers((p) => ({ ...p, [q.id]: val }))}
                        placeholder={
                          qKind === "paragraph"
                            ? "Напишите или надиктуйте развернутый ответ несколькими предложениями..."
                            : "Напишите или надиктуйте краткий ответ..."
                        }
                        minRows={qKind === "paragraph" ? 3 : 1}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={submitChecklist}
                className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl inline-flex items-center gap-2 cursor-pointer"
              >
                Отправить на оценку <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* SITUATIONS */}
        {stage === "situations" && (
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Этап 3 · Ситуации
            </h2>
            <div className="space-y-3.5">
              {situations.map((sit) => (
                <div
                  key={sit.id}
                  className="bg-transparent border border-white/25 rounded-2xl p-4 space-y-3 backdrop-blur-xl"
                >
                  <div className="text-base font-bold text-[#E7C768]">{sit.title}</div>
                  <div className="text-sm text-white/90 whitespace-pre-line">{sit.brief}</div>
                  <AudioField
                    value={sitAnswers[sit.id] || ""}
                    onChange={(val) => setSitAnswers((p) => ({ ...p, [sit.id]: val }))}
                    placeholder={`Напишите или надиктуйте голосом ваш ответ для ситуации «${sit.title}»...`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={submitSituations}
                className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl inline-flex items-center gap-2 cursor-pointer"
              >
                Отправить на оценку <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* DONE */}
        {stage === "done" && (
          <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
              <Award className="w-5 h-5 text-[#E7C768]" />
              Итог демо-интервью
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              {[
                { label: "Резюме", v: resumeResult?.score },
                { label: "Чек-лист", v: checkResult?.score },
                { label: "Ситуации", v: sitResult?.score },
              ].map((x) => (
                <div
                  key={x.label}
                  className="bg-transparent backdrop-blur-xl border border-white/25 rounded-2xl p-4"
                >
                  <div className="text-sm text-[#E7C768] font-bold">{x.label}</div>
                  <div className="text-2xl font-bold text-white mt-1">{x.v ?? "—"}</div>
                </div>
              ))}
            </div>
            <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-2xl p-5 text-center space-y-1">
              <div className="text-sm text-white/85 font-bold">Средний балл</div>
              <div className="text-3xl font-bold text-[#E7C768]">{overall}</div>
              <div className="text-sm font-bold text-white">
                {overall >= passScore ? `Проходит порог ${passScore}` : `Ниже порога ${passScore}`}
              </div>
            </div>

            {resumeResult && (
              <CandidateFieldsEditorBlock
                initialStandardFields={resumeResult.standard_fields || {}}
                initialCustomFields={resumeResult.custom_fields || {}}
                customFieldsConfig={parseVacancyCustomFieldsConfig(customFieldsConfig).customFields}
                persistToDb={false}
                isEditable={true}
                title="Данные анкеты и резюме кандидата (предпоказ без записи в БД)"
                onSaved={({ standardFields, customFields }) => {
                  setResumeResult((prev: any) =>
                    prev
                      ? {
                          ...prev,
                          standard_fields: standardFields,
                          custom_fields: customFields,
                        }
                      : prev
                  );
                }}
              />
            )}
            <div className="flex gap-3 flex-wrap pt-2">
              <button
                type="button"
                onClick={restartAll}
                className="text-sm text-white hover:text-[#E7C768] inline-flex items-center gap-1.5 border border-white/25 rounded-2xl px-4 py-2.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-[#E7C768]" />
                Пройти заново
              </button>
              <Link
                to="/employer"
                className="ml-auto text-sm bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold px-5 py-2.5 rounded-2xl inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Готово
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
