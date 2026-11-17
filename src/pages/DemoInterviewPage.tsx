/**
 * Free public demo of the AI interview flow.
 * Stages run REVERSED for engagement: 1. Situations → 2. Checklist → 3. Resume screening.
 * No auth, no DB persistence, no employer billing — progress lives in localStorage.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Briefcase, ArrowRight, ChevronRight, Loader, Send, RefreshCw, Award, MessageSquare, ListChecks, FileText, Sparkles, Rocket, X, Menu, Chrome, Upload, CheckCircle2, ArrowUpDown } from "lucide-react";
import RRImage from "@/components/RRImage";
import Mascot from "@/components/Mascot";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import AuthModal from "@/components/AuthModal";
import SiteHeader from "@/components/SiteHeader";
import { fetchJobTitles, type JobTitle } from "@/lib/jobTitles";
import { aiRestart } from "@/lib/aiClient";
import { MASCOT } from "@/lib/mascotImages";
import { useAIWait } from "@/components/AIWaitProvider";
import ResumeDropzone, { detectFileTypeFromNameOrMime } from "@/components/ResumeDropzone";
import DisclosureBlock from "@/components/DisclosureBlock";
import { ReviewModal } from "@/components/ReviewsSection";
import RichMarkdown from "@/components/RichMarkdown";
import AudioField from "@/components/AudioField";
import MiniAudioField from "@/components/MiniAudioField";
import { dbClient } from "@/lib/dbClient";
import { getUploadService } from "@/services/FileUploadService";
import {
  loadDemoState, saveDemoState, clearDemoState,
  loadCachedTemplate, saveCachedTemplate, makeInitialState,
  getDemoUserId, resetDemoUserId,
  type DemoState, type DemoTemplate, type DemoStage, type DemoQuestion, type DemoQuestionKind,
} from "@/lib/demoSession";

import { FN } from "@/config";
import { CandidateFieldsEditorBlock } from "@/components/CandidateFieldsEditorBlock";
import { parseVacancyCustomFieldsConfig } from "@/constants/candidateFields";

async function call(fn: string, body: any) {
  try {
    const localRes = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (localRes.ok) {
      const j = await localRes.json().catch(() => null);
      if (j && !j.error) return j;
    }
  } catch { /* ignore local error, fallback to FN */ }

  const res = await fetch(FN(fn), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) {
    // Никогда не пробрасываем raw HTML/HTTP/имя провайдера в UI.
    // Передаём короткий код, AIWaitProvider превратит его в человеко-понятный текст.
    const raw = String(j?.error || "");
    const code =
      res.status === 504 || /504|gateway|timed?\s*out|protalk_5\d\d/i.test(raw)
        ? "ai_timeout"
        : res.status === 402 ? "no_credits"
        : res.status === 429 ? "ai_temporary"
        : "ai_temporary";
    const err: any = new Error(code);
    err.fallbackAvailable = !!j?.fallback_available;
    err.jobId = j?.job_id || null;
    throw err;
  }
  return j;
}

function shuffleChecklist<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function normalizeDemoKind(k: any): DemoQuestionKind {
  const s = String(k || "").toLowerCase().trim();
  if (s === "multichoice" || s === "multi" || s === "checkbox" || s === "multiple") return "multichoice";
  if (s === "paragraph" || s === "textarea" || s === "long_text" || s === "longtext") return "paragraph";
  if (s === "text" || s === "short_text" || s === "input") return "text";
  return "choice";
}

function upgradeAndShuffleDemoQuestions(rawQuestions: any[]): DemoQuestion[] {
  const mapped: DemoQuestion[] = (Array.isArray(rawQuestions) ? rawQuestions : [])
    .map((q: any, i: number) => {
      const kind = normalizeDemoKind(q?.kind);
      const isChoiceKind = kind === "choice" || kind === "multichoice";
      const opts = isChoiceKind && Array.isArray(q?.options) && q.options.length >= 2
        ? q.options.map(String).slice(0, 15)
        : isChoiceKind
          ? ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"]
          : null;
      const correctOpts = kind === "multichoice"
        ? (Array.isArray(q?.correct_options) && q.correct_options.length > 0
            ? q.correct_options.map(String)
            : typeof q?.correct === "string" && q.correct.trim()
              ? q.correct.split(/\s*\|\|\s*|[;,]/).map((s: string) => s.trim()).filter(Boolean)
              : opts ? opts.slice(0, 1) : [])
        : null;
      return {
        id: String(q?.id || `q${i + 1}`),
        kind,
        question: String(q?.question || ""),
        options: opts ? shuffleChecklist(opts) : null,
        correct: kind === "multichoice" && correctOpts
          ? correctOpts.join("; ")
          : q?.correct != null ? String(q.correct) : null,
        correct_options: correctOpts,
        expected_answer: q?.expected_answer != null ? String(q.expected_answer) : (q?.explanation ? String(q.explanation) : null),
      };
    })
    .filter((q) => q.question.trim().length > 0);

  if (mapped.length === 0) return [];

  const hasMulti = mapped.some((q) => q.kind === "multichoice");
  const hasPara = mapped.some((q) => q.kind === "paragraph");
  if (!hasMulti || !hasPara) {
    const choices = mapped.filter((q) => q.kind === "choice" || q.kind === "multichoice");
    const texts = mapped.filter((q) => q.kind === "text" || q.kind === "paragraph");
    choices.forEach((q, idx) => {
      const opts = Array.isArray(q.options) && q.options.length >= 2 ? q.options : ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"];
      const primary = q.correct && opts.includes(q.correct) ? q.correct : opts[0];
      if (idx >= Math.ceil(choices.length / 2)) {
        q.kind = "multichoice";
        const second = opts.find((o) => o !== primary) || opts[1] || opts[0];
        q.correct_options = [primary, second];
        q.correct = q.correct_options.join("; ");
        q.options = shuffleChecklist(opts);
      } else {
        q.kind = "choice";
        q.correct = primary;
        q.options = shuffleChecklist(opts);
      }
    });
    texts.forEach((q, idx) => {
      q.kind = idx >= Math.ceil(texts.length / 2) ? "paragraph" : "text";
    });
    return shuffleChecklist([...choices, ...texts]);
  }

  return shuffleChecklist(mapped);
}

