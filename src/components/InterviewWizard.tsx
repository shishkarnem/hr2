import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Wand2,
  FileText,
  ArrowLeft,
  CheckCircle2,
  Info,
  Eye,
  ShieldAlert,
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Minimize2,
  RotateCcw,
  Upload,
  Award,
  ArrowRight,
  ListChecks,
  Play,
  ChevronDown,
  ChevronUp,
  Shuffle,
} from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { resolveActiveEmployerId } from "@/lib/actorSession";
import { packTierPrice, formatRR } from "@/lib/rr";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import FieldHelp from "@/components/FieldHelp";
import AudioField from "@/components/AudioField";
import MiniAudioField from "@/components/MiniAudioField";
import { buildThemeCss, ensureGoogleFontLoaded, hexToRgba } from "@/components/LandingStyleEditor";
import { CompanyThemedLogo } from "@/components/CompanyThemedLogo";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";
import { RichMarkdown } from "@/components/RichMarkdown";
import { ResumeDropzone, detectFileTypeFromNameOrMime } from "@/components/ResumeDropzone";
import { getUploadService } from "@/services/FileUploadService";
import type { JobProject } from "../types";
import { diagLog, tail } from "@/lib/diagLog";
import { pollEmployerJobUntilTerminal, isSuccess } from "@/lib/aiJobs";
import { CandidateFieldsEditorBlock } from "@/components/CandidateFieldsEditorBlock";
import { CandidateFieldsModal } from "@/components/CandidateFieldsModal";
import {
  STANDARD_CANDIDATE_FIELDS,
  parseVacancyCustomFieldsConfig,
  CustomCandidateFieldDef,
} from "@/constants/candidateFields";

type Kind = "resume" | "checklist" | "situations";
type PreviewStage = "resume" | "checklist" | "situations" | "summary" | "done";
type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;

type ChecklistQKind = "choice" | "multichoice" | "text" | "paragraph";
type ChecklistQ = {
  id: string;
  kind: ChecklistQKind;
  question: string;
  options?: string[] | null;
  correct?: string | null;
  correct_options?: string[] | null;
  expected_answer?: string | null;
  criteria?: string;
  explanation?: string;
  points?: number;
};
type Situation = { id: string; title: string; brief: string; criteria: string };

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const QUESTION_KIND_META: Record<ChecklistQKind, { label: string; shortLabel: string; badge: string }> = {
  choice: { label: "Список (одиночный выбор)", shortLabel: "Список", badge: "Список · 1 ответ" },
  multichoice: { label: "Мультивыбор (несколько галочками)", shortLabel: "Мультивыбор", badge: "Мультивыбор · 2–3 ответа" },
  text: { label: "Текст (краткий ответ строкой)", shortLabel: "Текст", badge: "Текст · краткий ответ" },
  paragraph: { label: "Абзац (развернутый ответ)", shortLabel: "Абзац", badge: "Абзац · развернутый ответ" },
};

function normalizeQuestionKind(raw: any): ChecklistQKind {
  const k = String(raw || "").toLowerCase().trim();
  if (k === "multichoice" || k === "multiple_choice" || k === "checkbox") return "multichoice";
  if (k === "paragraph" || k === "textarea" || k === "long_text") return "paragraph";
  if (k === "choice" || k === "single_choice" || k === "radio" || k === "select") return "choice";
  return "text";
}

function normalizeAndShuffleChecklist(rawQuestions: any[], shuffleQuestions = true, shuffleOpts = true): ChecklistQ[] {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return [];
  const hasMulti = rawQuestions.some((q) => normalizeQuestionKind(q?.kind) === "multichoice");
  const hasPara = rawQuestions.some((q) => normalizeQuestionKind(q?.kind) === "paragraph");

  let choiceCounter = 0;
  let openCounter = 0;
  const totalChoice = rawQuestions.filter((q) => {
    const k = normalizeQuestionKind(q?.kind);
    return k === "choice" || k === "multichoice";
  }).length;
  const totalOpen = rawQuestions.length - totalChoice;
  const propPoint = Number((100 / (rawQuestions.length || 1)).toFixed(2));

  const normalized: ChecklistQ[] = rawQuestions.map((q, idx) => {
    let kind = normalizeQuestionKind(q?.kind);
    if (!hasMulti && kind === "choice") {
      choiceCounter++;
      if (choiceCounter > Math.ceil(totalChoice / 2)) kind = "multichoice";
    }
    if (!hasPara && kind === "text") {
      openCounter++;
      if (openCounter > Math.ceil(totalOpen / 2)) kind = "paragraph";
    }

    if (kind === "choice" || kind === "multichoice") {
      const rawOpts = Array.isArray(q?.options) && q.options.length >= 2
        ? q.options.map((o: any) => String(o || "").trim()).filter(Boolean).slice(0, 15)
        : ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"];
      while (rawOpts.length < 2) rawOpts.push(`Вариант ${rawOpts.length + 1}`);
      const opts = shuffleOpts ? shuffleArray(rawOpts) : rawOpts;

      if (kind === "multichoice") {
        let correctOpts: string[] = Array.isArray(q?.correct_options)
          ? q.correct_options.map((c: any) => String(c || "").trim()).filter(Boolean)
          : typeof q?.correct === "string" && q.correct.includes("||")
          ? q.correct.split("||").map((s: string) => s.trim()).filter(Boolean)
          : q?.correct
          ? [String(q.correct).trim()]
          : [];
        if (correctOpts.length === 0 && rawOpts.length >= 1) {
          correctOpts = [rawOpts[0]];
        }
        return {
          id: q?.id || `q${idx + 1}`,
          kind: "multichoice",
          question: String(q?.question || ""),
          options: opts,
          correct_options: correctOpts,
          correct: correctOpts.join(" || "),
          explanation: q?.explanation || "",
          points: propPoint,
        };
      }

      const singleCorrect = String(q?.correct || rawOpts[0] || "");
      return {
        id: q?.id || `q${idx + 1}`,
        kind: "choice",
        question: String(q?.question || ""),
        options: opts,
        correct: singleCorrect,
        correct_options: singleCorrect ? [singleCorrect] : [],
        explanation: q?.explanation || "",
        points: propPoint,
      };
    }

    return {
      id: q?.id || `q${idx + 1}`,
      kind,
      question: String(q?.question || ""),
      options: null,
      correct: null,
      correct_options: null,
      expected_answer: String(q?.expected_answer || q?.correct || ""),
      criteria: String(q?.criteria || (kind === "paragraph" ? "Полнота ответа, глубина понимания, практические примеры" : "Точность, знание терминов и конкретика")),
      explanation: q?.explanation || "",
      points: propPoint,
    };
  });

  const finalArr = shuffleQuestions ? shuffleArray(normalized) : normalized;
  return finalArr.map((item, idx) => ({
    ...item,
    id: item.id || `q${idx + 1}`,
    points: propPoint,
  }));
}

interface Props {
  projects: JobProject[];
  companies?: any[];
  employerId?: string;
  refreshProjects: () => Promise<void> | void;
  addAuditEvent: AuditFn;
  /** When set, opens the editor for this vacancy and locks the picker. */
  initialProjectId?: string;
  /** When set, opens in "create new" mode — user must pick a vacancy. */
  createMode?: boolean;
  /** Back-to-list callback. */
  onBack?: () => void;
}

const KINDS: { key: Kind; title: string; hint: string; saveLabel: string }[] = [
  { key: "resume",     title: "1. Резюме",    hint: "Важные критерии для скрининга", saveLabel: "Сохранить Скрининг" },
  { key: "checklist",  title: "2. Чек-лист",  hint: "20 вопросов: 4 типа полей", saveLabel: "Сохранить чек-лист" },
  { key: "situations", title: "3. Ситуации",  hint: "3 ролевые ситуации", saveLabel: "Сохранить ситуации" },
];

const ANTI_AI_SUPPLEMENTS: Record<Kind, string> = {
  resume:
    "[Защита от нейросетей: проверять резюме и сопроводительный ответ кандидата на признаки генерации нейросетью. Если замечено использование нейросетей, снижать балл в 2 раза.]",
  checklist:
    "[Защита от нейросетей: проверять ответы кандидата в чек-листе на использование нейросетей. Если в ответе на вопрос замечено использование нейросетей, снижать балл в 2 раза на этот вопрос.]",
  situations:
    "[Защита от нейросетей: проверять решения ролевых ситуаций на использование нейросетей. Если в ответе на ситуацию замечено использование нейросетей, снижать балл в 2 раза на этот вопрос.]",
};

const WISH_PLACEHOLDER: Record<Kind, string> = {
  resume:     "Например: «Обязательно опыт от 2 лет в B2B-продажах», «Кандидаты только из РФ», «Игнорировать резюме без релевантного опыта в FMCG».",
  checklist:  "Например: «Больше вопросов про CRM Bitrix24», «Добавь 3 каверзных вопроса с частицей не», «Включи проверку знания скриптов холодных звонков».",
  situations: "Например: «Ситуация со сложным клиентом, требующим скидку 30%», «Ситуация эскалации жалобы», «Кейс срыва сделки в последний момент».",
};
const WISH_EXAMPLE: Record<Kind, string> = {
  resume:     "Что писать: 1) обязательные и желательные навыки и опыт; 2) стоп-факторы (что отсеивает кандидата сразу); 3) на что обратить особое внимание в этой конкретной вакансии (отрасль, продукт, локация).",
  checklist:  "Что писать: 1) акцент на конкретные технологии и продукты, которые надо проверить; 2) формат вопросов (каверзные, практические кейсы, термины); 3) какие темы не нужно включать в вопросы.",
  situations: "Что писать: 1) тип конфликтных или рабочих ситуаций, характерных для вашей компании; 2) стиль поведения контрагента (требовательный или сомневающийся клиент); 3) на какие компетенции делать упор (эмпатия, аргументация, навыки переговоров).",
};

const PROMPT_TITLE: Record<Kind, string> = {
  resume:     "Промт для ИИ — что учитывать при оценке резюме",
  checklist:  "Промт для ИИ — какие навыки и темы проверять",
  situations: "Промт для ИИ — какие сценарии генерировать",
};
const RESULT_TITLE: Record<Kind, string> = {
  resume:     "Результат ИИ — критерии, по которым ИИ оценит резюме кандидата",
  checklist:  "Результат ИИ — чек-лист, который проходит кандидат (ИИ оценивает каждый пункт)",
  situations: "Результат ИИ — ситуации, на которые отвечает кандидат (ИИ оценивает соответствие критериям)",
};