function randomizeTemplateChecklist(template: DemoTemplate): DemoTemplate {
  return {
    ...template,
    situations: Array.isArray(template?.situations) ? template.situations : [],
    checklist: upgradeAndShuffleDemoQuestions(Array.isArray(template?.checklist) ? template.checklist : []),
  };
}

const STAGE_ORDER: DemoStage[] = ["situations", "checklist", "resume"];
const STAGE_LABEL: Record<DemoStage, string> = {
  pick: "Выбор",
  restart: "Подготовка",
  situations: "Ситуация",
  checklist: "Чек-лист",
  resume: "Резюме",
  done: "Итог",
};

export default function DemoInterviewPage() {
  const navigate = useNavigate();
  const { run: aiWaitRun } = useAIWait();

  const [state, setState] = useState<DemoState | null>(() => {
    const saved = loadDemoState();
    if (!saved?.template || saved.checkResult) return saved;
    return { ...saved, template: randomizeTemplateChecklist(saved.template) };
  });
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [antiAiEnabled, setAntiAiEnabled] = useState(true);
  const [appVersion, setAppVersion] = useState("v.2.30");

  useEffect(() => {
    fetch("/api/app-version")
      .then((r) => r.json())
      .then((d) => {
        if (d?.version) setAppVersion(String(d.version));
      })
      .catch(() => {});
  }, []);
  const [prepError, setPrepError] = useState("");
  const preparingRef = useRef(false);

  // Resume file upload (mirrors CandidateInterview behaviour).
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedResume, setUploadedResume] = useState<{ url: string; filename: string; fileType?: string } | null>(null);
  const recognizingResumeRef = useRef(false);

  // Load catalog
  useEffect(() => {
    (async () => {
      const rows = await fetchJobTitles(true);
      setTitles(rows);
    })();
  }, []);

  // Persist state
  useEffect(() => { if (state) saveDemoState(state); }, [state]);

  // Auto-load the interview template from the DB when entering the restart stage.
  // All content (situations / checklist / resume_criteria) is already authored
  // in `job_titles.interview_template` — no AI generation is needed.
  useEffect(() => {
    if (!state || state.stage !== "restart" || state.template || preparingRef.current) return;
    preparingRef.current = true;
    setPrepError("");

    (async () => {
      try {
        // Cached template?
        const cached = loadCachedTemplate(state.titleId);
        if (cached) {
          setState(s => s ? { ...s, template: randomizeTemplateChecklist(cached), checkAnswers: {}, checkResult: null, stage: "situations" } : s);
          return;
        }

        // field_templates — публично безопасны; interview_template читаем через
        // SECURITY DEFINER RPC (содержит правильные ответы).
        const titleStr = titles.find((t) => t.id === state.titleId)?.title || state.title || "Специалист";
        let ft: any = {};
        let it: any = {};
        try {
          const [tplRes, itRes] = await Promise.all([
            dbClient.from("job_titles").select("field_templates").eq("id", state.titleId).maybeSingle(),
            dbClient.rpc("job_title_get_interview_template" as any, { _title: titleStr }),
          ]);
          ft = (tplRes.data as any)?.field_templates || {};
          it = ((itRes.data as any)?.interview_template) || (itRes.data as any) || {};
        } catch { /* ignore database error */ }

        const vacancyText = String(ft.vacancy_text || `Компания ищет специалиста на должность "${titleStr}". Потребуются профессиональные навыки и командное взаимодействие.`).slice(0, 5000);

        let rawSituations = Array.isArray(it?.situations?.situations)
          ? it.situations.situations
          : Array.isArray(it?.situations) ? it.situations : [];
        let situations = rawSituations.map((s: any, i: number) => ({
          id: String(s.id || `s${i + 1}`),
          title: String(s.title || `Ситуация ${i + 1}`),
          brief: String(s.brief || s.text || ""),
          criteria: String(s.criteria || ""),
        })).filter((s: any) => s.brief);

        let rawChecklist = Array.isArray(it?.checklist?.questions)
          ? it.checklist.questions
          : Array.isArray(it?.checklist) ? it.checklist : [];
        let checklist = upgradeAndShuffleDemoQuestions(rawChecklist);

        let resume_criteria = typeof it.resume_criteria === "string"
          ? it.resume_criteria
          : String(
              it?.resume_criteria?.criteria_md ||
              it?.resume_criteria?.text ||
              it?.resume?.criteria_md ||
              ""
            );

        if (!situations.length || !checklist.length) {
          throw new Error("Шаблон собеседования для выбранной должности не найден в базе данных ProTalk.");
        }

        const tpl: DemoTemplate = {
          titleId: state.titleId,
          title: state.title,
          vacancy_text: vacancyText,
          situations,
          checklist,
          resume_criteria,
        };
        saveCachedTemplate(tpl);
        setState(s => s ? { ...s, template: randomizeTemplateChecklist(tpl), checkAnswers: {}, checkResult: null, stage: "situations" } : s);
      } catch (e: any) {
        setPrepError(e?.message || "Не удалось загрузить демо. Попробуйте ещё раз.");
      } finally {
        preparingRef.current = false;
      }
    })();
  }, [state?.stage, state?.titleId, state?.template]);

  const startWithTitle = (t: JobTitle) => {
    resetDemoUserId();
    const s = makeInitialState(t.id, t.title);
    setState(s);
    saveDemoState(s);
  };

  const restartAll = () => {
    clearDemoState();
    // New round = new ProTalk dialog. Drop the demo user id so the next pick
    // mints a fresh one and re-sends /restart.
    resetDemoUserId();
    setState(null);
    setPrepError("");
    preparingRef.current = false;
  };

  const submitSituations = async () => {
    if (!state?.template) return;
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка ролевых ответов",
        task: () =>
          call("ai-demo-grade-situations", {
            title: state.title,
            situations: state.template!.situations,
            answers: state.sitAnswers,
            anti_ai_enabled: antiAiEnabled,
            demo_user_id: getDemoUserId(),
          }),
      });
      if (!r) return;
      setState(s => s ? { ...s, sitResult: { score: r.score, items: r.items, advice: r.advice, ai_detected: r.ai_detected } as any } : s);
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  // Чек-лист — оценивается ИИ, как и в реальном интервью (тот же промпт).
  // Передаём все вопросы (с эталонами correct/expected) и ответы кандидата —
  // нейросеть даёт подробный разбор по каждому пункту, summary, strengths, gaps.
  const submitChecklist = async (useProMax = false) => {
    if (!state?.template) return;
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Проверка чек-листа",
        task: () => call("ai-demo-grade-checklist", {
          title: state.title,
          questions: state.template!.checklist,
          answers: state.checkAnswers,
          anti_ai_enabled: antiAiEnabled,
          demo_user_id: getDemoUserId(),
          use_promax: useProMax,
        }),
      });
      if (!r) return;
      if (r.ok === false) {
        alert(r.error || "Ошибка проверки нейросетью. Попробуйте еще раз.");
        return;
      }
      setState(s => s ? { ...s, checkResult: { score: r.score, feedback: r.feedback, ai_detected: r.ai_detected } as any } : s);
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  const submitResume = async () => {
    if (!state?.template) return;
    if (!state.resumeText.trim() || state.resumeText.trim().length < 50) { alert("Введите резюме (минимум 50 символов)"); return; }
    setBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Оценка резюме",
        task: () => call("ai-demo-screen-resume", {
          title: state.title, vacancy_text: state.template!.vacancy_text || "",
          criteria_md: state.template!.resume_criteria, resume_text: state.resumeText,
          anti_ai_enabled: antiAiEnabled,
          demo_user_id: getDemoUserId(),
        }),
      });
      if (!r) return;
      const baseRes = r.result || r;
      const resumeResult = {
        ...baseRes,
        standard_fields: baseRes?.standard_fields ?? r?.standard_fields ?? {},
        custom_fields: baseRes?.custom_fields ?? r?.custom_fields ?? {},
      };
      const scores = [state.sitResult?.score, state.checkResult?.score, resumeResult?.score].filter((x): x is number => typeof x === "number");
      const finalScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      setState(s => s ? { ...s, resumeResult, finalScore, stage: "done" } : s);
    } catch (e: any) { alert(e?.message || "Ошибка"); }
    finally { setBusy(false); }
  };

  // Ask RR to parse the uploaded file or Google Drive link into clean text (single invocation lock).
  const recognizeUploadedResume = async (fileItem: { url: string; filename: string; fileType?: string }) => {
    if (!fileItem?.url || recognizingResumeRef.current) return;
    recognizingResumeRef.current = true;
    setParsing(true);
    setUploadError("");
    const detectedType = fileItem.fileType || detectFileTypeFromNameOrMime(fileItem.filename || fileItem.url);
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание текста из файла резюме",
        task: () => call("ai-ingest-document", {
          entity: "resume",
          file_url: fileItem.url,
          filename: fileItem.filename,
          file_type: detectedType,
          demo_user_id: getDemoUserId(),
        }),
      });
      if (!r) return;
      const text = String(
        r?.text ||
        r?.result ||
        r?.data?.text ||
        r?.reply ||
        r?.content ||
        ""
      )
        .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim()
        .slice(0, 20000);
      if (!text.trim()) throw new Error("ИИ не смог распознать резюме");
      setState(s => s ? { ...s, resumeText: text } : s);
    } catch (e: any) {
      const msg = e?.message || "Не удалось распознать файл";
      setUploadError("Файл резюме недоступен — загрузите файл заново или проверьте доступ к ссылке.");
      setUploadedResume(null);
      // eslint-disable-next-line no-console
      console.warn("[demo:ingest-resume]", msg);
    } finally {
      setParsing(false);
      recognizingResumeRef.current = false;
    }
  };

  // Upload a resume file and immediately trigger AI text recognition once.
  const onUploadResume = async (f: File, detectedFileType?: string) => {
    if (!f || uploading || parsing || recognizingResumeRef.current) return;
    if (f.size > 10 * 1024 * 1024) { alert("Файл больше 10 МБ"); return; }
    setUploading(true);
    setUploadError("");
    let uploadedItem: { url: string; filename: string; fileType?: string } | null = null;
    try {
      const url = await getUploadService().uploadFromFile(f);
      const fileType = detectedFileType || detectFileTypeFromNameOrMime(f.name, f.type);
      uploadedItem = { url, filename: f.name, fileType };
      setUploadedResume(uploadedItem);
    } catch (e: any) {
      setUploadError(e?.message || "Не удалось загрузить резюме");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    if (uploadedItem) {
      await recognizeUploadedResume(uploadedItem);
    }
  };

  const onResumeLink = async (linkInfo: { url: string; filename: string; fileType: string }) => {
    if (uploading || parsing || recognizingResumeRef.current) return;
    setUploadError("");
    const item = { url: linkInfo.url, filename: linkInfo.filename, fileType: linkInfo.fileType };
    setUploadedResume(item);
    await recognizeUploadedResume(item);
  };

  const sendResumeToRR = async () => {
    if (!uploadedResume) return;
    await recognizeUploadedResume(uploadedResume);
  };

  const filteredTitles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter(t => t.title.toLowerCase().includes(q));
  }, [titles, search]);

  return (
    <div className="bg-transparent min-h-screen text-white font-sans flex flex-col relative">
      <SiteHeader active="demo" />

      <main className="brand-editor bg-transparent max-w-5xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 flex-1 space-y-6">
        {/* Step indicator */}
        {state && state.stage !== "pick" && (
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-2xl p-4 flex items-center gap-3 flex-wrap shadow-xl">
            <div className="text-sm text-white/85">Вакансия:</div>
            <div className="text-sm font-bold text-[#E7C768]">{state.title}</div>
            <button onClick={restartAll} className="ml-auto text-sm text-white/85 hover:text-[#E7C768] underline cursor-pointer">Сменить должность</button>
            <div className="w-full flex items-center gap-2 mt-2">
              {STAGE_ORDER.map((s, i) => {
                const done = state.stage === "done" || STAGE_ORDER.indexOf(state.stage) > i;
                const active = state.stage === s;
                return (
                  <React.Fragment key={s}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold backdrop-blur-md ${
                      active
                        ? "bg-[#E7C768] text-[#17344F]"
                        : done
                        ? "bg-transparent border border-[#E7C768]"
                        : "bg-transparent text-slate-300 border border-white/10"
                    }`}>
                      <span className={done ? "text-[#E7C768]" : ""}>{i + 1}</span>
                      {done ? (
                        <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                          {STAGE_LABEL[s]}
                        </span>
                      ) : (
                        <span>{STAGE_LABEL[s]}</span>
                      )}
                    </div>
                    {i < STAGE_ORDER.length - 1 && <div className="flex-1 h-px bg-white/10" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* PICK STAGE */}
        {(!state || state.stage === "pick") && (
          <PickStage
            titles={titles}
            search={search}
            onSearch={setSearch}
            onPick={startWithTitle}
            totalCount={titles.length}
          />
        )}

        {/* RESTART STAGE */}
        {state && state.stage === "restart" && (
          <div className="bg-[#1E4468]/30 backdrop-blur-xl border border-white/15 rounded-3xl p-8 text-center space-y-5 shadow-xl">
            <div className="flex justify-center">
              <img
                src={prepError ? MASCOT.broken : MASCOT.greeting}
                alt={prepError ? "Ошибка" : "Робот Рекрутер"}
                width={180} height={180}
                loading="eager" decoding="async"
                className="w-40 h-40 md:w-48 md:h-48 object-contain drop-shadow-2xl"
              />
            </div>
            {prepError ? (
              <div className="space-y-3">
                <p className="text-amber-300 text-sm">{prepError}</p>
                <button onClick={() => { preparingRef.current = false; setPrepError(""); setState(s => s ? { ...s } : s); }} className="bg-[#E7C768] text-[#17344F] font-bold text-sm px-4 py-2 rounded-xl">
                  Попробовать снова
                </button>
                <button onClick={restartAll} className="ml-2 text-xs text-slate-300 underline hover:text-white">
                  Выбрать другую должность
                </button>
              </div>
            ) : (
              <>
                <p className="text-base font-semibold text-[#E7C768]">Готовлю интервью для «{state.title}»…</p>
                <p className="text-xs text-slate-300">Загружаем готовые ситуации, чек-лист и критерии резюме.</p>
              </>
            )}
          </div>
        )}

        {/* SITUATIONS */}
        {state && state.stage === "situations" && state.template && (
          <StageCard
            icon={<MessageSquare className="w-5 h-5"/>}
            title="Этап 1 · Ролевая ситуация"
            subtitle="Представьте, что ситуация происходит прямо сейчас. Напишите, что и как вы скажете/сделаете."
          >
            {state.sitResult ? (
              <div className="space-y-3">
                <ScoreBig score={state.sitResult.score} />
                {state.sitResult.advice && <p className="text-sm text-white/90 italic">{state.sitResult.advice}</p>}
                {(state.sitResult.items || []).map(it => (
                  <div key={it.id} className="bg-black/30 border border-white/10 rounded-xl p-3">
                    <div className="text-xs text-[#E7C768] font-bold">{it.id}: {it.score}/100</div>
                    <div className="text-sm text-slate-200 mt-1">{it.feedback}</div>
                  </div>
                ))}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 w-full">
                  <button
                    onClick={() => setState(s => s?.template ? { ...s, template: randomizeTemplateChecklist(s.template), checkAnswers: {}, checkResult: null, stage: "checklist" } : s)}
                    className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-base py-3.5 px-8 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto cursor-pointer"
                  >
                    <span>Перейти к чек-листу</span> <ArrowRight className="w-5 h-5"/>
                  </button>
                  <button
                    onClick={() => setState(s => s ? { ...s, sitAnswers: {}, sitResult: null } : s)}
                    className="bg-white/10 hover:bg-white/20 text-white font-semibold text-sm py-3.5 px-6 rounded-2xl border border-white/15 transition-all flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4"/> <span>Пересдать</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {(state.template.situations || []).map((s, i) => (
                  <div key={s.id} className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3 backdrop-blur-xl">
                    <div className="text-sm text-[#E7C768] font-bold">Ситуация #{i+1}: {s.title}</div>
                    <div className="text-sm text-slate-200 whitespace-pre-wrap">{s.brief}</div>
                    <AudioField
                      value={state.sitAnswers[s.id] || ""}
                      onChange={val => setState(st => st ? { ...st, sitAnswers: { ...st.sitAnswers, [s.id]: val } } : st)}
                      placeholder={`Напишите или надиктуйте голосом ваш ответ для ситуации «${s.title}»...`}
                    />
                  </div>
                ))}
                {busy && <LoadingPhrase entity="interview" />}
                <div className="flex justify-center pt-4">
                  <button
                    disabled={busy}
                    onClick={submitSituations}
                    className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-lg py-4 px-10 rounded-2xl shadow-xl transition-all inline-flex items-center justify-center gap-3 w-full max-w-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {busy ? <Loader className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                    <span>Отправить на оценку</span>
                  </button>
                </div>
              </>
            )}
          </StageCard>
        )}

        {/* CHECKLIST */}
        {state && state.stage === "checklist" && state.template && (
          <StageCard
            icon={<ListChecks className="w-5 h-5"/>}
            title="Этап 2 · Чек-лист профессии"
            subtitle="Несколько проверочных вопросов на знания и опыт."
          >
            {state.checkResult ? (
              <div className="space-y-3">
                <ScoreBig score={state.checkResult.score} />
                {state.checkResult.feedback?.summary && <p className="text-sm text-white/90 italic">{state.checkResult.feedback.summary}</p>}
                {(state.checkResult.feedback?.strengths?.length || state.checkResult.feedback?.gaps?.length) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {state.checkResult.feedback.strengths?.length ? (
                      <div className="bg-transparent border border-[#E7C768]/50 rounded-xl p-3">
                        <div className="text-[10px] uppercase font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">Сильные ответы</div>
                        <ul className="list-disc pl-5 text-xs text-[#F4EE8E] mt-1 space-y-0.5">
                          {(state.checkResult.feedback.strengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {state.checkResult.feedback.gaps?.length ? (
                      <div className="bg-transparent border border-white/20 rounded-xl p-3">
                        <div className="text-[10px] uppercase font-bold text-white">Что улучшить</div>
                        <ul className="list-disc pl-5 text-xs text-white/90 mt-1 space-y-0.5">
                          {(state.checkResult.feedback.gaps || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {state.checkResult.feedback?.items?.length ? (
                  <DisclosureBlock title="Подробный разбор по каждому вопросу">
                    <div className="space-y-3 bg-transparent p-1">
                      {(state.checkResult.feedback.items || []).map((it: any) => (
                        <section key={it.id} className="bg-transparent border border-white/15 rounded-lg p-3 space-y-1.5 backdrop-blur-sm">
                          <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug">{it.question}</div>
                          <div className="text-sm text-slate-300">Ваш ответ: <span className="text-white">{it.answer || "—"}</span></div>
                          {it.correct ? (
                            <div className="text-sm font-semibold flex items-center gap-1.5">
                              <span className="text-slate-300 font-normal">Эталон:</span>
                              <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold">
                                {it.correct}
                              </span>
                            </div>
                          ) : null}
                          <div className={`text-sm font-semibold ${it.verdict === "correct" ? "text-[#E7C768]" : it.verdict === "partial" ? "text-[#F4EE8E]" : "text-white"}`}>
                            {it.score}/{it.max} · <span className="font-normal text-slate-200">{it.explanation}</span>
                          </div>
                        </section>
                      ))}
                    </div>
                  </DisclosureBlock>
                ) : null}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 w-full">
                  <button
                    onClick={() => setState(s => s ? { ...s, stage: "resume" } : s)}
                    className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-base py-3.5 px-8 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto cursor-pointer"
                  >
                    <span>Перейти к резюме</span> <ArrowRight className="w-5 h-5"/>
                  </button>
                  <button
                    onClick={() => setState(s => s?.template ? { ...s, template: randomizeTemplateChecklist(s.template), checkAnswers: {}, checkResult: null } : s)}
                    className="bg-white/10 hover:bg-white/20 text-white font-semibold text-sm py-3.5 px-6 rounded-2xl border border-white/15 transition-all flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4"/> <span>Пересдать</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap bg-transparent border border-white/15 rounded-xl px-3.5 py-2.5 backdrop-blur-xl">
                  <span className="text-sm text-white/80">
                    Вопросы перемешаны в случайном порядке. Варианты ответов в списке и мультивыборе перемешиваются при каждом выборе.
                  </span>
                  <button
                    type="button"
                    onClick={() => setState((st) => st?.template ? { ...st, template: randomizeTemplateChecklist(st.template) } : st)}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-[#E7C768] hover:text-[#F4EE8E] border border-[#E7C768]/40 rounded-lg px-3 py-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" /> Перемешать вопросы
                  </button>
                </div>
                {(state.template.checklist || []).map((q, i) => {
                  const kind = normalizeDemoKind(q.kind);
                  const kindBadge =
                    kind === "choice" ? "Список (один вариант)" :
                    kind === "multichoice" ? "Мультивыбор (несколько вариантов)" :
                    kind === "paragraph" ? "Абзац (развернутый ответ)" :
                    "Текст (краткий ответ)";
                  const selectedMulti = (state.checkAnswers[q.id] || "")
                    .split(";")
                    .map((s) => s.trim())
                    .filter(Boolean);

                  const shuffleQuestionOptions = (questionId: string) => {
                    setState((st) => {
                      if (!st?.template) return st;
                      const nextChecklist = st.template.checklist.map((item) =>
                        item.id === questionId && Array.isArray(item.options)
                          ? { ...item, options: shuffleChecklist(item.options) }
                          : item
                      );
                      return { ...st, template: { ...st.template, checklist: nextChecklist } };
                    });
                  };

                  return (
                    <div key={q.id} className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3 backdrop-blur-xl">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="text-sm text-[#E7C768] font-bold">Вопрос #{i+1}: {q.question}</div>
                        <span className="text-sm px-2.5 py-0.5 rounded-lg border border-white/20 text-white/80">
                          {kindBadge}
                        </span>
                      </div>
                      {kind === "choice" ? (
                        <div className="space-y-2">
                          {(q.options || []).map((opt: any, oi: number) => {
                            const checked = state.checkAnswers[q.id] === opt;
                            return (
                              <label
                                key={`${q.id}-opt-${oi}-${opt}`}
                                className={`flex items-center gap-2.5 text-sm text-white cursor-pointer rounded-xl px-3.5 py-2.5 border transition ${
                                  checked ? "border-[#E7C768] bg-white/10" : "border-white/15 hover:bg-white/5"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={q.id}
                                  checked={checked}
                                  onChange={() => {
                                    setState(st => st ? { ...st, checkAnswers: { ...st.checkAnswers, [q.id]: opt } } : st);
                                    shuffleQuestionOptions(q.id);
                                  }}
                                  className="accent-[#E7C768] w-4 h-4"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : kind === "multichoice" ? (
                        <div className="space-y-2">
                          {(q.options || []).map((opt: any, oi: number) => {
                            const checked = selectedMulti.includes(opt);
                            return (
                              <label
                                key={`${q.id}-mopt-${oi}-${opt}`}
                                className={`flex items-center gap-2.5 text-sm text-white cursor-pointer rounded-xl px-3.5 py-2.5 border transition ${
                                  checked ? "border-[#E7C768] bg-white/10" : "border-white/15 hover:bg-white/5"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? selectedMulti.filter((x) => x !== opt)
                                      : [...selectedMulti, opt];
                                    setState(st => st ? { ...st, checkAnswers: { ...st.checkAnswers, [q.id]: next.join("; ") } } : st);
                                    shuffleQuestionOptions(q.id);
                                  }}
                                  className="accent-[#E7C768] w-4 h-4 rounded"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : kind === "paragraph" ? (
                        <AudioField
                          value={state.checkAnswers[q.id] || ""}
                          onChange={val => setState(st => st ? { ...st, checkAnswers: { ...st.checkAnswers, [q.id]: val } } : st)}
                          placeholder={`Напишите развернутый ответ (абзац) или надиктуйте голосом на вопрос #${i+1}...`}
                          rows={4}
                        />
                      ) : (
                        <MiniAudioField
                          label=""
                          value={state.checkAnswers[q.id] || ""}
                          onChange={val => setState(st => st ? { ...st, checkAnswers: { ...st.checkAnswers, [q.id]: val } } : st)}
                          placeholder={`Введите краткий ответ или надиктуйте голосом на вопрос #${i+1}...`}
                        />
                      )}
                    </div>
                  );
                })}
                {busy && <LoadingPhrase entity="interview" />}
                <div className="flex justify-center pt-4">
                  <button
                    disabled={busy}
                    onClick={() => submitChecklist(false)}
                    className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-lg py-4 px-10 rounded-2xl shadow-xl transition-all inline-flex items-center justify-center gap-3 w-full max-w-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {busy ? <Loader className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                    <span>Отправить ответы</span>
                  </button>
                </div>
              </>
            )}
          </StageCard>
        )}

        {/* RESUME */}
        {state && state.stage === "resume" && state.template && (
          <StageCard
            icon={<FileText className="w-5 h-5"/>}
            title="Этап 3 · Скрининг резюме"
            subtitle="Вставьте текст своего резюме — ИИ оценит соответствие должности."
          >
            <DisclosureBlock title="Критерии оценки резюме по вакансии">
              <div className="bg-transparent text-slate-100">
                <RichMarkdown
                  tone="resume"
                  text={
                    state.template.resume_criteria ||
                    state.template.vacancy_text ||
                    `## Критерии оценки резюме на должность «${state.title}»\n- Профильный опыт работы\n- Соответствие ключевым задачам вакансии`
                  }
                />
              </div>
            </DisclosureBlock>
            {/* Загрузка резюме на наше облако или вставка ссылки из Google Диска */}
            <ResumeDropzone
              uploading={uploading}
              parsing={parsing}
              uploaded={uploadedResume ? { filename: uploadedResume.filename, url: uploadedResume.url, fileType: uploadedResume.fileType } : null}
              hasRecognizedText={Boolean(state.resumeText.trim())}
              error={uploadError}
              busy={busy}
              onFile={onUploadResume}
              onUrl={onResumeLink}
              onClear={() => setUploadedResume(null)}
              onSend={!state.resumeText.trim() ? sendResumeToRR : undefined}
              sendLabel="Повторить распознавание"
              fileMissing={/Файл резюме недоступен/i.test(uploadError) || /file[_ ](deleted|missing)|no_resume/i.test(uploadError)}
            />
            <DemoResumeField
              value={state.resumeText}
              onChange={(v) => setState(s => s ? { ...s, resumeText: v } : s)}
            />
            {busy && <LoadingPhrase entity="interview" />}
            <div className="flex justify-center pt-4">
              <button
                disabled={busy}
                onClick={submitResume}
                className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-lg py-4 px-10 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 w-full max-w-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {busy ? <Loader className="w-5 h-5 animate-spin"/> : <Award className="w-5 h-5"/>}
                <span>Дать Оценку Резюме</span>
              </button>
            </div>
          </StageCard>
        )}

        {/* DONE */}
        {state && state.stage === "done" && state.template && (
          <DoneStage state={state} onRestart={restartAll} onSignup={() => setAuthOpen(true)} />
        )}
      </main>

      <footer className="bg-transparent backdrop-blur-xl border-t border-[#E7C768]/40 py-8 text-center text-sm text-slate-300">
        © 2026 Робот Рекрутер {appVersion} RR · <button onClick={() => navigate("/")} className="underline hover:text-[#E7C768] cursor-pointer">На главную</button>
      </footer>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} intent="employer" />
    </div>
  );
}

function PickStage({ titles, search, onSearch, onPick, totalCount }: {
  titles: JobTitle[]; search: string; onSearch: (v: string) => void; onPick: (t: JobTitle) => void; totalCount: number;
}) {
  const [sortBy, setSortBy] = useState<"title" | "popularity">("title");
  const [onlyCustom, setOnlyCustom] = useState(false);

  // 1. Deduplicate by lowercased title
  const uniqueTitles = useMemo(() => {
    const map = new Map<string, JobTitle>();
    for (const t of titles) {
      const key = (t.title || "").trim().toLowerCase();
      if (key) {
        const existing = map.get(key);
        if (!existing || (!existing.company_name && t.company_name)) {
          map.set(key, t);
        }
      }
    }
    return Array.from(map.values());
  }, [titles]);

  // 2. Filter & Sort
  const processedTitles = useMemo(() => {
    let list = uniqueTitles;

    // Search query
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.company_name && t.company_name.toLowerCase().includes(q)));
    }

    // Only custom checkbox
    if (onlyCustom) {
      list = list.filter(t => Boolean(t.company_name) || !t.is_basic);
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === "popularity") {
        const popA = a.usage_count ?? 0;
        const popB = b.usage_count ?? 0;
        if (popB !== popA) return popB - popA;
        return a.title.localeCompare(b.title, "ru");
      }
      // Default: title (A-Z)
      return a.title.localeCompare(b.title, "ru");
    });
  }, [uniqueTitles, search, onlyCustom, sortBy]);

  return (
    <div className="space-y-6">
      {/* Promo header */}
      <div className="bg-[#1E4468]/30 backdrop-blur-xl border border-white/15 rounded-3xl p-6 md:p-8 grid md:grid-cols-3 gap-6 items-center shadow-xl">
        <div className="md:col-span-2 space-y-3">
          <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 backdrop-blur-md rounded-full px-3 py-1.5">
            <Sparkles className="w-4 h-4 text-[#E7C768]" />
            <span className="text-[11px] font-semibold text-[#E7C768] uppercase tracking-wider">Бесплатное демо · без регистрации</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight">
            Попробуй интервью с <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">Роботом Рекрутером</span>
          </h1>
          <div className="flex flex-wrap gap-2 text-[11px] text-white font-bold pt-1">
            <span className="bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-1 rounded-md text-white font-bold">1. Ситуация</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#E7C768] mt-1" />
            <span className="bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-1 rounded-md text-white font-bold">2. Чек-лист</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#E7C768] mt-1" />
            <span className="bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-1 rounded-md text-white font-bold">3. Резюме</span>
          </div>
        </div>
        <div className="flex justify-center">
          <Mascot state="greeting" size="md" />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-[#1E4468]/25 backdrop-blur-xl border border-white/15 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-2"><Briefcase className="w-5 h-5"/> Выбери должность</h2>
          <div className="text-xs text-slate-300 font-mono">{processedTitles.length} из {uniqueTitles.length}</div>
        </div>

        {/* Row with search input on left, sort dropdown and custom checkbox on right */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Поиск: Менеджер по продажам, Бухгалтер, SMM..."
              className="w-full bg-black/25 backdrop-blur-md text-sm text-white pl-10 pr-4 py-3 rounded-2xl border border-white/15 focus:outline-none focus:border-[#E7C768] transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Sort */}
            <div className="flex items-center gap-2 bg-transparent backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2.5 text-xs text-white">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#E7C768] shrink-0" />
              <span className="text-slate-300 hidden sm:inline shrink-0">Сортировка:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as "title" | "popularity")}
                className="bg-transparent text-white focus:outline-none font-medium cursor-pointer text-xs"
              >
                <option value="title" className="bg-[#17344F] text-white">По названию (А-Я)</option>
                <option value="popularity" className="bg-[#17344F] text-white">По популярности</option>
              </select>
            </div>

            {/* Checkbox: Only Custom */}
            <label className="flex items-center gap-2 bg-transparent backdrop-blur-md border border-white/20 hover:border-[#E7C768]/50 rounded-2xl px-3.5 py-2.5 text-xs text-white cursor-pointer transition select-none">
              <input
                type="checkbox"
                checked={onlyCustom}
                onChange={e => setOnlyCustom(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-transparent text-[#E7C768] focus:ring-0 cursor-pointer accent-[#E7C768]"
              />
              <span className="font-medium text-slate-200">Только пользовательские</span>
            </label>
          </div>
        </div>

        {processedTitles.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Подходящих должностей не нашлось. Попробуйте изменить фильтры или запрос.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto pr-2">
            {processedTitles.map(t => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                className="text-left bg-white/[0.06] hover:bg-white/[0.14] backdrop-blur-md hover:border-[#E7C768] border border-white/10 rounded-xl p-3.5 transition flex items-center justify-between group h-full cursor-pointer"
              >
                <div className="pr-2 space-y-1 flex-1 min-w-0">
                  <div className="text-xs font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent break-words whitespace-normal leading-snug">{t.title}</div>
                  {t.company_name ? (
                    <div className="text-[10px] text-[#E7C768] font-semibold break-words whitespace-normal">✨ {t.company_name}</div>
                  ) : null}
                  <div className="text-[10px] text-slate-300 font-medium pt-0.5">👥 Прошли интервью: {t.usage_count ?? 0}</div>
                </div>
                <div className="shrink-0 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] p-1.5 rounded-lg group-hover:scale-110 transition self-center">
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StageCard({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1E4468]/25 backdrop-blur-xl border border-white/15 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#E7C768]/20 flex items-center justify-center text-[#E7C768]">{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-300">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ScoreBig({ score }: { score: number }) {
  const isGood = score >= 50;
  return (
    <div
      className={`text-4xl font-extrabold ${
        isGood
          ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
          : "text-white"
      }`}
    >
      {score}/100
    </div>
  );
}

function DoneStage({ state, onRestart, onSignup }: { state: DemoState; onRestart: () => void; onSignup: () => void }) {
  const navigate = useNavigate();
  const final = state.finalScore ?? 0;
  const [reviewOpen, setReviewOpen] = useState(false);
  const finalIsGood = final >= 50;

  return (
    <section className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
      <div className="text-center space-y-3">
        <Award className="w-14 h-14 text-[#E7C768] mx-auto" />
        <div
          className={`text-5xl font-extrabold ${
            finalIsGood
              ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
              : "text-white"
          }`}
        >
          {final}/100
        </div>
        <p className="text-sm text-slate-200">Итоговая оценка по 3 этапам демо-интервью для <b className="text-[#E7C768]">«{state.title}»</b>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile label="Ситуация" score={state.sitResult?.score ?? null} />
        <Tile label="Чек-лист" score={state.checkResult?.score ?? null} />
        <Tile label="Резюме" score={state.resumeResult?.score ?? null} />
      </div>

      {/* 1. Комментарии и разбор по Ситуации */}
      {state.sitResult && (
        <div className="bg-transparent backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="text-xs font-bold text-[#E7C768] uppercase flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Этап 1 · Комментарии по Ситуации ({state.sitResult.score}/100)
            </div>
          </div>
          {state.sitResult.advice && <p className="text-sm text-white/90 italic">{state.sitResult.advice}</p>}
          {(state.sitResult.items || []).map((it) => (
            <div key={it.id} className="bg-transparent border border-white/15 rounded-xl p-3 backdrop-blur-sm">
              <div className="text-xs text-[#E7C768] font-bold">{it.id}: {it.score}/100</div>
              <div className="text-sm text-slate-200 mt-1">{it.feedback}</div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Комментарии и разбор по Чек-листу */}
      {state.checkResult && (
        <div className="bg-transparent backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="text-xs font-bold text-[#E7C768] uppercase flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Этап 2 · Комментарии по Чек-листу ({state.checkResult.score}/100)
            </div>
          </div>
          {state.checkResult.feedback?.summary && (
            <p className="text-sm text-white/90 italic">{state.checkResult.feedback.summary}</p>
          )}
          {(state.checkResult.feedback?.strengths?.length || state.checkResult.feedback?.gaps?.length) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.checkResult.feedback.strengths?.length ? (
                <div className="bg-transparent border border-[#E7C768]/50 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">Сильные ответы</div>
                  <ul className="list-disc pl-5 text-xs text-[#F4EE8E] mt-1 space-y-0.5">
                    {(state.checkResult.feedback.strengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              ) : null}
              {state.checkResult.feedback?.gaps?.length ? (
                <div className="bg-transparent border border-white/20 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-white">Что улучшить</div>
                  <ul className="list-disc pl-5 text-xs text-white/90 mt-1 space-y-0.5">
                    {(state.checkResult.feedback.gaps || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {state.checkResult.feedback?.items?.length ? (
            <DisclosureBlock title="Подробный разбор по каждому вопросу чек-листа">
              <div className="space-y-3 bg-transparent p-1">
                {(state.checkResult.feedback.items || []).map((it: any) => (
                  <section key={it.id} className="bg-transparent border border-white/15 rounded-lg p-3 space-y-1.5 backdrop-blur-sm">
                    <div className="text-sm font-bold text-white leading-snug">{it.question}</div>
                    <div className="text-sm text-slate-300">Ваш ответ: <span className="text-white">{it.answer || "—"}</span></div>
                    {it.correct ? (
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <span className="text-slate-300 font-normal">Эталон:</span>
                        <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold">
                          {it.correct}
                        </span>
                      </div>
                    ) : null}
                    <div className={`text-sm font-semibold ${it.verdict === "correct" ? "text-[#E7C768]" : it.verdict === "partial" ? "text-[#F4EE8E]" : "text-white"}`}>
                      {it.score}/{it.max} · <span className="font-normal text-slate-200">{it.explanation}</span>
                    </div>
                  </section>
                ))}
              </div>
            </DisclosureBlock>
          ) : null}
        </div>
      )}

      {/* 3. Комментарии и разбор по Резюме */}
      {state.resumeResult && (
        <div className="bg-transparent backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="text-xs font-bold text-[#E7C768] uppercase flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Этап 3 · Комментарии по Резюме ({state.resumeResult.score}/100)
            </div>
          </div>
          <p className="text-sm text-white whitespace-pre-wrap">{state.resumeResult.summary}</p>
          {state.resumeResult.strengths?.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Сильные стороны</div>
              <ul className="list-disc pl-5 text-xs text-[#F4EE8E] space-y-0.5 mt-1">{(state.resumeResult.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {state.resumeResult.gaps?.length > 0 && (
            <div>
              <div className="text-sm text-white font-bold">Что улучшить</div>
              <ul className="list-disc pl-5 text-sm text-white/90 space-y-0.5 mt-1">{(state.resumeResult.gaps || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}

          {/* Извлеченные 26 стандартных и кастомных полей из резюме в демо-режиме (без записи в БД) */}
          <div className="pt-3 border-t border-white/15">
            <CandidateFieldsEditorBlock
              initialStandardFields={(state.resumeResult as any).standard_fields || {}}
              initialCustomFields={(state.resumeResult as any).custom_fields || {}}
              customFieldsConfig={parseVacancyCustomFieldsConfig(null).customFields}
              persistToDb={false}
              isEditable={true}
              title="Распознанные ИИ данные анкеты и резюме (демо-режим без записи в БД)"
              subtitle="ИИ автоматически извлек из вашего резюме 26 стандартных и дополнительные кастомные поля вакансии. Вы можете отредактировать любые значения прямо здесь."
              onSaved={({ standardFields, customFields }) => {
                saveDemoState({
                  ...state,
                  resumeResult: {
                    ...state.resumeResult,
                    standard_fields: standardFields,
                    custom_fields: customFields,
                  } as any,
                });
              }}
            />
          </div>
        </div>
      )}

      {/* Кнопка "Оставить отзыв" под комментариями */}
      <div className="flex justify-center pt-2">
        <button
          onClick={() => setReviewOpen(true)}
          className="bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-base py-3.5 px-8 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <MessageSquare className="w-5 h-5" />
          <span>Оставить отзыв о сервисе</span>
        </button>
      </div>

      {/* CTA — рекламный блок */}
      <div className="bg-gradient-to-br from-[#E7C768]/15 to-[#D99E41]/10 border-2 border-[#E7C768]/40 rounded-3xl p-6 text-center space-y-4">
        <h3 className="text-2xl font-bold text-[#E7C768]">Хочешь так же — у себя?</h3>
        <p className="text-sm text-white max-w-xl mx-auto">
          Создай свою систему найма за пару кликов: лендинг вакансии, ИИ-интервью под вашу должность и систему обучения. Бонус +1000 RR при регистрации.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button onClick={onSignup} className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-extrabold text-base px-6 py-3.5 rounded-xl shadow-xl transition inline-flex items-center justify-center gap-2">
            <Rocket className="w-5 h-5" /> Создать свою систему найма
          </button>
          <button onClick={onRestart} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-5 py-3.5 rounded-xl inline-flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Попробовать другую должность
          </button>
          <button onClick={() => navigate("/")} className="text-slate-300 hover:text-white text-sm px-3 py-3.5">
            На главную
          </button>
        </div>
      </div>

      {reviewOpen && <ReviewModal onClose={() => setReviewOpen(false)} />}
    </section>
  );
}

function DemoResumeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [edit, setEdit] = useState(false);
  const empty = !value.trim();
  if (empty || edit) {
    return (
      <div className="space-y-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          maxLength={20000}
          placeholder="Вставьте текст вашего резюме или загрузите файл — ИИ распознает и заполнит это поле автоматически."
          className="w-full bg-transparent text-white border border-white/15 rounded-xl px-3 py-2 text-sm font-mono backdrop-blur-md focus:outline-none focus:border-[#E7C768] transition"
        />
        {!empty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setEdit(false)}
              className="text-xs text-[#E7C768] hover:text-[#F4EE8E] underline underline-offset-2"
            >
              Готово · показать оформление
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-white/15 bg-transparent backdrop-blur-md px-4 py-3 max-h-[520px] overflow-y-auto">
        <RichMarkdown tone="resume">{value}</RichMarkdown>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEdit(true)}
          className="text-xs text-[#E7C768] hover:text-[#F4EE8E] underline underline-offset-2"
        >
          Редактировать текст
        </button>
      </div>
    </div>
  );
}

function Tile({ label, score }: { label: string; score: number | null }) {
  const v = score ?? 0;
  const isGood = v >= 50;
  const color = isGood
    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
    : "text-white";
  return (
    <div className="bg-transparent border border-white/15 backdrop-blur-md rounded-xl p-4 text-center">
      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-300">{label}</div>
      <div className={`text-2xl font-extrabold ${color} mt-1`}>{score == null ? "—" : `${score}/100`}</div>
    </div>
  );
}