export default function InterviewWizard({
  projects,
  companies,
  employerId,
  refreshProjects,
  addAuditEvent,
  initialProjectId,
  createMode,
  onBack,
}: Props) {
  const { run: aiWaitRun } = useAIWait();
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const lockedProject = !!initialProjectId;
  const [kind, setKind] = useState<Kind>("resume");
  const [resumeMd, setResumeMd] = useState("");
  const [checklist, setChecklist] = useState<ChecklistQ[]>([]);
  const [checklistShuffle, setChecklistShuffle] = useState(true);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [passScore, setPassScore] = useState(70);
  const [interviewLimit, setInterviewLimit] = useState<number>(0);
  const [trainingLimit, setTrainingLimit] = useState<number>(0);
  const [interviewUsed, setInterviewUsed] = useState<number>(0);
  const [trainingUsed, setTrainingUsed] = useState<number>(0);
  const [savedInterviewLimit, setSavedInterviewLimit] = useState<number>(0);
  const [savedTrainingLimit, setSavedTrainingLimit] = useState<number>(0);
  const [savingLimits, setSavingLimits] = useState(false);
  const [savedLimits, setSavedLimits] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showNoBalanceModal, setShowNoBalanceModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<null | Kind | "pass">(null);
  const [savedFlash, setSavedFlash] = useState<null | Kind | "pass">(null);
  const [wishes, setWishes] = useState<Record<Kind, string>>({ resume: "", checklist: "", situations: "" });
  const [antiAi, setAntiAi] = useState<Record<Kind, boolean>>({ resume: false, checklist: false, situations: false });
  const [showExample, setShowExample] = useState<Record<Kind, boolean>>({ resume: false, checklist: false, situations: false });
  const [existingSystems, setExistingSystems] = useState<Set<string>>(new Set());
  const [employerPublicId, setEmployerPublicId] = useState<string>("");

  // Interactive Demo Preview state (free walkthrough without deducting limits)
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [previewStage, setPreviewStage] = useState<PreviewStage>("resume");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewFullscreen, setPreviewFullscreen] = useState<boolean>(false);
  const [previewBusy, setPreviewBusy] = useState<boolean>(false);
  const [previewResumeText, setPreviewResumeText] = useState<string>("");
  const [previewResumeUploading, setPreviewResumeUploading] = useState<boolean>(false);
  const [previewResumeParsing, setPreviewResumeParsing] = useState<boolean>(false);
  const [previewUploadedResume, setPreviewUploadedResume] = useState<{
    url: string;
    filename: string;
    fileType?: string;
  } | null>(null);
  const [previewCriteriaOpen, setPreviewCriteriaOpen] = useState<boolean>(false);
  const [previewQuestions, setPreviewQuestions] = useState<ChecklistQ[]>([]);
  const previewFileRef = useRef<HTMLInputElement | null>(null);
  const [previewResumeResult, setPreviewResumeResult] = useState<{
    score: number;
    raw_score?: number;
    ai_detected?: boolean;
    summary: string;
    strengths: string[];
    gaps: string[];
    standard_fields?: Record<string, any>;
    custom_fields?: Record<string, any>;
  } | null>(null);
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
  const [customFieldsOverride, setCustomFieldsOverride] = useState<CustomCandidateFieldDef[] | null>(null);
  const [previewChecklistAnswers, setPreviewChecklistAnswers] = useState<Record<string, string | string[]>>({});
  const [previewChecklistResult, setPreviewChecklistResult] = useState<{
    score: number;
    ai_detected?: boolean;
    feedback: any;
  } | null>(null);
  const [previewSitAnswers, setPreviewSitAnswers] = useState<Record<string, string>>({});
  const [previewSitResult, setPreviewSitResult] = useState<{
    score: number;
    ai_detected?: boolean;
    advice: string;
    items: { id: string; score: number; raw_score?: number; ai_detected?: boolean; feedback: string }[];
  } | null>(null);

  // Companies list and fetched company theme for AIWaitProvider overlay styling & preview frame
  const [companiesList, setCompaniesList] = useState<any[]>(companies || []);
  const [fetchedCompanyTheme, setFetchedCompanyTheme] = useState<any>(null);

  useEffect(() => {
    if (companies && companies.length > 0) {
      setCompaniesList(companies);
      return;
    }
    let resolvedEmp = employerId || "";
    if (!resolvedEmp) {
      const m = window.location.pathname.match(/\/emp(\d+)/);
      if (m) resolvedEmp = m[1];
    }
    if (!resolvedEmp) {
      resolvedEmp = localStorage.getItem("current_employer_id") || "";
    }
    if (!resolvedEmp) return;
    let cancelled = false;
    fetch(`/api/companies?employerId=${encodeURIComponent(resolvedEmp)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setCompaniesList(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companies, employerId]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await dbClient.auth.getUser();
      if (!user) return;
      const { data } = await (dbClient as any)
        .from("employers")
        .select("public_id, wallets(units_balance)")
        .eq("user_id", user.id)
        .maybeSingle();
      setEmployerPublicId(String((data as any)?.public_id || ""));
      const w = (data as any)?.wallets;
      const bal = Number((Array.isArray(w) ? w[0]?.units_balance : w?.units_balance) ?? 0);
      setWalletBalance(bal);
    })();
  }, []);

  const project = useMemo(
    () =>
      projects.find(
        (p) =>
          p.id === projectId ||
          p.public_id === projectId ||
          (p as any).publicId === projectId ||
          (p as any).slug === projectId
      ) ||
      projects[0] ||
      null,
    [projects, projectId]
  );

  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);

  // Fetch company theme from DB for the selected project's company
  useEffect(() => {
    if (!project) {
      setFetchedCompanyTheme(null);
      return;
    }
    const compId =
      (project as any).company_id ||
      (project as any).companyId ||
      (project as any).company_slug ||
      (project as any).companySlug ||
      (project as any).company_public_id;
    if (!compId) return;
    let cancelled = false;
    fetch(`/api/companies/by-slug/${encodeURIComponent(compId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const comp = data.company || data;
        const raw = comp?.theme_config || comp?.css;
        if (raw) {
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            setFetchedCompanyTheme(parsed);
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project]);

  const effectiveEmployerId = useMemo(() => {
    return resolveActiveEmployerId({
      employer_public_id: employerPublicId,
      employer_id: (project as any)?.employer_public_id || (project as any)?.employer_id || (project as any)?.employerId,
    });
  }, [employerPublicId, project]);

  const activeCompanyObj = useMemo(() => {
    if (!project) return null;
    const compId = String((project as any).company_id || (project as any).companyId || "");
    const compCleanId = compId.replace(/^comp-?/i, "");
    const compPublicId = String((project as any).company_public_id || (project as any).companyPublicId || "");
    const compSlug = String((project as any).company_slug || (project as any).companySlug || "");
    const compName = String(project.companyName || (project as any).company_name || "").trim().toLowerCase();
    const empId = String((project as any).employer_id || (project as any).employerId || "").replace(/\D/g, "");

    return (
      companiesList.find((c) => {
        const cId = String(c.id || "");
        const cPid = String(c.public_id || c.publicId || "");
        const cSlug = String(c.slug || "");
        const cName = String(c.name || "").trim().toLowerCase();
        return (
          (compId && (cId === compId || cPid === compId || cPid === compCleanId)) ||
          (compPublicId && (cPid === compPublicId || cId === compPublicId)) ||
          (compSlug && (cSlug === compSlug || cPid === compSlug)) ||
          (compName && cName === compName)
        );
      }) ||
      (empId
        ? companiesList.find((c) => {
            const cEmp = String(c.employer_id || c.owner_employer_id || c.employerId || "").replace(/\D/g, "");
            return cEmp === empId && Boolean(c.theme_config || c.css);
          })
        : null) ||
      null
    );
  }, [project, companiesList]);

  const activeCompanyTheme = useMemo(() => {
    if (!project) return null;
    const raw =
      fetchedCompanyTheme ||
      activeCompanyObj?.theme_config ||
      activeCompanyObj?.css ||
      (project as any).company?.theme_config ||
      (project as any).company?.css ||
      (project as any).theme_config ||
      (project as any).css;

    if (!raw) return fetchedCompanyTheme;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return fetchedCompanyTheme;
    }
  }, [project, activeCompanyObj, fetchedCompanyTheme]);

  const themeScopeId = useMemo(
    () => `iw-preview-${String(project?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [project?.id]
  );

  const previewPageBg = useMemo(() => {
    if (activeCompanyTheme?.pageBgColor) {
      return hexToRgba(activeCompanyTheme.pageBgColor, activeCompanyTheme.pageBgOpacity ?? 100);
    }
    return "#17344F";
  }, [activeCompanyTheme]);

  const previewCardBoxStyle = useMemo<React.CSSProperties>(() => {
    if (!activeCompanyTheme) return {};
    const bg = activeCompanyTheme.containerBgColor
      ? hexToRgba(activeCompanyTheme.containerBgColor, activeCompanyTheme.containerBgOpacity ?? 25)
      : "transparent";
    const borderCol = activeCompanyTheme.containerBorderColor
      ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 30)
      : "rgba(231, 199, 104, 0.4)";
    const blurPx =
      activeCompanyTheme.containerBlur != null ? Number(activeCompanyTheme.containerBlur) : 16;
    const radiusPx =
      activeCompanyTheme.containerBorderRadius != null ? Number(activeCompanyTheme.containerBorderRadius) : 24;
    return {
      backgroundColor: bg,
      borderColor: borderCol,
      backdropFilter: `blur(${blurPx}px)`,
      WebkitBackdropFilter: `blur(${blurPx}px)`,
      borderRadius: `${radiusPx}px`,
      fontFamily: activeCompanyTheme.fontFamily || undefined,
      color: activeCompanyTheme.bodyTextColor || "#FFFFFF",
    };
  }, [activeCompanyTheme]);

  const previewHeadingStyle = useMemo<React.CSSProperties>(() => {
    if (!activeCompanyTheme) return {};
    if (activeCompanyTheme.headingsColorMode === "solid" && activeCompanyTheme.headingsSolidColor) {
      return {
        backgroundImage: "none",
        WebkitTextFillColor: activeCompanyTheme.headingsSolidColor,
        color: activeCompanyTheme.headingsSolidColor,
        fontFamily: activeCompanyTheme.fontFamily || undefined,
      };
    }
    if (activeCompanyTheme.headingsGradFrom && activeCompanyTheme.headingsGradTo) {
      const via = activeCompanyTheme.headingsGradVia || activeCompanyTheme.headingsGradFrom;
      return {
        backgroundImage: `linear-gradient(90deg, ${activeCompanyTheme.headingsGradFrom}, ${via}, ${activeCompanyTheme.headingsGradTo})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
        fontFamily: activeCompanyTheme.fontFamily || undefined,
      };
    }
    if (activeCompanyTheme.headingsSolidColor) {
      return {
        backgroundImage: "none",
        WebkitTextFillColor: activeCompanyTheme.headingsSolidColor,
        color: activeCompanyTheme.headingsSolidColor,
        fontFamily: activeCompanyTheme.fontFamily || undefined,
      };
    }
    return { fontFamily: activeCompanyTheme.fontFamily || undefined };
  }, [activeCompanyTheme]);

  const previewActiveBtnStyle = useMemo<React.CSSProperties>(() => {
    if (!activeCompanyTheme) return {};
    const radiusPx =
      activeCompanyTheme.btnBorderRadius != null ? Number(activeCompanyTheme.btnBorderRadius) : 16;
    const textCol = activeCompanyTheme.btnActiveTextColor || "#17344F";
    if (activeCompanyTheme.btnActiveMode === "solid" && activeCompanyTheme.btnActiveSolidColor) {
      return {
        backgroundImage: "none",
        backgroundColor: hexToRgba(
          activeCompanyTheme.btnActiveSolidColor,
          activeCompanyTheme.btnActiveOpacity ?? 100
        ),
        color: textCol,
        WebkitTextFillColor: textCol,
        borderColor: activeCompanyTheme.btnBorderColor || activeCompanyTheme.btnActiveSolidColor,
        borderRadius: `${radiusPx}px`,
        fontFamily: activeCompanyTheme.fontFamily || undefined,
      };
    }
    const from = activeCompanyTheme.btnActiveGradFrom || "#F4EE8E";
    const via = activeCompanyTheme.btnActiveGradVia || "#E7C768";
    const to = activeCompanyTheme.btnActiveGradTo || "#D99E41";
    return {
      backgroundImage: `linear-gradient(90deg, ${from}, ${via}, ${to})`,
      color: textCol,
      WebkitTextFillColor: textCol,
      borderColor: activeCompanyTheme.btnBorderColor || via,
      borderRadius: `${radiusPx}px`,
      fontFamily: activeCompanyTheme.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const previewInactiveBtnStyle = useMemo<React.CSSProperties>(() => {
    if (!activeCompanyTheme) return {};
    const radiusPx =
      activeCompanyTheme.btnBorderRadius != null ? Number(activeCompanyTheme.btnBorderRadius) : 16;
    const bg = activeCompanyTheme.btnInactiveBgColor
      ? hexToRgba(activeCompanyTheme.btnInactiveBgColor, activeCompanyTheme.btnInactiveOpacity ?? 15)
      : "transparent";
    const textCol = activeCompanyTheme.btnInactiveTextColor || activeCompanyTheme.bodyTextColor || "#FFFFFF";
    const borderCol = activeCompanyTheme.btnBorderColor
      ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 35)
      : "rgba(255, 255, 255, 0.25)";
    return {
      backgroundImage: "none",
      backgroundColor: bg,
      color: textCol,
      WebkitTextFillColor: textCol,
      borderColor: borderCol,
      borderRadius: `${radiusPx}px`,
      fontFamily: activeCompanyTheme.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  useEffect(() => {
    if (activeCompanyTheme?.fontFamily) {
      ensureGoogleFontLoaded(activeCompanyTheme.fontFamily);
    }
    if (typeof window !== "undefined") {
      if (activeCompanyTheme && Object.keys(activeCompanyTheme).length > 0) {
        (window as any).__ACTIVE_COMPANY_THEME = activeCompanyTheme;
      } else {
        delete (window as any).__ACTIVE_COMPANY_THEME;
      }
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__ACTIVE_COMPANY_THEME;
      }
    };
  }, [activeCompanyTheme]);

  useEffect(() => {
    if (!createMode) return;
    (async () => {
      const ids = projects.map((p) => p.id);
      if (!ids.length) return;
      const { data } = await (dbClient as any).from("interview_systems").select("project_id").in("project_id", ids);
      const set = new Set<string>();
      (data || []).forEach((r: any) => set.add(r.project_id));
      setExistingSystems(set);
    })();
  }, [createMode, projects]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: blocks }, { data: pr }] = await Promise.all([
        (dbClient as any).from("interview_blocks").select("*").eq("project_id", projectId),
        (dbClient as any)
          .from("projects")
          .select("interview_pass_score,role_name,interview_limit,training_limit,interview_used,training_used")
          .eq("id", projectId)
          .maybeSingle(),
      ]);
      const dbPass = Number((pr as any)?.interview_pass_score);
      setPassScore(Number.isFinite(dbPass) && dbPass > 0 ? dbPass : 70);
      setInterviewLimit(Number((pr as any)?.interview_limit ?? 0));
      setTrainingLimit(Number((pr as any)?.training_limit ?? 0));
      setSavedInterviewLimit(Number((pr as any)?.interview_limit ?? 0));
      setSavedTrainingLimit(Number((pr as any)?.training_limit ?? 0));
      setInterviewUsed(Number((pr as any)?.interview_used ?? 0));
      setTrainingUsed(Number((pr as any)?.training_used ?? 0));
      const map: any = {};
      const rowMap: any = {};
      (blocks || []).forEach((b: any) => {
        let pl = b.payload || {};
        if (typeof pl === "string") {
          try {
            pl = JSON.parse(pl);
          } catch {
            pl = {};
          }
        }
        map[b.kind] = pl;
        rowMap[b.kind] = b;
      });
      setResumeMd(String(map.resume?.criteria_md || ""));
      const shouldShuffle = map.checklist?.shuffle !== false;
      setChecklistShuffle(shouldShuffle);
      const rawQuestions = Array.isArray(map.checklist?.questions) ? map.checklist.questions : [];
      // Detect if questions are unshuffled (e.g., all choice first, then all text) or missing 4 types
      const firstHalfSameKind =
        rawQuestions.length >= 6 &&
        rawQuestions.slice(0, 4).every((q: any) => q?.kind === rawQuestions[0]?.kind);
      const preparedQuestions = normalizeAndShuffleChecklist(
        rawQuestions,
        shouldShuffle && firstHalfSameKind,
        true
      );
      setChecklist(preparedQuestions);
      setPreviewQuestions(normalizeAndShuffleChecklist(preparedQuestions, true, true));
      setSituations(Array.isArray(map.situations?.situations) ? map.situations.situations : []);

      const loadedWishes: Record<Kind, string> = {
        resume: String(map.resume?.employer_wishes || rowMap.resume?.prompt_override || ""),
        checklist: String(map.checklist?.employer_wishes || rowMap.checklist?.prompt_override || ""),
        situations: String(map.situations?.employer_wishes || rowMap.situations?.prompt_override || ""),
      };
      setWishes(loadedWishes);

      const resolveAntiAi = (k: Kind) => {
        const row = rowMap[k];
        const pl = map[k];
        let settings: any = row?.settings_json || {};
        if (typeof settings === "string") {
          try { settings = JSON.parse(settings); } catch { settings = {}; }
        }
        return Boolean(
          row?.anti_ai_enabled ||
            pl?.anti_ai_enabled ||
            settings?.anti_ai_enabled ||
            /Защита от нейросетей/i.test(loadedWishes[k] || "")
        );
      };
      setAntiAi({
        resume: resolveAntiAi("resume"),
        checklist: resolveAntiAi("checklist"),
        situations: resolveAntiAi("situations"),
      });
    })();
  }, [projectId]);

  const callEdge = async (fn: string, body: any) => {
    const payload = {
      ...(body || {}),
      ...(typeof window !== "undefined" && (window as any).__RR_FORCE_PROMAX ? { use_promax: true } : {}),
    };
    const localRes = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const localJson = await localRes.json().catch(() => null);
    if (!localRes.ok || localJson?.error) {
      const e: any = new Error(localJson?.error || `HTTP ${localRes.status}`);
      e.jobId = localJson?.job_id || null;
      e.fallbackAvailable = !!localJson?.fallback_available;
      throw e;
    }
    return localJson;
  };

  const flash = (key: Kind | "pass") => {
    setSavedFlash(key);
    setTimeout(() => setSavedFlash((s) => (s === key ? null : s)), 2200);
  };

  const saveBlock = async (k: Kind, payload: any, overrideWishes?: string, overrideAntiAi?: boolean) => {
    if (!projectId) return;
    setSaving(k);
    try {
      const currentWishes = overrideWishes !== undefined ? overrideWishes : (wishes[k] ?? (payload?.employer_wishes || ""));
      const currentAntiAi = overrideAntiAi !== undefined ? overrideAntiAi : Boolean(antiAi[k]);
      const mergedPayload = {
        ...(payload || {}),
        employer_wishes: currentWishes,
        anti_ai_enabled: currentAntiAi,
      };
      const rowData = {
        payload: mergedPayload,
        prompt_override: currentWishes,
        anti_ai_enabled: currentAntiAi ? 1 : 0,
        settings_json: { anti_ai_enabled: currentAntiAi },
      };
      const { data: existing } = await (dbClient as any)
        .from("interview_blocks")
        .select("id")
        .eq("project_id", projectId)
        .eq("kind", k)
        .maybeSingle();
      if (existing?.id) {
        await (dbClient as any).from("interview_blocks").update(rowData).eq("id", existing.id);
      } else {
        await (dbClient as any)
          .from("interview_blocks")
          .insert({ project_id: projectId, kind: k, ...rowData });
      }
      const label = KINDS.find((x) => x.key === k)?.saveLabel || `Блок (${k})`;
      addAuditEvent("success", label, `${label} успешно выполнено`);
      flash(k);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка", e?.message || "save failed");
    } finally {
      setSaving(null);
    }
  };

  const toggleAntiAi = async (k: Kind) => {
    const nextVal = !antiAi[k];
    setAntiAi((prev) => ({ ...prev, [k]: nextVal }));

    const supplement = ANTI_AI_SUPPLEMENTS[k];
    let updatedWish = String(wishes[k] || "");
    if (nextVal) {
      if (!/\[Защита от нейросетей:/i.test(updatedWish)) {
        updatedWish = updatedWish.trim()
          ? `${updatedWish.trim()}\n\n${supplement}`
          : supplement;
      }
    } else {
      updatedWish = updatedWish
        .replace(/\n*\[Защита от нейросетей:[^\]]*\]/gi, "")
        .trim();
    }
    setWishes((prev) => ({ ...prev, [k]: updatedWish }));

    // Immediately persist the updated setting and prompt supplement to the database
    const currentPayload =
      k === "resume"
        ? { criteria_md: resumeMd }
        : k === "checklist"
        ? { questions: checklist, shuffle: checklistShuffle }
        : { situations };
    await saveBlock(k, currentPayload, updatedWish, nextVal);
  };

  // Interactive Demo Preview helpers (free, uses employer chat_id, no limit deduction)
  useEffect(() => {
    setPreviewQuestions(normalizeAndShuffleChecklist(checklist, checklistShuffle, true));
  }, [checklist, checklistShuffle]);

  const resetPreview = () => {
    setPreviewResumeResult(null);
    setPreviewChecklistResult(null);
    setPreviewSitResult(null);
    setPreviewChecklistAnswers({});
    setPreviewSitAnswers({});
    setPreviewQuestions(normalizeAndShuffleChecklist(checklist, true, true));
  };

  const shuffleQuestionOptionsInPreview = (qId: string) => {
    setPreviewQuestions((prev) =>
      prev.map((item) =>
        item.id === qId && Array.isArray(item.options) && item.options.length > 1
          ? { ...item, options: shuffleArray(item.options) }
          : item
      )
    );
  };

  const recognizePreviewResume = async (fileOverride?: {
    url: string;
    filename: string;
    fileType?: string;
  }) => {
    const targetFile = fileOverride || previewUploadedResume;
    if (!targetFile) return;
    const fType =
      targetFile.fileType || detectFileTypeFromNameOrMime(targetFile.filename || targetFile.url);
    setPreviewResumeParsing(true);
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание файла резюме…",
        theme: activeCompanyTheme,
        task: (attempt) =>
          callEdge("ai-ingest-document", {
            entity: "resume",
            entity_id: project?.id || projectId,
            employer_id: effectiveEmployerId,
            employer_public_id: effectiveEmployerId,
            file_url: targetFile.url,
            filename: targetFile.filename,
            file_type: fType,
            use_promax: attempt > 0,
          }),
      });
      const text = String(r?.text || "")
        .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
      if (text) {
        setPreviewResumeText(text);
      }
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка распознавания", e?.message || "Не удалось распознать резюме");
    } finally {
      setPreviewResumeParsing(false);
    }
  };

  const onUploadPreviewResume = async (f: File, detectedFileType?: string) => {
    if (!f) return;
    setPreviewResumeUploading(true);
    try {
      const url = await getUploadService().uploadFromFile(f);
      const fileType = detectedFileType || detectFileTypeFromNameOrMime(f.name, f.type);
      const uploaded = { url, filename: f.name, fileType };
      setPreviewUploadedResume(uploaded);
      setPreviewResumeUploading(false);
      await recognizePreviewResume(uploaded);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка загрузки файла", e?.message || "Не удалось загрузить файл");
    } finally {
      setPreviewResumeUploading(false);
      if (previewFileRef.current) previewFileRef.current.value = "";
    }
  };

  const onPreviewResumeLink = async (linkInfo: { url: string; filename: string; fileType: string }) => {
    const uploaded = {
      url: linkInfo.url,
      filename: linkInfo.filename,
      fileType: linkInfo.fileType,
    };
    setPreviewUploadedResume(uploaded);
    await recognizePreviewResume(uploaded);
  };

  const submitPreviewResume = async () => {
    if (!previewResumeText.trim() || previewResumeText.trim().length < 20) {
      addAuditEvent("warning", "Короткий текст резюме", "Введите или вставьте текст резюме (минимум 20 символов)");
      return;
    }
    setPreviewBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "AI оценивает резюме в режиме демо (без списания лимитов)…",
        theme: activeCompanyTheme,
        task: (attempt) =>
          callEdge("ai-interview-screen-resume", {
            is_preview: true,
            employer_id: effectiveEmployerId,
            employer_public_id: effectiveEmployerId,
            project_id: project?.id || projectId,
            title: project?.roleName || "Специалист",
            vacancy_text: (project as any)?.vacancy_text || "",
            criteria_md: resumeMd,
            employer_wishes: wishes.resume,
            anti_ai_enabled: antiAi.resume,
            resume_text: previewResumeText,
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      const resData = r.result || r;
      setPreviewResumeResult({
        score: Number(resData.score ?? r.score ?? 0),
        raw_score: resData.raw_score ?? r.raw_score,
        ai_detected: Boolean(resData.ai_detected ?? r.ai_detected),
        summary: String(resData.summary || ""),
        strengths: Array.isArray(resData.strengths) ? resData.strengths : [],
        gaps: Array.isArray(resData.gaps) ? resData.gaps : [],
        standard_fields: resData.standard_fields ?? r.standard_fields ?? {},
        custom_fields: resData.custom_fields ?? r.custom_fields ?? {},
      });
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка демо-скрининга", e?.message || "Не удалось проверить резюме");
    } finally {
      setPreviewBusy(false);
    }
  };

  const submitPreviewChecklist = async () => {
    const activeQs = previewQuestions.length > 0 ? previewQuestions : checklist;
    if (activeQs.length === 0) {
      addAuditEvent("warning", "Нет вопросов", "Сначала создайте или сгенерируйте вопросы чек-листа");
      return;
    }
    setPreviewBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "AI проверяет ответы чек-листа в режиме демо (без списания лимитов)…",
        theme: activeCompanyTheme,
        task: (attempt) =>
          callEdge("ai-interview-grade-checklist", {
            is_preview: true,
            employer_id: effectiveEmployerId,
            employer_public_id: effectiveEmployerId,
            project_id: project?.id || projectId,
            title: project?.roleName || "Специалист",
            questions: activeQs,
            answers: previewChecklistAnswers,
            employer_wishes: wishes.checklist,
            anti_ai_enabled: antiAi.checklist,
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      const fb = r.feedback || r.result?.feedback || {};
      setPreviewChecklistResult({
        score: Number(r.score ?? fb.total ?? 0),
        ai_detected: Boolean(r.ai_detected ?? fb.ai_detected),
        feedback: fb,
      });
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка демо чек-листа", e?.message || "Не удалось проверить чек-лист");
    } finally {
      setPreviewBusy(false);
    }
  };

  const submitPreviewSituations = async () => {
    if (situations.length === 0) {
      addAuditEvent("warning", "Нет ситуаций", "Сначала создайте или сгенерируйте ролевые ситуации");
      return;
    }
    setPreviewBusy(true);
    try {
      const r = await aiWaitRun<any>({
        title: "AI оценивает решения ситуаций в режиме демо (без списания лимитов)…",
        theme: activeCompanyTheme,
        task: (attempt) =>
          callEdge("ai-interview-grade-situations", {
            is_preview: true,
            employer_id: effectiveEmployerId,
            employer_public_id: effectiveEmployerId,
            project_id: project?.id || projectId,
            title: project?.roleName || "Специалист",
            situations,
            answers: previewSitAnswers,
            employer_wishes: wishes.situations,
            anti_ai_enabled: antiAi.situations,
            use_promax: attempt > 0,
          }),
      });
      if (!r) return;
      const resData = r.result || r;
      setPreviewSitResult({
        score: Number(resData.score ?? r.score ?? 0),
        ai_detected: Boolean(resData.ai_detected ?? r.ai_detected),
        advice: String(resData.advice ?? r.advice ?? ""),
        items: Array.isArray(resData.items) ? resData.items : Array.isArray(r.items) ? r.items : [],
      });
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка демо ситуаций", e?.message || "Не удалось проверить ситуации");
    } finally {
      setPreviewBusy(false);
    }
  };

  const savePassScore = async () => {
    if (!projectId) return;
    setSaving("pass");
    try {
      await (dbClient as any).from("projects").update({ interview_pass_score: passScore }).eq("id", projectId);
      addAuditEvent("success", "Сохранено в БД", `Проходной балл интервью: ${passScore}`);
      flash("pass");
      try { await Promise.resolve(refreshProjects?.()); } catch {}
    } finally {
      setSaving(null);
    }
  };

  const saveLimits = async () => {
    if (!projectId) return;
    if (interviewLimit < interviewUsed || trainingLimit < trainingUsed) {
      addAuditEvent("warning", "Ошибка", "Лимит не может быть меньше уже использованного");
      return;
    }
    const interviewDelta = Math.max(0, interviewLimit - savedInterviewLimit);
    const trainingDelta = Math.max(0, trainingLimit - savedTrainingLimit);
    const totalReserve =
      interviewDelta * packTierPrice(Math.max(1, interviewDelta)) +
      trainingDelta * packTierPrice(Math.max(1, trainingDelta));
    if (walletBalance <= 0 && (interviewDelta > 0 || trainingDelta > 0)) {
      setShowNoBalanceModal(true);
      return;
    }
    if (totalReserve > walletBalance) {
      addAuditEvent(
        "warning",
        "Недостаточно RR",
        `Для брони нужно ${formatRR(totalReserve)}, на балансе ${formatRR(walletBalance)}. Пополните баланс или уменьшите лимиты.`
      );
      return;
    }
    setSavingLimits(true);
    try {
      await (dbClient as any)
        .from("projects")
        .update({
          interview_limit: Math.max(0, Math.floor(interviewLimit)),
          training_limit: Math.max(0, Math.floor(trainingLimit)),
        })
        .eq("id", projectId);
      setSavedInterviewLimit(Math.max(0, Math.floor(interviewLimit)));
      setSavedTrainingLimit(Math.max(0, Math.floor(trainingLimit)));
      addAuditEvent("success", "Сохранено в БД", `Лимиты по вакансии: интервью ${interviewLimit}, обучение ${trainingLimit}`);
      setSavedLimits(true);
      setTimeout(() => setSavedLimits(false), 2200);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка", e?.message || "save_failed");
    } finally {
      setSavingLimits(false);
    }
  };

  const generate = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      if (kind === "resume") {
        const requestId =
          typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : `rq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        diagLog("resume_criteria_generate", "click_started", {
          request_id: requestId,
          candidate_id_tail: tail(projectId),
        });
        const r = await aiWaitRun({
          title: "Формируем критерии оценки резюме…",
          theme: activeCompanyTheme,
          task: async (attempt) => {
            const started = Date.now();
            const resp = await callEdge("ai-generate-interview-resume-criteria", {
              project_id: projectId,
              request_id: requestId,
              wishes: wishes.resume || undefined,
              anti_ai_enabled: antiAi.resume,
              employer_public_id: effectiveEmployerId || undefined,
              use_promax: attempt > 0,
            });
            diagLog("resume_criteria_generate", "invoke_success", {
              request_id: requestId,
              job_id: resp?.job_id || null,
              first_status: resp?.status || null,
              ms: Date.now() - started,
            });
            let finalStatus: string = resp?.status || (resp?.ok ? "primary_succeeded" : "");
            if (resp?.job_id && !resp?.terminal) {
              const row = await pollEmployerJobUntilTerminal({
                jobId: resp.job_id,
                maxMs: 6 * 60_000,
              });
              finalStatus = row.status;
              diagLog("resume_criteria_generate", "response_parsed", {
                request_id: requestId,
                job_id: resp.job_id,
                terminal_status: finalStatus,
              });
            }
            if (!resp?.ok && !isSuccess(finalStatus)) {
              const err: any = new Error(finalStatus || "ai_failed");
              err.safeCode = finalStatus || "ai_failed";
              throw err;
            }
            if (typeof resp?.criteria_md === "string" && resp.criteria_md.trim()) {
              return { criteria_md: resp.criteria_md };
            }
            const { data: blk } = await (dbClient as any)
              .from("interview_blocks")
              .select("payload")
              .eq("project_id", projectId)
              .eq("kind", "resume")
              .maybeSingle();
            const rawPl = (blk as any)?.payload;
            const plObj =
              typeof rawPl === "string"
                ? (() => {
                    try {
                      return JSON.parse(rawPl);
                    } catch {
                      return {};
                    }
                  })()
                : rawPl || {};
            return { criteria_md: String(plObj?.criteria_md || "") };
          },
          fallback: {
            viewerAllowed: true,
            onSuccess: async (data: any) => {
              if (typeof data?.criteria_md === "string" && data.criteria_md.trim()) {
                setResumeMd(data.criteria_md);
              } else {
                const { data: blk } = await (dbClient as any)
                  .from("interview_blocks")
                  .select("payload")
                  .eq("project_id", projectId)
                  .eq("kind", "resume")
                  .maybeSingle();
                const rawPl = (blk as any)?.payload;
                const plObj =
                  typeof rawPl === "string"
                    ? (() => {
                        try {
                          return JSON.parse(rawPl);
                        } catch {
                          return {};
                        }
                      })()
                    : rawPl || {};
                if (plObj?.criteria_md) setResumeMd(String(plObj.criteria_md));
              }
              addAuditEvent("success", "RR ProMax", "Критерии резюме сгенерированы резервной моделью");
            },
          },
        });
        if (!r) return;
        if (r.criteria_md) {
          setResumeMd(r.criteria_md);
          diagLog("resume_criteria_generate", "result_rendered", {
            request_id: requestId,
          });
        } else {
          diagLog("resume_criteria_generate", "invoke_error", {
            request_id: requestId,
            code: "empty_criteria",
          });
          addAuditEvent("warning", "Не удалось сформировать критерии", "Попробуйте ещё раз. Код: empty_criteria");
          return;
        }
      } else if (kind === "checklist") {
        const r = await aiWaitRun({
          title: "Генерация чек-листа интервью",
          theme: activeCompanyTheme,
          task: async (attempt) => {
            const requestId =
              typeof crypto !== "undefined" && (crypto as any).randomUUID
                ? (crypto as any).randomUUID()
                : `rq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const resp = await callEdge("ai-generate-interview-checklist", {
              project_id: projectId,
              request_id: requestId,
              wishes: wishes.checklist || undefined,
              anti_ai_enabled: antiAi.checklist,
              employer_public_id: effectiveEmployerId || undefined,
              use_promax: attempt > 0,
            });
            let finalStatus: string = resp?.status || (resp?.ok ? "primary_succeeded" : "");
            if (resp?.job_id && !resp?.terminal) {
              const row = await pollEmployerJobUntilTerminal({
                jobId: resp.job_id,
                maxMs: 6 * 60_000,
              });
              finalStatus = row.status;
            }
            if (!resp?.ok && !isSuccess(finalStatus)) {
              const err: any = new Error(finalStatus || "ai_failed");
              err.safeCode = finalStatus || "ai_failed";
              throw err;
            }
            return { ok: true, questions: resp?.questions };
          },
          fallback: {
            viewerAllowed: true,
            onSuccess: async (data: any) => {
              if (Array.isArray(data?.questions) && data.questions.length > 0) {
                setChecklist(normalizeAndShuffleChecklist(data.questions, checklistShuffle, true));
              } else {
                const { data: blk } = await (dbClient as any)
                  .from("interview_blocks")
                  .select("payload")
                  .eq("project_id", projectId)
                  .eq("kind", "checklist")
                  .maybeSingle();
                const rawPl = (blk as any)?.payload;
                const plObj =
                  typeof rawPl === "string"
                    ? (() => {
                        try {
                          return JSON.parse(rawPl);
                        } catch {
                          return {};
                        }
                      })()
                    : rawPl || {};
                setChecklist(normalizeAndShuffleChecklist(plObj?.questions || [], checklistShuffle, true));
              }
              addAuditEvent("success", "RR ProMax", "Чек-лист сгенерирован резервной моделью");
            },
          },
        });
        if (!r) return;
        if (Array.isArray(r.questions) && r.questions.length > 0) {
          setChecklist(normalizeAndShuffleChecklist(r.questions, checklistShuffle, true));
        } else {
          const { data } = await (dbClient as any)
            .from("interview_blocks")
            .select("payload")
            .eq("project_id", projectId)
            .eq("kind", "checklist")
            .maybeSingle();
          const rawPl = (data as any)?.payload;
          const plObj =
            typeof rawPl === "string"
              ? (() => {
                  try {
                    return JSON.parse(rawPl);
                  } catch {
                    return {};
                  }
                })()
              : rawPl || {};
          setChecklist(normalizeAndShuffleChecklist(plObj?.questions || [], checklistShuffle, true));
        }
      } else {
        const r = await aiWaitRun({
          title: "Генерация ролевых ситуаций",
          theme: activeCompanyTheme,
          task: async (attempt) => {
            const requestId =
              typeof crypto !== "undefined" && (crypto as any).randomUUID
                ? (crypto as any).randomUUID()
                : `rq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const resp = await callEdge("ai-generate-interview-situations", {
              project_id: projectId,
              request_id: requestId,
              wishes: wishes.situations || undefined,
              anti_ai_enabled: antiAi.situations,
              employer_public_id: effectiveEmployerId || undefined,
              use_promax: attempt > 0,
            });
            let finalStatus: string = resp?.status || (resp?.ok ? "primary_succeeded" : "");
            if (resp?.job_id && !resp?.terminal) {
              const row = await pollEmployerJobUntilTerminal({
                jobId: resp.job_id,
                maxMs: 6 * 60_000,
              });
              finalStatus = row.status;
            }
            if (!resp?.ok && !isSuccess(finalStatus)) {
              const err: any = new Error(finalStatus || "ai_failed");
              err.safeCode = finalStatus || "ai_failed";
              throw err;
            }
            return { ok: true, situations: resp?.situations };
          },
          fallback: {
            viewerAllowed: true,
            onSuccess: async (data: any) => {
              if (Array.isArray(data?.situations) && data.situations.length > 0) {
                setSituations(data.situations);
              } else {
                const { data: blk } = await (dbClient as any)
                  .from("interview_blocks")
                  .select("payload")
                  .eq("project_id", projectId)
                  .eq("kind", "situations")
                  .maybeSingle();
                const rawPl = (blk as any)?.payload;
                const plObj =
                  typeof rawPl === "string"
                    ? (() => {
                        try {
                          return JSON.parse(rawPl);
                        } catch {
                          return {};
                        }
                      })()
                    : rawPl || {};
                setSituations(plObj?.situations || []);
              }
              addAuditEvent("success", "RR ProMax", "Ситуации сгенерированы резервной моделью");
            },
          },
        });
        if (!r) return;
        if (Array.isArray(r.situations) && r.situations.length > 0) {
          setSituations(r.situations);
        } else {
          const { data } = await (dbClient as any)
            .from("interview_blocks")
            .select("payload")
            .eq("project_id", projectId)
            .eq("kind", "situations")
            .maybeSingle();
          const rawPl = (data as any)?.payload;
          const plObj =
            typeof rawPl === "string"
              ? (() => {
                  try {
                    return JSON.parse(rawPl);
                  } catch {
                    return {};
                  }
                })()
              : rawPl || {};
          setSituations(plObj?.situations || []);
        }
      }
      addAuditEvent("success", "ИИ сгенерировал", `${kind}`);
    } catch (e: any) {
      const code = e?.safeCode || e?.message || "failed";
      if (kind === "resume") {
        diagLog("resume_criteria_generate", "invoke_error", { code: String(code).slice(0, 64) });
        addAuditEvent("warning", "Не удалось сформировать критерии", `Попробуйте ещё раз. Код: ${String(code).slice(0, 48)}`);
      } else {
        addAuditEvent("warning", "Ошибка ИИ", e?.message || "failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const fillFromTemplate = async () => {
    if (!project?.roleName) return;
    const { data } = await dbClient.rpc("job_title_get_interview_template" as any, { _title: project.roleName });
    const tpl: any = data || {};
    const rc =
      typeof tpl.resume_criteria === "string"
        ? tpl.resume_criteria
        : typeof tpl.resume_criteria?.criteria_md === "string"
        ? tpl.resume_criteria.criteria_md
        : "";
    const chk = Array.isArray(tpl.checklist)
      ? tpl.checklist
      : Array.isArray(tpl.checklist?.questions)
      ? tpl.checklist.questions
      : null;
    const sit = Array.isArray(tpl.situations)
      ? tpl.situations
      : Array.isArray(tpl.situations?.situations)
      ? tpl.situations.situations
      : null;
    if (rc) {
      setResumeMd(rc);
      await saveBlock("resume", { criteria_md: rc });
    }
    if (chk) {
      const preparedChk = normalizeAndShuffleChecklist(chk, checklistShuffle, true);
      setChecklist(preparedChk);
      await saveBlock("checklist", { questions: preparedChk, shuffle: checklistShuffle });
    }
    if (sit) {
      setSituations(sit);
      await saveBlock("situations", { situations: sit });
    }
    addAuditEvent("success", "Шаблон применён", `${project.roleName}`);
  };

  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white hover:text-[#E7C768] flex items-center gap-2 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#E7C768]" /> К списку систем интервью
        </button>
      )}

      {/* Main Header Card in Apple Liquid Glass */}
      <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-transparent backdrop-blur-md border border-[#E7C768]/50 flex items-center justify-center text-[#E7C768] shrink-0">
            <MessageSquare className="w-6 h-6 text-[#E7C768]" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              {createMode ? "Создание системы интервью" : "Редактор системы интервью"}
            </h2>
            <p className="text-sm text-white/90 mt-0.5">
              3 этапа: Резюме → Чек-лист → Ситуации. ИИ генерирует, вы редактируете.
            </p>
          </div>
          <div className="w-full md:w-auto">
            {lockedProject ? (
              <div
                data-testid="iw-locked-vacancy-card"
                className="bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-2xl px-4 py-3.5 min-w-[260px] text-left"
              >
                <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mb-1">
                  Система оценки для вакансии
                </div>
                <div className="text-base font-extrabold text-white leading-tight">
                  {project?.roleName || "(без названия)"}
                </div>
                {project?.companyName && (
                  <div className="text-sm text-white/90 mt-0.5">{project.companyName}</div>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-sm">
                    Вакансия закреплена
                  </span>
                  <span className="text-sm text-white/85">
                    Система редактируется только для этой вакансии.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <label className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mb-1.5 inline-flex items-center">
                  Вакансия{createMode ? " (обязательно)" : ""}
                  <FieldHelp
                    section="interviews"
                    fieldKey="project_select"
                    fallbackTitle="Выбор вакансии"
                    fallbackBody="Сценарий интервью всегда привязан к вакансии. ИИ берёт описание вакансии и компании как контекст для блоков «Резюме», «Чек-лист» и «Ситуации»."
                  />
                </label>
                <select
                  data-testid="iw-vacancy-select"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-transparent backdrop-blur-xl text-white border border-white/25 focus:border-[#E7C768] focus:outline-none rounded-2xl px-4 py-2.5 text-sm min-w-[260px]"
                >
                  <option value="" className="bg-[#17344F] text-white">
                    — выберите вакансию —
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#17344F] text-white">
                      {p.roleName || "(без названия)"} · {p.companyName || ""}
                      {createMode && existingSystems.has(p.id) ? " · уже есть система" : ""}
                    </option>
                  ))}
                </select>
                {createMode && projectId && existingSystems.has(projectId) && (
                  <p className="text-sm text-[#E7C768] mt-1.5">
                    Для этой вакансии уже создана система интервью. Сохранение перезапишет существующие блоки.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {projectId && (
        <>
          {/* Pass Score & Fill from Template Bar */}
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="space-y-2">
              <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent inline-flex items-center">
                <span>Проходной средний балл (по 3 этапам)</span>
                <FieldHelp
                  section="interviews"
                  fieldKey="pass_score"
                  fallbackTitle="Проходной средний балл"
                  fallbackBody="ИИ ставит балл по каждому из 3 блоков (Резюме, Чек-лист, Ситуации). Если средний ≥ этого порога — кандидат успешно прошёл интервью и попадает в финальную колонку CRM. Рекомендуем 70–80."
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={passScore}
                  onChange={(e) => setPassScore(Math.max(1, Math.min(100, Number(e.target.value) || 70)))}
                  className="bg-transparent backdrop-blur-md text-white border border-white/25 focus:border-[#E7C768] focus:outline-none rounded-2xl px-4 py-2 text-sm font-bold w-24 text-center"
                />
                <button
                  type="button"
                  onClick={savePassScore}
                  disabled={saving === "pass"}
                  className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-60"
                >
                  {saving === "pass" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Сохраняем…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 text-[#17344F]" /> Сохранить
                    </>
                  )}
                </button>
                {savedFlash === "pass" && saving !== "pass" && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-[#E7C768] animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено в БД
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="iw-open-preview-btn"
                onClick={() => {
                  setPreviewStage(kind);
                  setPreviewMode((v) => !v);
                }}
                className="bg-transparent backdrop-blur-xl text-white border border-[#E7C768]/60 hover:border-[#E7C768] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg transition cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#E7C768]" />{" "}
                {previewMode ? "← Вернуться в редактор системы интервью" : "Предпоказ и демо интервью (отдельная подстраница)"}
              </button>
              {!previewMode && (
                <button
                  type="button"
                  onClick={fillFromTemplate}
                  className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg hover:brightness-105 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#17344F]" /> Заполнить из шаблона должности
                </button>
              )}
            </div>
          </div>

          {/* Interactive Free Demo / Preview Subpage (with Company Theme & Employer Chat ID) */}
          {previewMode ? (
            <div
              className={
                previewFullscreen
                  ? "fixed inset-0 z-50 bg-[#0b192c]/95 backdrop-blur-2xl p-3 sm:p-6 overflow-y-auto"
                  : "bg-transparent backdrop-blur-xl border border-[#E7C768]/60 rounded-3xl p-4 sm:p-6 space-y-5 shadow-2xl"
              }
            >
              {/* Preview Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/20">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-transparent backdrop-blur-md border border-[#E7C768]/50 flex items-center justify-center text-[#E7C768]">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      Предпоказ и демо-прохождение интервью (бесплатно, без списания лимитов)
                    </div>
                    <div className="text-sm text-white/85 flex flex-wrap items-center gap-2 mt-0.5">
                      <span>Вакансия: <strong className="text-white">{project?.roleName || "Без названия"}</strong></span>
                      <span>·</span>
                      <span>Компания: <strong className="text-white">{activeCompanyObj?.name || project?.companyName || "Стандартный стиль"}</strong></span>
                      <span>·</span>
                      <span>ID работодателя: <strong className="text-[#E7C768]">emp{effectiveEmployerId}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-2xl border border-white/25 p-1 bg-transparent backdrop-blur-md">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("desktop")}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                        previewDevice === "desktop"
                          ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F]"
                          : "text-white hover:text-[#E7C768]"
                      }`}
                    >
                      <Monitor className="w-4 h-4" /> ПК
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("tablet")}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                        previewDevice === "tablet"
                          ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F]"
                          : "text-white hover:text-[#E7C768]"
                      }`}
                    >
                      <Tablet className="w-4 h-4" /> Планшет
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("mobile")}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                        previewDevice === "mobile"
                          ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F]"
                          : "text-white hover:text-[#E7C768]"
                      }`}
                    >
                      <Smartphone className="w-4 h-4" /> Телефон
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={resetPreview}
                    className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-3.5 py-2 rounded-2xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-[#E7C768]" /> Сбросить ответы
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewFullscreen((v) => !v)}
                    className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-3.5 py-2 rounded-2xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {previewFullscreen ? <Minimize2 className="w-4 h-4 text-[#E7C768]" /> : <Maximize2 className="w-4 h-4 text-[#E7C768]" />}
                    {previewFullscreen ? "Свернуть" : "На весь экран"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFullscreen(false);
                      setPreviewMode(false);
                    }}
                    className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-4 py-2 rounded-2xl transition cursor-pointer"
                  >
                    Закрыть предпоказ
                  </button>
                </div>
              </div>

              {/* Candidate Frame Styled with Company Theme */}
              {activeCompanyTheme && (
                <style dangerouslySetInnerHTML={{ __html: buildThemeCss(activeCompanyTheme) }} />
              )}
              <div
                className={`mx-auto transition-all duration-300 ${
                  previewDevice === "mobile"
                    ? "max-w-[410px]"
                    : previewDevice === "tablet"
                    ? "max-w-[780px]"
                    : "w-full"
                }`}
              >
                <div
                  id={themeScopeId}
                  className="company-landing-root rounded-3xl border border-white/25 overflow-hidden shadow-2xl relative min-h-[560px]"
                  style={{
                    backgroundColor: previewPageBg,
                    backgroundImage: activeCompanyTheme?.pageBgImageUrl || activeCompanyTheme?.bgImageUrl
                      ? `url(${activeCompanyTheme?.pageBgImageUrl || activeCompanyTheme?.bgImageUrl})`
                      : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    color: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                    fontFamily: activeCompanyTheme?.fontFamily || "Inter, system-ui, sans-serif",
                  }}
                >
                  {/* Animated Background (Neural Sphere & Waves + Optional Video) */}
                  {activeCompanyTheme?.bgVideoUrl ? (
                    <video
                      src={activeCompanyTheme.bgVideoUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
                    />
                  ) : null}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                    <InteractiveLandingBackground
                      containerMode={true}
                      showBadges={false}
                      showSphere={Boolean(activeCompanyTheme?.showSphereAnimation ?? activeCompanyTheme?.showSphere)}
                      showWaves={(activeCompanyTheme?.showWaveAnimation ?? activeCompanyTheme?.showWaves) !== false}
                      themeColors={{
                        headingColor: activeCompanyTheme?.headingsSolidColor || "#FFFFFF",
                        bodyTextColor: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                        boldTextColor: activeCompanyTheme?.boldTextColor || "#FFFFFF",
                        iconColor: activeCompanyTheme?.iconColor || "#FFFFFF",
                        headingsColorMode: activeCompanyTheme?.headingsColorMode || "solid",
                        isMonochrome: Boolean(
                          activeCompanyTheme?.allMediaMonochrome ||
                          activeCompanyTheme?.sitePreviewMonochrome ||
                          (activeCompanyTheme?.headingsSolidColor === "#FFFFFF" && (activeCompanyTheme?.pageBgColor === "#000000" || !activeCompanyTheme?.pageBgColor))
                        ),
                      }}
                    />
                  </div>

                  <div className="relative z-10 p-4 sm:p-6 space-y-5">
                    {/* Candidate Header Card */}
                    <div
                      className="p-4 sm:p-5 border border-white/25 rounded-3xl flex flex-wrap items-center justify-between gap-4"
                      style={previewCardBoxStyle}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {activeCompanyObj?.logo_url || activeCompanyObj?.logoUrl ? (
                          <img
                            src={activeCompanyObj.logo_url || activeCompanyObj.logoUrl}
                            alt={activeCompanyObj?.name || "Логотип"}
                            className="w-12 h-12 rounded-2xl object-cover border border-white/25 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-transparent backdrop-blur-md border border-[#E7C768]/50 flex items-center justify-center text-[#E7C768] font-bold text-lg shrink-0">
                            {(activeCompanyObj?.name || project?.companyName || "К")[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm opacity-85 truncate">
                            {activeCompanyObj?.name || project?.companyName || "Компания работодателя"}
                          </div>
                          <h3
                            className="text-lg sm:text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent truncate"
                            style={previewHeadingStyle}
                          >
                            Интервью на вакансию «{project?.roleName || "Вакансия"}»
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3.5 py-1.5 rounded-xl border border-[#E7C768]/50 bg-transparent backdrop-blur-md text-sm font-semibold text-white">
                          Проходной порог: <strong className="text-[#E7C768]">{passScore}/100</strong>
                        </span>
                        <span className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold">
                          Бесплатное демо · 0 лимитов
                        </span>
                      </div>
                    </div>

                    {/* Stage Tabs inside Candidate Frame */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      {(
                        [
                          ["resume", "1. Скрининг резюме", previewResumeResult?.score],
                          ["checklist", "2. Чек-лист", previewChecklistResult?.score],
                          ["situations", "3. Ситуации", previewSitResult?.score],
                          [
                            "summary",
                            "4. Итог оценки",
                            previewResumeResult || previewChecklistResult || previewSitResult
                              ? Math.round(
                                  ([
                                    previewResumeResult?.score,
                                    previewChecklistResult?.score,
                                    previewSitResult?.score,
                                  ].filter((v): v is number => typeof v === "number").reduce((a, b) => a + b, 0)) /
                                    Math.max(
                                      1,
                                      [
                                        previewResumeResult?.score,
                                        previewChecklistResult?.score,
                                        previewSitResult?.score,
                                      ].filter((v): v is number => typeof v === "number").length
                                    )
                                )
                              : undefined,
                          ],
                        ] as const
                      ).map(([stKey, stLabel, stScore]) => {
                        const isAct = previewStage === stKey;
                        return (
                          <button
                            key={stKey}
                            type="button"
                            onClick={() => setPreviewStage(stKey)}
                            className={`px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-between gap-2 border transition cursor-pointer ${
                              isAct
                                ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768]"
                                : "bg-transparent backdrop-blur-md border-white/25 text-white hover:border-[#E7C768]"
                            }`}
                            style={isAct ? previewActiveBtnStyle : previewInactiveBtnStyle}
                          >
                            <span className="truncate">{stLabel}</span>
                            {stScore !== undefined && (
                              <span className="px-2 py-0.5 rounded-lg text-sm font-extrabold border border-current/30">
                                {stScore}%
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* PREVIEW STAGE 1: RESUME */}
                    {previewStage === "resume" && (
                      <div className="p-4 sm:p-6 border border-white/25 rounded-3xl space-y-4" style={previewCardBoxStyle}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4
                              className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
                              style={previewHeadingStyle}
                            >
                              Этап 1. Скрининг резюме кандидата
                            </h4>
                            <p className="text-sm opacity-90 mt-0.5">
                              Загрузите файл резюме (текст распознается автоматически) или вставьте текст резюме вручную.
                            </p>
                          </div>
                        </div>

                        {/* Collapsible Dropdown Block for Formatted Resume Criteria */}
                        <div className="rounded-2xl border border-[#E7C768]/45 bg-transparent backdrop-blur-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setPreviewCriteriaOpen((v) => !v)}
                            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:border-[#E7C768] transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-[#E7C768] shrink-0" />
                              <span
                                className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent truncate"
                                style={previewHeadingStyle}
                              >
                                Критерии оценки резюме по вакансии
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#E7C768] shrink-0">
                              {previewCriteriaOpen ? "Скрыть критерии" : "Показать критерии"}
                              {previewCriteriaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </button>
                          {previewCriteriaOpen && (
                            <div className="px-4 pb-4 pt-2 border-t border-white/15 text-sm text-white/95 leading-relaxed">
                              <RichMarkdown
                                text={
                                  resumeMd.trim() ||
                                  (project as any)?.vacancy_text ||
                                  project?.vacancyText ||
                                  project?.tasksActivityText ||
                                  "Критерии оценки резюме формируются на основе описания и требований вакансии."
                                }
                              />
                            </div>
                          )}
                        </div>

                        <ResumeDropzone
                          uploading={previewResumeUploading}
                          parsing={previewResumeParsing}
                          uploaded={previewUploadedResume}
                          hasRecognizedText={previewResumeText.trim().length > 20}
                          busy={previewBusy}
                          onFile={(file, detectedType) => onUploadPreviewResume(file, detectedType)}
                          onUrl={(linkInfo) => onPreviewResumeLink(linkInfo)}
                          onSend={() => recognizePreviewResume()}
                          onClear={() => setPreviewUploadedResume(null)}
                          sendLabel="Распознать резюме"
                          activeTheme={activeCompanyTheme}
                        />

                        <AudioField
                          value={previewResumeText}
                          onChange={setPreviewResumeText}
                          placeholder="Вставьте текст резюме кандидата, загрузите файл выше или вставьте ссылку из Google Диска..."
                          maxLength={8000}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <div className="text-sm opacity-85">
                            Критерии: <strong className="text-[#E7C768]">{resumeMd.trim() ? "из редактора" : "по описанию вакансии"}</strong>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              disabled={previewBusy}
                              onClick={submitPreviewResume}
                              className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg transition cursor-pointer"
                              style={previewActiveBtnStyle}
                            >
                              <Play className="w-4 h-4" />{" "}
                              {previewBusy ? "ИИ проверяет резюме..." : "Проверить резюме бесплатно"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewQuestions(normalizeAndShuffleChecklist(checklist, true, true));
                                setPreviewStage("checklist");
                              }}
                              className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-4 py-2.5 rounded-2xl transition cursor-pointer"
                              style={previewInactiveBtnStyle}
                            >
                              К чек-листу →
                            </button>
                          </div>
                        </div>

                        {previewResumeResult && (
                          <div className="p-4 rounded-2xl border border-[#E7C768]/60 bg-transparent backdrop-blur-xl space-y-3 mt-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-base font-bold text-[#E7C768]">Результат оценки резюме</div>
                              <div className="flex flex-wrap items-center gap-2">
                                {previewResumeResult.ai_detected && (
                                  <span className="px-3 py-1 rounded-xl border border-[#E7C768] text-[#E7C768] text-sm font-bold inline-flex items-center gap-1.5">
                                    <ShieldAlert className="w-4 h-4" /> Обнаружена нейросеть: балл снижен в 2 раза ({previewResumeResult.raw_score ?? previewResumeResult.score * 2}% → {previewResumeResult.score}%)
                                  </span>
                                )}
                                <span className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-base font-extrabold">
                                  Балл: {previewResumeResult.score} / 100
                                </span>
                              </div>
                            </div>
                            {previewResumeResult.summary && (
                              <p className="text-sm text-white/95 leading-relaxed whitespace-pre-wrap">
                                {previewResumeResult.summary}
                              </p>
                            )}
                            {previewResumeResult.strengths.length > 0 && (
                              <div className="text-sm text-white/90">
                                <strong className="text-[#E7C768]">Сильные стороны:</strong> {previewResumeResult.strengths.join("; ")}
                              </div>
                            )}
                            {previewResumeResult.gaps.length > 0 && (
                              <div className="text-sm text-white/90">
                                <strong className="text-[#E7C768]">Зоны внимания:</strong> {previewResumeResult.gaps.join("; ")}
                              </div>
                            )}

                            {/* Извлеченные стандартные (26) и кастомные поля резюме в режиме предпоказа (без сохранения в БД) */}
                            <div className="pt-3 border-t border-white/15">
                              <CandidateFieldsEditorBlock
                                initialStandardFields={previewResumeResult.standard_fields || {}}
                                initialCustomFields={previewResumeResult.custom_fields || {}}
                                customFieldsConfig={
                                  customFieldsOverride ||
                                  parseVacancyCustomFieldsConfig(
                                    (project as any)?.candidate_fields_config ?? (project as any)?.candidateFieldsConfig
                                  ).customFields
                                }
                                persistToDb={false}
                                isEditable={true}
                                title="Извлеченные ИИ данные кандидата (предпоказ без записи в БД)"
                                subtitle="Проверьте, как нейросеть заполнила 26 стандартных и кастомные поля вакансии из резюме"
                                onSaved={({ standardFields, customFields }) => {
                                  setPreviewResumeResult((prev) =>
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
                          </div>
                        )}
                      </div>
                    )}

                    {/* PREVIEW STAGE 2: CHECKLIST */}
                    {previewStage === "checklist" && (
                      <div className="p-4 sm:p-6 border border-white/25 rounded-3xl space-y-4" style={previewCardBoxStyle}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4
                              className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
                              style={previewHeadingStyle}
                            >
                              Этап 2. Чек-лист ({(previewQuestions.length || checklist.length)} вопр.)
                            </h4>
                            <p className="text-sm opacity-90 mt-0.5">
                              Вопросы и варианты ответов перемешаны в случайном порядке (4 типа полей: список, мультивыбор, текст, абзац).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewQuestions(normalizeAndShuffleChecklist(checklist, true, true))}
                            className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-3.5 py-2 rounded-2xl inline-flex items-center gap-1.5 transition cursor-pointer"
                            style={previewInactiveBtnStyle}
                          >
                            <Shuffle className="w-4 h-4 text-[#E7C768]" /> Перемешать порядок
                          </button>
                        </div>

                        {(previewQuestions.length === 0 && checklist.length === 0) ? (
                          <div className="p-5 rounded-2xl border border-white/20 text-center text-sm text-white/85">
                            В чек-листе пока нет вопросов. Сгенерируйте или добавьте их в редакторе.
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            {(previewQuestions.length > 0 ? previewQuestions : checklist).map((q, idx) => {
                              const qId = q.id || `q${idx + 1}`;
                              const qKind = normalizeQuestionKind(q.kind);
                              const itemFb = Array.isArray(previewChecklistResult?.feedback?.items)
                                ? previewChecklistResult.feedback.items.find((it: any) => it.id === qId) ||
                                  previewChecklistResult.feedback.items[idx]
                                : null;
                              const rawAns = previewChecklistAnswers[qId];
                              const selectedMulti: string[] = Array.isArray(rawAns)
                                ? rawAns
                                : typeof rawAns === "string" && rawAns.includes("||")
                                ? rawAns.split("||").map((s) => s.trim()).filter(Boolean)
                                : [];

                              return (
                                <div key={qId} className="p-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-sm font-bold text-white">
                                      <span className="text-[#E7C768] mr-1.5">#{idx + 1}.</span>
                                      {q.question || "Вопрос без текста"}
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl border border-[#E7C768]/45 text-sm font-semibold text-[#E7C768] shrink-0">
                                      {QUESTION_KIND_META[qKind].badge}
                                    </span>
                                  </div>

                                  {qKind === "choice" && Array.isArray(q.options) && q.options.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {q.options.map((opt, oi) => {
                                        const selected = rawAns === opt;
                                        return (
                                          <button
                                            key={`${opt}-${oi}`}
                                            type="button"
                                            onClick={() => {
                                              setPreviewChecklistAnswers((prev) => ({ ...prev, [qId]: opt }));
                                            }}
                                            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border text-left flex items-center gap-2.5 transition cursor-pointer ${
                                              selected
                                                ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold"
                                                : "bg-transparent border-white/25 text-white hover:border-[#E7C768]"
                                            }`}
                                            style={selected ? previewActiveBtnStyle : previewInactiveBtnStyle}
                                          >
                                            <span
                                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                                selected ? "border-[#17344F] bg-[#17344F]" : "border-[#E7C768]"
                                              }`}
                                            >
                                              {selected && <span className="w-2 h-2 rounded-full bg-[#E7C768]" />}
                                            </span>
                                            <span className="break-words">{opt}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : qKind === "multichoice" && Array.isArray(q.options) && q.options.length > 0 ? (
                                    <div className="space-y-2">
                                      <div className="text-sm text-white/80">
                                        Выберите все подходящие варианты ответа:
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {q.options.map((opt, oi) => {
                                          const checked = selectedMulti.includes(opt);
                                          return (
                                            <button
                                              key={`${opt}-${oi}`}
                                              type="button"
                                              onClick={() => {
                                                const nextMulti = checked
                                                  ? selectedMulti.filter((x) => x !== opt)
                                                  : [...selectedMulti, opt];
                                                setPreviewChecklistAnswers((prev) => ({
                                                  ...prev,
                                                  [qId]: nextMulti,
                                                }));
                                              }}
                                              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border text-left flex items-center gap-2.5 transition cursor-pointer ${
                                                checked
                                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold"
                                                  : "bg-transparent border-white/25 text-white hover:border-[#E7C768]"
                                              }`}
                                              style={checked ? previewActiveBtnStyle : previewInactiveBtnStyle}
                                            >
                                              <span
                                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                                  checked ? "border-[#17344F] bg-[#17344F] text-[#E7C768]" : "border-[#E7C768]"
                                                }`}
                                              >
                                                {checked && "✓"}
                                              </span>
                                              <span className="break-words">{opt}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : qKind === "paragraph" ? (
                                    <MiniAudioField
                                      value={typeof rawAns === "string" ? rawAns : ""}
                                      onChange={(val) =>
                                        setPreviewChecklistAnswers((prev) => ({ ...prev, [qId]: val }))
                                      }
                                      placeholder="Введите развернутый ответ несколькими предложениями или надиктуйте голосом..."
                                      minRows={3}
                                    />
                                  ) : (
                                    <MiniAudioField
                                      value={typeof rawAns === "string" ? rawAns : ""}
                                      onChange={(val) =>
                                        setPreviewChecklistAnswers((prev) => ({ ...prev, [qId]: val }))
                                      }
                                      placeholder="Введите краткий ответ (термин, цифру или фразу) или надиктуйте голосом..."
                                      minRows={1}
                                    />
                                  )}

                                  {itemFb && (
                                    <div className="p-3 rounded-xl border border-[#E7C768]/50 bg-transparent backdrop-blur-md flex flex-wrap items-center justify-between gap-2">
                                      <div className="text-sm text-white/95">
                                        {itemFb.explanation || itemFb.comment || (itemFb.ok ? "Ответ засчитан" : "Ответ требует доработки")}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {itemFb.ai_detected && (
                                          <span className="px-2.5 py-1 rounded-lg border border-[#E7C768] text-[#E7C768] text-sm font-bold">
                                            ИИ-ответ: ÷2 ({itemFb.raw_score ?? 5} → {itemFb.score})
                                          </span>
                                        )}
                                        <span className="px-3 py-1 rounded-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-extrabold">
                                          {itemFb.score ?? (itemFb.ok ? 5 : 0)} / {itemFb.max ?? 5}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setPreviewStage("resume")}
                            className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-4 py-2.5 rounded-2xl transition cursor-pointer"
                            style={previewInactiveBtnStyle}
                          >
                            ← К резюме
                          </button>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              disabled={previewBusy || checklist.length === 0}
                              onClick={submitPreviewChecklist}
                              className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg transition cursor-pointer"
                              style={previewActiveBtnStyle}
                            >
                              <Play className="w-4 h-4" />{" "}
                              {previewBusy ? "ИИ проверяет чек-лист..." : "Проверить чек-лист бесплатно"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewStage("situations")}
                              className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-4 py-2.5 rounded-2xl transition cursor-pointer"
                              style={previewInactiveBtnStyle}
                            >
                              К ситуациям →
                            </button>
                          </div>
                        </div>

                        {previewChecklistResult && (
                          <div className="p-4 rounded-2xl border border-[#E7C768]/60 bg-transparent backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
                            <div className="text-base font-bold text-[#E7C768]">
                              Итоговый балл за чек-лист
                            </div>
                            <span className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-base font-extrabold">
                              {previewChecklistResult.score} / 100
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PREVIEW STAGE 3: SITUATIONS */}
                    {previewStage === "situations" && (
                      <div className="p-4 sm:p-6 border border-white/25 rounded-3xl space-y-4" style={previewCardBoxStyle}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4
                              className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
                              style={previewHeadingStyle}
                            >
                              Этап 3. Ролевые ситуации ({situations.length} кейсов)
                            </h4>
                            <p className="text-sm opacity-90 mt-0.5">
                              Опишите ваши действия в предложенных рабочих ситуациях.
                            </p>
                          </div>
                        </div>

                        {situations.length === 0 ? (
                          <div className="p-5 rounded-2xl border border-white/20 text-center text-sm text-white/85">
                            В блоке ситуаций пока нет кейсов. Сгенерируйте или добавьте их в редакторе.
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            {situations.map((s, idx) => {
                              const sId = s.id || `s${idx + 1}`;
                              const itemRes = Array.isArray(previewSitResult?.items)
                                ? previewSitResult.items.find((it: any) => it.id === sId) || previewSitResult.items[idx]
                                : null;
                              return (
                                <div key={sId} className="p-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md space-y-3">
                                  <div className="text-base font-bold text-[#E7C768]" style={previewHeadingStyle}>
                                    Ситуация #{idx + 1}: {s.title || "Рабочий кейс"}
                                  </div>
                                  <p className="text-sm text-white/95 leading-relaxed whitespace-pre-wrap">
                                    {s.brief}
                                  </p>
                                  <MiniAudioField
                                    label="Ответ кандидата"
                                    value={previewSitAnswers[sId] || ""}
                                    onChange={(val) =>
                                      setPreviewSitAnswers((prev) => ({ ...prev, [sId]: val }))
                                    }
                                    placeholder="Введите или надиктуйте решение ситуации..."
                                    minRows={3}
                                  />
                                  {itemRes && (
                                    <div className="p-3 rounded-xl border border-[#E7C768]/50 bg-transparent backdrop-blur-md space-y-1.5">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-[#E7C768]">Разбор ИИ:</span>
                                        <div className="flex items-center gap-2">
                                          {itemRes.ai_detected && (
                                            <span className="px-2.5 py-1 rounded-lg border border-[#E7C768] text-[#E7C768] text-sm font-bold">
                                              ИИ-ответ: ÷2 ({itemRes.raw_score ?? itemRes.score * 2}% → {itemRes.score}%)
                                            </span>
                                          )}
                                          <span className="px-3 py-1 rounded-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-extrabold">
                                            {itemRes.score}%
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-sm text-white/95">{itemRes.feedback}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setPreviewStage("checklist")}
                            className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-4 py-2.5 rounded-2xl transition cursor-pointer"
                            style={previewInactiveBtnStyle}
                          >
                            ← К чек-листу
                          </button>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              disabled={previewBusy || situations.length === 0}
                              onClick={submitPreviewSituations}
                              className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg transition cursor-pointer"
                              style={previewActiveBtnStyle}
                            >
                              <Play className="w-4 h-4" />{" "}
                              {previewBusy ? "ИИ проверяет ситуации..." : "Проверить ситуации бесплатно"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewStage("summary")}
                              className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-4 py-2.5 rounded-2xl transition cursor-pointer"
                              style={previewInactiveBtnStyle}
                            >
                              К итогам интервью →
                            </button>
                          </div>
                        </div>

                        {previewSitResult && (
                          <div className="p-4 rounded-2xl border border-[#E7C768]/60 bg-transparent backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
                            <div className="text-base font-bold text-[#E7C768]">
                              Средний балл по ситуациям
                            </div>
                            <span className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-base font-extrabold">
                              {previewSitResult.score} / 100
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PREVIEW STAGE 4: SUMMARY */}
                    {previewStage === "summary" && (
                      <div className="p-4 sm:p-6 border border-white/25 rounded-3xl space-y-4" style={previewCardBoxStyle}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4
                              className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
                              style={previewHeadingStyle}
                            >
                              Итоговая сводка демо-интервью
                            </h4>
                            <p className="text-sm opacity-90 mt-0.5">
                              Сравнение среднего балла с проходным порогом вакансии ({passScore}/100). Лимиты работодателя не списывались.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                          <div className="p-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md space-y-1.5">
                            <div className="text-sm font-bold text-[#E7C768]">1. Скрининг резюме</div>
                            <div className="text-2xl font-extrabold text-white">
                              {previewResumeResult ? `${previewResumeResult.score}%` : "Не проверено"}
                            </div>
                            {previewResumeResult?.ai_detected && (
                              <div className="text-sm text-[#E7C768]">Снижено в 2 раза (защита от ИИ)</div>
                            )}
                          </div>
                          <div className="p-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md space-y-1.5">
                            <div className="text-sm font-bold text-[#E7C768]">2. Чек-лист</div>
                            <div className="text-2xl font-extrabold text-white">
                              {previewChecklistResult ? `${previewChecklistResult.score}%` : "Не проверено"}
                            </div>
                            {previewChecklistResult?.ai_detected && (
                              <div className="text-sm text-[#E7C768]">Снижено в 2 раза (защита от ИИ)</div>
                            )}
                          </div>
                          <div className="p-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-md space-y-1.5">
                            <div className="text-sm font-bold text-[#E7C768]">3. Ситуации</div>
                            <div className="text-2xl font-extrabold text-white">
                              {previewSitResult ? `${previewSitResult.score}%` : "Не проверено"}
                            </div>
                            {previewSitResult?.ai_detected && (
                              <div className="text-sm text-[#E7C768]">Снижено в 2 раза (защита от ИИ)</div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            onClick={resetPreview}
                            className="bg-transparent backdrop-blur-xl text-white border border-white/25 hover:border-[#E7C768] font-bold text-sm px-4 py-2.5 rounded-2xl flex items-center gap-2 transition cursor-pointer"
                            style={previewInactiveBtnStyle}
                          >
                            <RotateCcw className="w-4 h-4 text-[#E7C768]" /> Сбросить и пройти заново
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewMode(false)}
                            className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl transition cursor-pointer"
                            style={previewActiveBtnStyle}
                          >
                            Вернуться в редактор
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 3 Stage Selector Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {KINDS.map((k) => {
              const isSelected = kind === k.key;
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={`p-4 rounded-3xl text-left border transition backdrop-blur-xl cursor-pointer ${
                    isSelected
                      ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] shadow-xl"
                      : "bg-transparent text-white border-white/25 hover:border-[#E7C768]/60"
                  }`}
                >
                  <div
                    className={`text-sm font-extrabold ${
                      isSelected
                        ? "text-[#17344F]"
                        : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
                    }`}
                  >
                    {k.title}
                  </div>
                  <div className={`text-sm mt-1 ${isSelected ? "text-[#17344F]/90 font-semibold" : "text-white/90"}`}>
                    {k.hint}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Stage Editor Container */}
          <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {KINDS.find((k) => k.key === kind)?.title}
              </h3>
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg hover:brightness-105 transition cursor-pointer disabled:opacity-60"
              >
                {busy ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" />
                ) : (
                  <Wand2 className="w-4 h-4 text-[#17344F]" />
                )}
                <span>Сгенерировать ИИ</span>
              </button>
            </div>

            {/* Prompt Input Section ("Вход для ИИ") with AudioField */}
            <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/45 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-sm">
                  <Wand2 className="w-4 h-4 text-[#17344F]" /> Вход для ИИ
                </span>
                <button
                  type="button"
                  onClick={() => setShowExample((s) => ({ ...s, [kind]: !s[kind] }))}
                  className="text-sm font-bold text-[#E7C768] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <Info className="w-4 h-4 text-[#E7C768]" />
                  <span>{showExample[kind] ? "Скрыть пример" : "Показать пример"}</span>
                </button>
              </div>

              <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug">
                {PROMPT_TITLE[kind]}
              </h4>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-sm text-white font-bold inline-flex items-center">
                  <span>
                    Пожелания к блоку «{KINDS.find((k) => k.key === kind)?.title.replace(/^\d+\.\s*/, "")}» (передаются ИИ)
                  </span>
                  <FieldHelp
                    section="interviews"
                    fieldKey={`wishes_${kind}`}
                    fallbackTitle="Пожелания к блоку"
                    fallbackBody="Свободный текст для ИИ: на что обратить внимание, какие компетенции проверить, какой тон выдержать. Чем подробнее — тем точнее ИИ сформирует вопросы и кейсы."
                  />
                </label>
              </div>

              {showExample[kind] && (
                <div className="text-sm text-white bg-transparent backdrop-blur-md border border-[#E7C768]/45 rounded-2xl p-3.5 leading-relaxed">
                  {WISH_EXAMPLE[kind]}
                </div>
              )}

              <AudioField
                value={wishes[kind]}
                onChange={(val) => setWishes((w) => ({ ...w, [kind]: val }))}
                placeholder={WISH_PLACEHOLDER[kind]}
                maxLength={1000}
              />

              <div className="text-sm text-white/80 text-right">
                {wishes[kind].length}/1000 — учитывается при «Сгенерировать ИИ»
              </div>

              {/* Anti-AI Protection Checkbox (saved in DB and appended to prompt) */}
              <div className="pt-2 border-t border-white/20">
                <label className="flex items-start gap-3.5 cursor-pointer bg-transparent backdrop-blur-xl border border-[#E7C768]/45 rounded-2xl p-3.5">
                  <input
                    type="checkbox"
                    data-testid={`iw-anti-ai-${kind}`}
                    checked={antiAi[kind]}
                    onChange={() => toggleAntiAi(kind)}
                    className="mt-0.5 w-5 h-5 accent-[#E7C768] rounded cursor-pointer shrink-0"
                  />
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-[#E7C768] shrink-0" />
                      <span>Защита от нейросетей (проверять ответы на генерацию ИИ и снижать балл в 2 раза)</span>
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed">
                      Настройка сохраняется в базу данных и автоматически добавляется дополнением в промпт. Если кандидат использует нейросети для ответа на вопрос, его балл за этот вопрос снижается в 2 раза (работает и в демо-режиме).
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-xl border border-[#E7C768]/50 text-sm font-bold text-[#E7C768] shrink-0">
                    {antiAi[kind] ? "Активна (÷2)" : "Выкл."}
                  </span>
                </label>
              </div>
            </div>

            {busy && <LoadingPhrase entity="interview" />}

            {/* STAGE 1: РЕЗЮМЕ */}
            {kind === "resume" && (
              <div className="space-y-4">
                <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/45 rounded-2xl px-4 py-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-[#17344F]" /> Результат ИИ
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFieldsModalOpen(true)}
                      className="px-3.5 py-1.5 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md text-[#fceabb] text-sm font-semibold hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all inline-flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-[#E7C768]" />
                      <span>
                        Поля анкеты и резюме кандидата (26 стандартных +{" "}
                        {
                          (
                            customFieldsOverride ||
                            parseVacancyCustomFieldsConfig(
                              (project as any)?.candidate_fields_config ?? (project as any)?.candidateFieldsConfig
                            ).customFields
                          ).length
                        }{" "}
                        кастомных)
                      </span>
                    </button>
                  </div>
                  <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug">
                    {RESULT_TITLE.resume}
                  </h4>

                  {/* Облако тегов: 26 стандартных полей + кастомные поля вакансии */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {STANDARD_CANDIDATE_FIELDS.map((sf) => (
                      <span
                        key={`iw-std-${sf.key}`}
                        onClick={() => setIsFieldsModalOpen(true)}
                        className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-white/25 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] text-white transition-all break-words"
                        title={
                          sf.type === "multiselect" && sf.options
                            ? `Стандартное поле (мультисписок): ${sf.options.join(", ")}`
                            : "Стандартное текстовое поле"
                        }
                      >
                        <span className="font-medium text-white">{sf.label}</span>
                        <span className="text-white/65">
                          ({sf.type === "multiselect" ? "мультисписок" : "текст"})
                        </span>
                      </span>
                    ))}
                    {(
                      customFieldsOverride ||
                      parseVacancyCustomFieldsConfig(
                        (project as any)?.candidate_fields_config ?? (project as any)?.candidateFieldsConfig
                      ).customFields
                    ).map((cf, i) => (
                      <span
                        key={cf.id || cf.key || `iw-custom-${i}`}
                        onClick={() => setIsFieldsModalOpen(true)}
                        className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-[#E7C768] hover:shadow-[0_0_12px_rgba(212,175,55,0.3)] bg-transparent backdrop-blur-md text-[14px] text-white transition-all break-words"
                        title={
                          cf.type === "multiselect" && cf.options
                            ? `Кастомное поле (мультисписок): ${cf.options.join(", ")}`
                            : "Кастомное текстовое поле"
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#E7C768] shrink-0" />
                        <span className="font-semibold text-[#fceabb]">{cf.label}</span>
                        <span className="text-white/75">
                          ({cf.type === "multiselect" ? "мультисписок" : "текст"})
                        </span>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsFieldsModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-dashed border-[#E7C768]/60 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] font-medium text-[#fceabb] transition-all"
                    >
                      <Plus className="h-4 w-4 text-[#E7C768]" />
                      <span>Добавить или импортировать поля</span>
                    </button>
                  </div>
                </div>

                <CandidateFieldsModal
                  isOpen={isFieldsModalOpen}
                  onClose={() => setIsFieldsModalOpen(false)}
                  roleName={project?.roleName || ""}
                  companyName={project?.companyName || ""}
                  description={(project as any)?.vacancy_text || (project as any)?.vacancyText || ""}
                  duties={(project as any)?.tasks_activity_text || (project as any)?.tasksActivityText || ""}
                  requirements={(project as any)?.system_text || (project as any)?.systemText || resumeMd}
                  customFields={
                    customFieldsOverride ||
                    parseVacancyCustomFieldsConfig(
                      (project as any)?.candidate_fields_config ?? (project as any)?.candidateFieldsConfig
                    ).customFields
                  }
                  onChangeCustomFields={async (nextFields) => {
                    setCustomFieldsOverride(nextFields);
                    if (project?.id) {
                      const nextCfg = { standardFieldsEnabled: true, customFields: nextFields };
                      try {
                        await fetch(`/api/projects/${project.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            candidate_fields_config: JSON.stringify(nextCfg),
                          }),
                        });
                        await refreshProjects();
                      } catch (e) {
                        console.warn("Failed to save candidate_fields_config from InterviewWizard:", e);
                      }
                    }
                  }}
                  otherProjects={projects}
                  currentProjectId={project?.id}
                  employerId={effectiveEmployerId}
                  themeConfig={activeCompanyTheme}
                />

                <MiniAudioField
                  label="Критерии оценки резюме"
                  value={resumeMd}
                  onChange={setResumeMd}
                  minRows={10}
                  maxLength={10000}
                  allowFullscreen={true}
                  placeholder="Важные критерии для оценки резюме кандидата..."
                />

                <div className="flex flex-wrap justify-end items-center gap-3 pt-1">
                  {savedFlash === "resume" && saving !== "resume" && (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-[#E7C768] animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено в БД
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => saveBlock("resume", { criteria_md: resumeMd })}
                    disabled={saving === "resume"}
                    className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg hover:brightness-105 transition cursor-pointer disabled:opacity-60"
                  >
                    {saving === "resume" ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Сохраняем…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-[#17344F]" /> Сохранить Скрининг
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STAGE 2: ЧЕК-ЛИСТ */}
            {kind === "checklist" && (
              <div className="space-y-4">
                <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/45 rounded-2xl px-4 py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-[#17344F]" /> Результат ИИ · 4 типа полей
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setChecklist((prev) => normalizeAndShuffleChecklist(prev, true, true));
                      }}
                      className="bg-transparent backdrop-blur-xl text-white border border-[#E7C768]/60 hover:border-[#E7C768] font-bold text-sm px-3.5 py-1.5 rounded-2xl inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Shuffle className="w-4 h-4 text-[#E7C768]" /> Перемешать вопросы и варианты
                    </button>
                  </div>
                  <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug">
                    {RESULT_TITLE.checklist}
                  </h4>
                  <p className="text-sm text-white/85">
                    Поддерживаются 4 типа ввода данных: список (одиночный выбор), мультивыбор (множественный выбор галочками), текст (краткий ответ строкой) и абзац (развернутый ответ).
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                    Вопросов: {checklist.length}/30
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-white/90">
                    {(["choice", "multichoice", "text", "paragraph"] as ChecklistQKind[]).map((kType) => {
                      const cnt = checklist.filter((q) => normalizeQuestionKind(q.kind) === kType).length;
                      return (
                        <span
                          key={kType}
                          className="px-3 py-1 rounded-xl border border-white/25 bg-transparent backdrop-blur-md"
                        >
                          {QUESTION_KIND_META[kType].shortLabel}: <strong className="text-[#E7C768]">{cnt}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <label className="flex flex-wrap items-center gap-3 bg-transparent backdrop-blur-xl border border-white/25 rounded-2xl px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklistShuffle}
                    onChange={(e) => {
                      const nextVal = e.target.checked;
                      setChecklistShuffle(nextVal);
                      if (nextVal) {
                        setChecklist((prev) => normalizeAndShuffleChecklist(prev, true, true));
                      }
                    }}
                    className="accent-[#E7C768] w-5 h-5 cursor-pointer"
                  />
                  <span className="text-sm text-white font-bold">
                    Случайный порядок вопросов и вариантов ответа в списке и мультивыборе
                  </span>
                  <span className="text-sm text-white/80 ml-auto">
                    Варианты и вопросы перемешиваются автоматически.
                  </span>
                </label>

                {checklist.length === 0 && (
                  <p className="text-sm text-white/85">
                    Нет вопросов. Нажмите «Сгенерировать ИИ» или добавьте вручную.
                  </p>
                )}

                {checklist.map((q, i) => {
                  const qKind = normalizeQuestionKind(q.kind);
                  const multiCorrect = Array.isArray(q.correct_options)
                    ? q.correct_options
                    : typeof q.correct === "string" && q.correct.includes("||")
                    ? q.correct.split("||").map((s) => s.trim()).filter(Boolean)
                    : q.correct
                    ? [String(q.correct)]
                    : [];

                  return (
                    <div
                      key={q.id || i}
                      className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-sm">
                            Вопрос #{i + 1} · {QUESTION_KIND_META[qKind].label}
                          </span>
                          <span
                            className="px-2.5 py-1 rounded-xl border border-white/20 bg-transparent text-white font-mono text-sm font-bold"
                            title="Рассчитывается пропорционально: 100 / количество вопросов"
                          >
                            {(100 / (checklist.length || 1)).toFixed(2)} баллов
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(["choice", "multichoice", "text", "paragraph"] as ChecklistQKind[]).map((typeKey) => {
                            const isCurrentType = qKind === typeKey;
                            return (
                              <button
                                key={typeKey}
                                type="button"
                                onClick={() => {
                                  const c = [...checklist];
                                  const defaultOpts =
                                    Array.isArray(q.options) && q.options.length >= 2
                                      ? shuffleArray(q.options)
                                      : ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"];
                                  if (typeKey === "choice") {
                                    const firstCorrect = multiCorrect[0] || defaultOpts[0] || "";
                                    c[i] = {
                                      ...q,
                                      kind: "choice",
                                      options: defaultOpts,
                                      correct: firstCorrect,
                                      correct_options: firstCorrect ? [firstCorrect] : [],
                                    };
                                  } else if (typeKey === "multichoice") {
                                    const nextMulti =
                                      multiCorrect.length >= 2
                                        ? multiCorrect
                                        : defaultOpts.slice(0, 2);
                                    c[i] = {
                                      ...q,
                                      kind: "multichoice",
                                      options: defaultOpts,
                                      correct_options: nextMulti,
                                      correct: nextMulti.join(" || "),
                                    };
                                  } else {
                                    c[i] = {
                                      ...q,
                                      kind: typeKey,
                                      expected_answer: q.expected_answer || q.correct || "",
                                    };
                                  }
                                  setChecklist(c);
                                }}
                                className={`px-2.5 py-1 rounded-xl text-sm font-semibold border transition cursor-pointer ${
                                  isCurrentType
                                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold"
                                    : "bg-transparent border-white/25 text-white hover:border-[#E7C768]"
                                }`}
                              >
                                {QUESTION_KIND_META[typeKey].shortLabel}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              const nextQs = checklist.filter((_, j) => j !== i);
                              const point = nextQs.length > 0 ? Number((100 / nextQs.length).toFixed(2)) : 0;
                              setChecklist(nextQs.map((item) => ({ ...item, points: point })));
                            }}
                            title="Удалить вопрос"
                            className="p-2 rounded-xl bg-transparent border border-white/25 text-white hover:border-[#E7C768] hover:text-[#E7C768] transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <MiniAudioField
                        label="Вопрос для кандидата"
                        value={q.question}
                        onChange={(val) => {
                          const c = [...checklist];
                          c[i] = { ...q, question: val };
                          setChecklist(c);
                        }}
                        placeholder="Введите или надиктуйте формулировку вопроса..."
                        minRows={2}
                      />

                      {qKind === "choice" && (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                              Варианты ответа (от 2 до 15 вариантов, отметьте 1 правильный — перемешиваются при выборе):
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 text-sm text-white/90">
                                <span>Количество вариантов:</span>
                                <select
                                  value={(q.options || ["", "", "", ""]).length}
                                  onChange={(e) => {
                                    const targetCount = Math.max(2, Math.min(15, Number(e.target.value) || 4));
                                    const c = [...checklist];
                                    const currOpts = [...(q.options || ["", "", "", ""])];
                                    while (currOpts.length < targetCount) currOpts.push("");
                                    const nextOpts = currOpts.slice(0, targetCount);
                                    const nextCorr = nextOpts.includes(q.correct || "") ? q.correct : (nextOpts[0] || "");
                                    c[i] = {
                                      ...q,
                                      options: nextOpts,
                                      correct: nextCorr,
                                      correct_options: nextCorr ? [nextCorr] : [],
                                    };
                                    setChecklist(c);
                                  }}
                                  className="bg-transparent backdrop-blur-md text-white border border-white/25 focus:border-[#E7C768] rounded-xl px-2.5 py-1 text-sm font-bold cursor-pointer"
                                >
                                  {Array.from({ length: 14 }, (_, idx) => idx + 2).map((cnt) => (
                                    <option key={cnt} value={cnt} className="bg-[#17344F] text-white">
                                      {cnt}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const c = [...checklist];
                                  c[i] = { ...q, options: shuffleArray(q.options || []) };
                                  setChecklist(c);
                                }}
                                className="text-sm font-semibold text-[#E7C768] hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Shuffle className="w-3.5 h-3.5" /> Перемешать варианты
                              </button>
                            </div>
                          </div>
                          {(q.options || ["", "", "", ""]).map((opt, oi) => {
                            const currentOpts = q.options || ["", "", "", ""];
                            return (
                              <div key={`${oi}`} className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  checked={q.correct === opt}
                                  onChange={() => {
                                    const c = [...checklist];
                                    const nextOpts = checklistShuffle ? shuffleArray(currentOpts) : currentOpts;
                                    c[i] = {
                                      ...q,
                                      options: nextOpts,
                                      correct: opt,
                                      correct_options: [opt],
                                    };
                                    setChecklist(c);
                                  }}
                                  className="accent-[#E7C768] w-5 h-5 cursor-pointer shrink-0"
                                  title="Отметить как правильный ответ"
                                />
                                <div className="flex-1 min-w-0">
                                  <MiniAudioField
                                    value={opt}
                                    onChange={(val) => {
                                      const c = [...checklist];
                                      const opts = [...currentOpts];
                                      opts[oi] = val;
                                      c[i] = {
                                        ...q,
                                        options: opts,
                                        correct: q.correct === opt ? val : q.correct,
                                      };
                                      setChecklist(c);
                                    }}
                                    placeholder={`Вариант ответа #${oi + 1}`}
                                    minRows={1}
                                  />
                                </div>
                                {currentOpts.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const c = [...checklist];
                                      const nextOpts = currentOpts.filter((_, idx) => idx !== oi);
                                      const nextCorr =
                                        q.correct === opt ? (nextOpts[0] || "") : q.correct;
                                      c[i] = {
                                        ...q,
                                        options: nextOpts,
                                        correct: nextCorr,
                                        correct_options: nextCorr ? [nextCorr] : [],
                                      };
                                      setChecklist(c);
                                    }}
                                    title="Удалить вариант"
                                    className="p-2 rounded-xl bg-transparent border border-white/25 text-white/80 hover:border-[#E7C768] hover:text-[#E7C768] transition cursor-pointer shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {(q.options || ["", "", "", ""]).length < 15 && (
                            <button
                              type="button"
                              onClick={() => {
                                const c = [...checklist];
                                const nextOpts = [...(q.options || ["", "", "", ""]), ""];
                                c[i] = { ...q, options: nextOpts };
                                setChecklist(c);
                              }}
                              className="text-sm font-semibold text-[#E7C768] hover:underline inline-flex items-center gap-1.5 pt-1 cursor-pointer"
                            >
                              <Plus className="w-4 h-4" /> Добавить вариант ответа ({(q.options || ["", "", "", ""]).length}/15)
                            </button>
                          )}
                        </div>
                      )}

                      {qKind === "multichoice" && (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                              Варианты ответа (от 2 до 15 вариантов, отметьте галочками любое количество правильных — выбрано: {multiCorrect.length}):
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 text-sm text-white/90">
                                <span>Количество вариантов:</span>
                                <select
                                  value={(q.options || ["", "", "", ""]).length}
                                  onChange={(e) => {
                                    const targetCount = Math.max(2, Math.min(15, Number(e.target.value) || 4));
                                    const c = [...checklist];
                                    const currOpts = [...(q.options || ["", "", "", ""])];
                                    while (currOpts.length < targetCount) currOpts.push("");
                                    const nextOpts = currOpts.slice(0, targetCount);
                                    const nextCorr = multiCorrect.filter((item) => nextOpts.includes(item));
                                    c[i] = {
                                      ...q,
                                      kind: "multichoice",
                                      options: nextOpts,
                                      correct_options: nextCorr,
                                      correct: nextCorr.join(" || "),
                                    };
                                    setChecklist(c);
                                  }}
                                  className="bg-transparent backdrop-blur-md text-white border border-white/25 focus:border-[#E7C768] rounded-xl px-2.5 py-1 text-sm font-bold cursor-pointer"
                                >
                                  {Array.from({ length: 14 }, (_, idx) => idx + 2).map((cnt) => (
                                    <option key={cnt} value={cnt} className="bg-[#17344F] text-white">
                                      {cnt}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const c = [...checklist];
                                  c[i] = { ...q, options: shuffleArray(q.options || []) };
                                  setChecklist(c);
                                }}
                                className="text-sm font-semibold text-[#E7C768] hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Shuffle className="w-3.5 h-3.5" /> Перемешать варианты
                              </button>
                            </div>
                          </div>
                          {(q.options || ["", "", "", ""]).map((opt, oi) => {
                            const currentOpts = q.options || ["", "", "", ""];
                            const isChecked = multiCorrect.includes(opt);
                            return (
                              <div key={`${oi}`} className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const c = [...checklist];
                                    const nextCorrect = isChecked
                                      ? multiCorrect.filter((x) => x !== opt)
                                      : [...multiCorrect, opt];
                                    const nextOpts = checklistShuffle ? shuffleArray(currentOpts) : currentOpts;
                                    c[i] = {
                                      ...q,
                                      kind: "multichoice",
                                      options: nextOpts,
                                      correct_options: nextCorrect,
                                      correct: nextCorrect.join(" || "),
                                    };
                                    setChecklist(c);
                                  }}
                                  className="accent-[#E7C768] w-5 h-5 cursor-pointer shrink-0"
                                  title="Отметить как правильный вариант"
                                />
                                <div className="flex-1 min-w-0">
                                  <MiniAudioField
                                    value={opt}
                                    onChange={(val) => {
                                      const c = [...checklist];
                                      const opts = [...currentOpts];
                                      opts[oi] = val;
                                      const updatedCorrect = multiCorrect.map((item) => (item === opt ? val : item));
                                      c[i] = {
                                        ...q,
                                        kind: "multichoice",
                                        options: opts,
                                        correct_options: updatedCorrect,
                                        correct: updatedCorrect.join(" || "),
                                      };
                                      setChecklist(c);
                                    }}
                                    placeholder={`Вариант ответа #${oi + 1}`}
                                    minRows={1}
                                  />
                                </div>
                                {currentOpts.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const c = [...checklist];
                                      const nextOpts = currentOpts.filter((_, idx) => idx !== oi);
                                      const nextCorrect = multiCorrect.filter((item) => item !== opt);
                                      c[i] = {
                                        ...q,
                                        kind: "multichoice",
                                        options: nextOpts,
                                        correct_options: nextCorrect,
                                        correct: nextCorrect.join(" || "),
                                      };
                                      setChecklist(c);
                                    }}
                                    title="Удалить вариант"
                                    className="p-2 rounded-xl bg-transparent border border-white/25 text-white/80 hover:border-[#E7C768] hover:text-[#E7C768] transition cursor-pointer shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {(q.options || ["", "", "", ""]).length < 15 && (
                            <button
                              type="button"
                              onClick={() => {
                                const c = [...checklist];
                                const nextOpts = [...(q.options || ["", "", "", ""]), ""];
                                c[i] = { ...q, options: nextOpts };
                                setChecklist(c);
                              }}
                              className="text-sm font-semibold text-[#E7C768] hover:underline inline-flex items-center gap-1.5 pt-1 cursor-pointer"
                            >
                              <Plus className="w-4 h-4" /> Добавить вариант ответа ({(q.options || ["", "", "", ""]).length}/15)
                            </button>
                          )}
                        </div>
                      )}

                      {qKind === "text" && (
                        <MiniAudioField
                          label="Эталонный краткий ответ (текст — строка, для проверки ИИ)"
                          value={q.expected_answer || ""}
                          onChange={(val) => {
                            const c = [...checklist];
                            c[i] = { ...q, kind: "text", expected_answer: val };
                            setChecklist(c);
                          }}
                          placeholder="Введите или надиктуйте краткий эталонный ответ (термин, метрика, короткая фраза)..."
                          minRows={1}
                        />
                      )}

                      {qKind === "paragraph" && (
                        <MiniAudioField
                          label="Эталонный развернутый ответ (абзац — несколько предложений, для проверки ИИ)"
                          value={q.expected_answer || ""}
                          onChange={(val) => {
                            const c = [...checklist];
                            c[i] = { ...q, kind: "paragraph", expected_answer: val };
                            setChecklist(c);
                          }}
                          placeholder="Введите или надиктуйте развернутый эталонный ответ из нескольких предложений..."
                          minRows={3}
                        />
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={checklist.length >= 30}
                    onClick={() => {
                      const nextQs = [
                        ...checklist,
                        { id: `q${Date.now()}`, kind: "choice" as const, question: "", options: ["", "", "", ""], correct: "" },
                      ];
                      const pt = Number((100 / nextQs.length).toFixed(2));
                      setChecklist(nextQs.map((q) => ({ ...q, points: pt })));
                    }}
                    className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4 text-[#17344F]" /> Список
                  </button>
                  <button
                    type="button"
                    disabled={checklist.length >= 30}
                    onClick={() => {
                      const nextQs = [
                        ...checklist,
                        {
                          id: `q${Date.now()}`,
                          kind: "multichoice" as const,
                          question: "",
                          options: ["", "", "", ""],
                          correct_options: [],
                          correct: "",
                        },
                      ];
                      const pt = Number((100 / nextQs.length).toFixed(2));
                      setChecklist(nextQs.map((q) => ({ ...q, points: pt })));
                    }}
                    className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4 text-[#17344F]" /> Мультивыбор
                  </button>
                  <button
                    type="button"
                    disabled={checklist.length >= 30}
                    onClick={() => {
                      const nextQs = [...checklist, { id: `q${Date.now()}`, kind: "text" as const, question: "", expected_answer: "" }];
                      const pt = Number((100 / nextQs.length).toFixed(2));
                      setChecklist(nextQs.map((q) => ({ ...q, points: pt })));
                    }}
                    className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4 text-[#17344F]" /> Текст
                  </button>
                  <button
                    type="button"
                    disabled={checklist.length >= 30}
                    onClick={() => {
                      const nextQs = [
                        ...checklist,
                        { id: `q${Date.now()}`, kind: "paragraph" as const, question: "", expected_answer: "" },
                      ];
                      const pt = Number((100 / nextQs.length).toFixed(2));
                      setChecklist(nextQs.map((q) => ({ ...q, points: pt })));
                    }}
                    className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4 text-[#17344F]" /> Абзац
                  </button>
                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    {savedFlash === "checklist" && saving !== "checklist" && (
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[#E7C768] animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено в БД
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => saveBlock("checklist", { questions: checklist, shuffle: checklistShuffle })}
                      disabled={saving === "checklist"}
                      className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg hover:brightness-105 transition cursor-pointer disabled:opacity-60"
                    >
                      {saving === "checklist" ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Сохраняем…
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 text-[#17344F]" /> Сохранить чек-лист
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 3: СИТУАЦИИ */}
            {kind === "situations" && (
              <div className="space-y-4">
                <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/45 rounded-2xl px-4 py-3 space-y-1.5">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-[#17344F]" /> Результат ИИ
                    </span>
                  </div>
                  <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug">
                    {RESULT_TITLE.situations}
                  </h4>
                </div>

                {situations.length === 0 && (
                  <p className="text-sm text-white/85">Нет ситуаций. Сгенерируйте или добавьте.</p>
                )}

                {situations.map((s, i) => (
                  <div
                    key={s.id || i}
                    className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-sm">
                        Ситуация #{i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSituations(situations.filter((_, j) => j !== i))}
                        title="Удалить ситуацию"
                        className="p-2 rounded-xl bg-transparent border border-white/25 text-white hover:border-[#E7C768] hover:text-[#E7C768] transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <MiniAudioField
                      label="Тема ситуации"
                      value={s.title}
                      onChange={(val) => {
                        const c = [...situations];
                        c[i] = { ...s, title: val };
                        setSituations(c);
                      }}
                      placeholder="Тема ролевой ситуации..."
                      minRows={1}
                    />

                    <MiniAudioField
                      label="Описание ситуации (вопрос для кандидата)"
                      value={s.brief}
                      onChange={(val) => {
                        const c = [...situations];
                        c[i] = { ...s, brief: val };
                        setSituations(c);
                      }}
                      placeholder="Описание ситуации для кандидата..."
                      minRows={3}
                    />

                    <MiniAudioField
                      label="Критерии хорошего ответа (для ИИ)"
                      value={s.criteria}
                      onChange={(val) => {
                        const c = [...situations];
                        c[i] = { ...s, criteria: val };
                        setSituations(c);
                      }}
                      placeholder="Критерии хорошего ответа (для ИИ)..."
                      minRows={2}
                    />
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {situations.length < 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSituations([...situations, { id: `s${situations.length + 1}`, title: "", brief: "", criteria: "" }])
                      }
                      className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md hover:brightness-105 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-[#17344F]" /> Ситуация
                    </button>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    {savedFlash === "situations" && saving !== "situations" && (
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[#E7C768] animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено в БД
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => saveBlock("situations", { situations })}
                      disabled={saving === "situations"}
                      className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg hover:brightness-105 transition cursor-pointer disabled:opacity-60"
                    >
                      {saving === "situations" ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Сохраняем…
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 text-[#17344F]" /> Сохранить ситуации
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
