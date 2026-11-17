import React, { useEffect, useMemo, useRef, useState } from "react";
import { resolveActiveEmployerId } from "@/lib/actorSession";
import {
  GraduationCap,
  RefreshCw,
  Sparkles,
  BookOpen,
  FileQuestion,
  Eye,
  Pencil,
  Plus,
  Trash2,
  ArrowLeft,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link2,
  Table,
  Code,
  Youtube,
  FileText,
  Save,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Video,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Check,
  Layers,
  Minus,
  Quote,
  Monitor,
  Smartphone,
  Tablet,
  Maximize2,
  Minimize2,
  Lock,
  Play,
  RotateCcw,
  CheckSquare,
  Square,
  X,
  Mic,
  AlertCircle,
  Copy,
} from "lucide-react";
import CopyTrainingModal from "./training/CopyTrainingModal";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { buildThemeCss, ensureGoogleFontLoaded, hexToRgba } from "@/components/LandingStyleEditor";
import { CompanyThemedLogo } from "@/components/CompanyThemedLogo";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";
import { dbClient } from "@/lib/dbClient";
import { FN } from "@/config";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import FullscreenTextarea from "@/components/FullscreenTextarea";
import { GetDoc } from "@/components/GetDoc";
import {
  ImageConstructorModal,
  VideoConstructorModal,
  DocumentConstructorModal,
  LinkConstructorModal,
  TableConstructorModal,
} from "@/components/TrainingContentModals";
import FieldHelp from "@/components/FieldHelp";
import MiniAudioField from "@/components/MiniAudioField";
import AudioField from "@/components/AudioField";
import CandidateTrainingStageReport from "@/components/reports/CandidateTrainingStageReport";
import ArticleConstructor from "@/components/ArticleConstructor";
import {
  parseSubpages,
  serializeSubpages,
  getAllSubpagesPlainText,
  buildCompositeSubpageTitle,
  TrainingSubpage,
} from "@/lib/trainingSubpages";
import { cleanArticleExcerpt } from "@/lib/mdExcerpt";
import { toast } from "sonner";
import type { JobProject } from "../types";

type AuditFn = (level: "success" | "warning" | "info", title: string, msg: string) => void;
type Stage = "professional" | "product" | "system";

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

const STAGES: { key: Stage; title: string; hint: string }[] = [
  { key: "professional", title: "1. Профессиональное обучение", hint: "Навыки, обязанности, методики по должности" },
  { key: "product",      title: "2. Продуктовое обучение",       hint: "Продукты, услуги, линейки и аргументация компании" },
  { key: "system",       title: "3. Системное обучение",         hint: "CRM, регламенты, правила и условия работы" },
];

export type QuestionKind = "choice" | "multichoice" | "string" | "paragraph" | "text";

type BlockRow = { id: string; project_id: string; stage: string; title: string; materials_md: string | null };
type QuestionRow = {
  id: string;
  kind: QuestionKind;
  question: string;
  points: number;
  options?: { text: string; is_correct?: boolean }[] | null;
  correct?: string | string[] | null;
  expected_answer?: string | null;
  explanation?: string;
};
type TestRow = { id?: string; questions: QuestionRow[]; pass_score: number; total_score: number; shuffle: boolean };

export function normalizeQuestionsList(raw: any): QuestionRow[] {
  let list: any[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
      else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).questions)) {
        list = (parsed as any).questions;
      }
    } catch {}
  } else if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as any).questions)) {
    list = (raw as any).questions;
  }

  return list.map((item: any, idx: number): QuestionRow => {
    if (!item || typeof item !== "object") {
      return {
        id: `q${idx + 1}`,
        kind: "text",
        question: String(item || ""),
        points: 5,
        options: [],
      };
    }

    const qText = item.question || item.q || item.title || "";
    let options: Array<{ text: string; is_correct?: boolean }> = [];

    if (Array.isArray(item.options)) {
      options = item.options.map((opt: any, optIdx: number) => {
        if (typeof opt === "string") {
          const isCorrect = item.correctIndex !== undefined
            ? optIdx === Number(item.correctIndex)
            : optIdx === 0;
          return { text: opt, is_correct: isCorrect };
        }
        return {
          text: opt?.text || opt?.title || "",
          is_correct: Boolean(opt?.is_correct ?? opt?.correct),
        };
      });
    }

    let kind: QuestionKind = item.kind || "choice";
    if (kind === "choice" && (!options || options.length === 0)) {
      kind = (item.expected_answer || item.answer || item.correct_answer) ? "paragraph" : "choice";
    }

    // If it's a choice or multichoice question and options are still empty,
    // provide 2 default editable slots so employer can immediately edit choices
    if ((kind === "choice" || kind === "multichoice") && options.length === 0) {
      options = [
        { text: "Вариант 1", is_correct: true },
        { text: "Вариант 2", is_correct: false },
      ];
    }

    const propPoints = Number((100 / (list.length || 1)).toFixed(2));
    return {
      id: item.id || `q${idx + 1}`,
      kind,
      question: qText,
      points: propPoints,
      options: options.length > 0 ? options : null,
      correct: item.correct ?? (options.find((o) => o.is_correct)?.text || null),
      expected_answer: item.expected_answer || item.answer || item.correct_answer || null,
      explanation: item.explanation || "",
    };
  });
}

const MAX_QUESTIONS = 30;

const CONTEXT_OPTIONS: { key: string; label: string; column: string; fallbackColumn?: string }[] = [
  { key: "intro",        label: "Введение",         column: "training_wiki_text",          fallbackColumn: "training_intro_text" },
  { key: "professional", label: "Профессиональный", column: "training_professional_text", fallbackColumn: "training_prof_text" },
  { key: "product",      label: "Продуктовый",      column: "training_product_text" },
  { key: "systems",      label: "Системный",        column: "training_systems_text",      fallbackColumn: "training_system_text" },
  { key: "regulations",  label: "Регламенты",       column: "training_regulations_text" },
];
const CONTEXT_MAX = 1500;

const STAGE_DEFAULT_CONTEXT: Record<Stage, string[]> = {
  professional: ["intro", "professional"],
  product:      ["product"],
  system:       ["systems", "regulations"],
};

export default function TrainingWizard({
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
  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  const lockedProject = !!initialProjectId;
  const [stage, setStage] = useState<Stage>("professional");
  const [copyModalMode, setCopyModalMode] = useState<"from" | "to" | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Companies list for styling resolution
  const [companiesList, setCompaniesList] = useState<any[]>(companies || []);

  useEffect(() => {
    if (companies && companies.length > 0) {
      setCompaniesList(companies);
      return;
    }
    const resolvedEmp = resolveActiveEmployerId({ employer_id: employerId });
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
    return () => { cancelled = true; };
  }, [companies, employerId]);

  // 4 Primary Tabs: Учебный материал (подстраницы) | Предпоказ страницы кандидата | Аттестация (тест) | Предпоказ аттестации
  const [subTab, setSubTab] = useState<"material" | "preview" | "test" | "test_preview">("material");

  // Track if materials and test have been saved at least once to DB
  const [hasSavedMaterials, setHasSavedMaterials] = useState<boolean>(false);
  const [hasSavedTest, setHasSavedTest] = useState<boolean>(false);
  const [savePromptModal, setSavePromptModal] = useState<{ open: boolean; type: "material" | "test" }>({ open: false, type: "material" });

  // Employer Exam Preview State (runs live ProTalk without charging limits)
  const [examPreviewAnswers, setExamPreviewAnswers] = useState<Record<string, string>>({});
  const [examPreviewChecking, setExamPreviewChecking] = useState<boolean>(false);
  const [examPreviewResult, setExamPreviewResult] = useState<{
    score: number;
    passed: boolean;
    per_question: any[];
    candidate_summary?: any;
  } | null>(null);

  const [block, setBlock] = useState<BlockRow | null>(null);

  // Subpages State
  const [subpages, setSubpages] = useState<TrainingSubpage[]>([
    { id: "sub_1", title: "Основной материал", content: "" },
  ]);
  const [activeSubpageIdx, setActiveSubpageIdx] = useState<number>(0);

  const [test, setTest] = useState<TestRow>({ questions: [], pass_score: 70, total_score: 100, shuffle: true });

  // Uploaded source text for active subpage
  const [subpageSourceText, setSubpageSourceText] = useState<string>("");

  const materialsRef = useRef<HTMLTextAreaElement | null>(null);
  const [busyMaterial, setBusyMaterial] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [saving, setSaving] = useState(false);

  // Live preview subpage tracker
  const [previewSubpageIdx, setPreviewSubpageIdx] = useState<number>(0);

  const [contextKeysByStage, setContextKeysByStage] = useState<Record<Stage, string[]>>({
    professional: STAGE_DEFAULT_CONTEXT.professional,
    product:      STAGE_DEFAULT_CONTEXT.product,
    system:       STAGE_DEFAULT_CONTEXT.system,
  });
  const contextKeys = contextKeysByStage[stage];
  const toggleContextKey = (k: string) =>
    setContextKeysByStage((s) => ({
      ...s,
      [stage]: s[stage].includes(k) ? s[stage].filter((x) => x !== k) : [...s[stage], k],
    }));

  const [wishesMaterial, setWishesMaterial] = useState("");
  const [wishesTest, setWishesTest] = useState("");
  const [existingSystems, setExistingSystems] = useState<Set<string>>(new Set());

  // Context source values
  const [contextValues, setContextValues] = useState<Record<string, string>>({});
  const [contextDirty, setContextDirty] = useState<Record<string, boolean>>({});
  const [contextSaving, setContextSaving] = useState(false);
  const [contextExpanded, setContextExpanded] = useState<Record<string, boolean>>({});

  // Save flashes
  const [savedFlashMaterial, setSavedFlashMaterial] = useState(false);
  const [savedFlashTest, setSavedFlashTest] = useState(false);

  // Publish subpage to blog checkbox
  const [publishSubpageToBlog, setPublishSubpageToBlog] = useState(false);

  // Content constructor modals for Rich Text Editor
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("project");
    if (!initialProjectId && q && projects.some((p) => p.id === q)) setProjectId(q);
  }, [projects, initialProjectId]);

  useEffect(() => {
    if (!createMode) return;
    (async () => {
      const ids = projects.map((p) => p.id);
      if (!ids.length) return;
      const { data } = await dbClient.from("training_blocks").select("project_id").in("project_id", ids);
      const set = new Set<string>();
      (data || []).forEach((r: any) => set.add(r.project_id));
      setExistingSystems(set);
    })();
  }, [createMode, projects]);

  const project = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    if (projectId) {
      const found = projects.find(
        (p) =>
          p.id === projectId ||
          p.public_id === projectId ||
          (p as any).publicId === projectId ||
          (p as any).slug === projectId
      );
      if (found) return found;
    }
    return projects[0] || null;
  }, [projects, projectId]);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewFullscreen, setPreviewFullscreen] = useState<boolean>(false);
  const [fetchedCompanyTheme, setFetchedCompanyTheme] = useState<any>(null);

  // Fetch company theme fallback if not immediately available on project or in memory list
  useEffect(() => {
    if (!project) return;
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

  const activeCompanyTheme = useMemo(() => {
    if (!project) return null;
    const compId = String((project as any).company_id || (project as any).companyId || "");
    const compCleanId = compId.replace(/^comp-?/i, "");
    const compPublicId = String((project as any).company_public_id || (project as any).companyPublicId || "");
    const compSlug = String((project as any).company_slug || (project as any).companySlug || "");
    const compName = String(project.companyName || (project as any).company_name || "").trim().toLowerCase();

    const empId = String((project as any).employer_id || (project as any).employerId || "").replace(/\D/g, "");

    const company =
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
        : undefined);

    const raw =
      fetchedCompanyTheme ||
      company?.theme_config ||
      company?.css ||
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
  }, [project, companiesList, fetchedCompanyTheme]);

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

  const isThemeMonochrome = useMemo(() => {
    return Boolean(
      activeCompanyTheme?.allMediaMonochrome ||
      activeCompanyTheme?.sitePreviewMonochrome ||
      (activeCompanyTheme?.headingsSolidColor === "#FFFFFF" && (activeCompanyTheme?.pageBgColor === "#000000" || !activeCompanyTheme?.pageBgColor))
    );
  }, [activeCompanyTheme]);

  const previewPageBg = useMemo(() => {
    if (activeCompanyTheme?.pageBgColor) {
      return hexToRgba(activeCompanyTheme.pageBgColor, activeCompanyTheme.pageBgOpacity ?? 100);
    }
    return "#000000";
  }, [activeCompanyTheme]);

  const previewHeadingStyle: React.CSSProperties = useMemo(() => {
    const font = activeCompanyTheme?.fontFamily || undefined;
    if (activeCompanyTheme?.headingsColorMode === "gradient-gold") {
      return {
        fontFamily: font,
        backgroundImage: "linear-gradient(to right, #F5E296, #D4AF37, #AA771C)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    if (activeCompanyTheme?.headingsColorMode === "gradient-silver") {
      return {
        fontFamily: font,
        backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    const solid = activeCompanyTheme?.headingsSolidColor || "#FFFFFF";
    return {
      fontFamily: font,
      color: solid,
      WebkitTextFillColor: solid,
    };
  }, [activeCompanyTheme]);

  const previewActiveBtnStyle: React.CSSProperties = useMemo(() => {
    const bg = activeCompanyTheme?.btnActiveBgColor || "#FFFFFF";
    const op = activeCompanyTheme?.btnActiveOpacity ?? 100;
    const borderRgba = activeCompanyTheme?.btnBorderColor
      ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 25)
      : "rgba(255, 255, 255, 0.25)";
    const radius =
      activeCompanyTheme?.btnBorderRadius === 999
        ? "9999px"
        : `${activeCompanyTheme?.btnBorderRadius ?? 14}px`;
    return {
      backgroundColor: hexToRgba(bg, op),
      color: activeCompanyTheme?.btnActiveTextColor || "#000000",
      borderColor: borderRgba,
      borderWidth: `${activeCompanyTheme?.btnBorderWidth ?? 1}px`,
      borderRadius: radius,
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const previewInactiveBtnStyle: React.CSSProperties = useMemo(() => {
    const bg = activeCompanyTheme?.btnInactiveBgColor || "#000000";
    const op = activeCompanyTheme?.btnInactiveOpacity ?? 25;
    const borderRgba = activeCompanyTheme?.btnBorderColor
      ? hexToRgba(activeCompanyTheme.btnBorderColor, activeCompanyTheme.btnBorderOpacity ?? 25)
      : "rgba(255, 255, 255, 0.25)";
    const radius =
      activeCompanyTheme?.btnBorderRadius === 999
        ? "9999px"
        : `${activeCompanyTheme?.btnBorderRadius ?? 14}px`;
    return {
      backgroundColor: hexToRgba(bg, op),
      color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
      borderColor: borderRgba,
      borderWidth: `${activeCompanyTheme?.btnBorderWidth ?? 1}px`,
      borderRadius: radius,
      backdropFilter: `blur(${activeCompanyTheme?.glassBlurPx ?? 24}px)`,
      WebkitBackdropFilter: `blur(${activeCompanyTheme?.glassBlurPx ?? 24}px)`,
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  const previewCardBoxStyle: React.CSSProperties = useMemo(() => {
    const bg = activeCompanyTheme?.containerBgColor
      ? hexToRgba(activeCompanyTheme.containerBgColor, activeCompanyTheme.containerBgOpacity ?? 0)
      : "transparent";
    const borderRgba = activeCompanyTheme?.containerBorderColor
      ? hexToRgba(activeCompanyTheme.containerBorderColor, activeCompanyTheme.containerBorderOpacity ?? 25)
      : "rgba(255, 255, 255, 0.25)";
    const radius = `${activeCompanyTheme?.containerBorderRadius ?? 20}px`;
    return {
      backgroundColor: bg,
      borderColor: borderRgba,
      borderWidth: `${activeCompanyTheme?.containerBorderWidth ?? 1}px`,
      borderRadius: radius,
      backdropFilter: `blur(${activeCompanyTheme?.glassBlurPx ?? 24}px)`,
      WebkitBackdropFilter: `blur(${activeCompanyTheme?.glassBlurPx ?? 24}px)`,
      fontFamily: activeCompanyTheme?.fontFamily || undefined,
    };
  }, [activeCompanyTheme]);

  // Load context source values
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      const cols = CONTEXT_OPTIONS.flatMap((o) =>
        o.fallbackColumn ? [o.column, o.fallbackColumn] : [o.column]
      );
      const { data } = await dbClient.from("projects").select(cols.join(",")).eq("id", project.id).maybeSingle();
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      CONTEXT_OPTIONS.forEach((o) => {
        const direct = (data as any)[o.column];
        const fallback = o.fallbackColumn ? (data as any)[o.fallbackColumn] : undefined;
        map[o.key] = typeof direct === "string" ? direct : typeof fallback === "string" ? fallback : "";
      });
      setContextValues(map);
      setContextDirty({});
    })();
    return () => { cancelled = true; };
  }, [project?.id]);

  const saveContextValues = async () => {
    if (!project?.id) return;
    setContextSaving(true);
    try {
      const patch: Record<string, string> = {};
      CONTEXT_OPTIONS.forEach((o) => {
        if (contextDirty[o.key]) {
          patch[o.column] = contextValues[o.key] || "";
        }
      });
      if (!Object.keys(patch).length) return;
      const { error } = await (dbClient as any).from("projects").update(patch).eq("id", project.id);
      if (error) throw error;
      setContextDirty({});
      addAuditEvent("success", "Контекст сохранён", `Обновлены блоки в вакансии: ${Object.keys(patch).join(", ")}`);
      toast.success("Контекстные блоки успешно сохранены в базе данных");
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка сохранения контекста", e?.message || "");
      toast.error("Ошибка при сохранении контекста");
    } finally {
      setContextSaving(false);
    }
  };

  const loadedStageKeyRef = useRef<string | null>(null);

  // Load stage block & test
  useEffect(() => {
    if (!project?.id) return;
    const currentKey = `${project.id}_${stage}`;
    if (loadedStageKeyRef.current === currentKey) {
      return; // Already loaded this project and stage. Prevent wiping subpages and resetting preview index.
    }
    let cancelled = false;
    (async () => {
      let b: any = null;
      let tests: any = null;

      // 1. Fetch training block from ProTalk PG backend first for maximum durability
      try {
        const sqlRes = await fetch(`/api/training-blocks?project_id=${encodeURIComponent(project.id)}&stage=${encodeURIComponent(stage)}`);
        if (sqlRes.ok) {
          const sqlBlocks = await sqlRes.json();
          if (Array.isArray(sqlBlocks) && sqlBlocks.length > 0) {
            b = sqlBlocks[0];
          }
        }
      } catch (sqlErr) {
        console.warn("[TrainingWizard] Error loading training block from ProTalk PG:", sqlErr);
      }

      // 1b. Fetch tests from ProTalk PG backend first for durability and speed
      try {
        const testRes = await fetch(`/api/training-tests?project_id=${encodeURIComponent(project.id)}&stage=${encodeURIComponent(stage)}`);
        if (testRes.ok) {
          const sqlTest = await testRes.json();
          if (sqlTest && (sqlTest.questions || sqlTest.questions_json)) {
            tests = sqlTest;
          }
        }
      } catch (testSqlErr) {
        console.warn("[TrainingWizard] Error loading test from ProTalk PG:", testSqlErr);
      }

      // 2. Fetch tests and fallback training block from database
      try {
        const projAliases = Array.from(new Set([
          project.id,
          (project as any).public_id,
          (project as any).publicId,
          (project as any).slug,
          project.id ? String(project.id).replace(/^vac_?/i, "") : null
        ].filter(Boolean).map(String)));
        const stageAliases = Array.from(new Set([
          stage,
          stage === "system" ? "systems" : null,
          stage === "professional" ? "prof" : null,
          stage === "product" ? "prod" : null,
        ].filter(Boolean).map(String)));

        const [blocksRes, testsRes] = await Promise.all([
          !b ? dbClient.from("training_blocks").select("*").in("project_id", projAliases).in("stage", stageAliases).limit(1).maybeSingle() : Promise.resolve({ data: null }),
          !tests ? dbClient.from("training_stage_tests").select("*").in("project_id", projAliases).in("stage", stageAliases).order("updated_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (!b && blocksRes?.data && (blocksRes.data as any[]).length > 0) {
          b = (blocksRes.data as any[])[0];
        }
        if (!tests && testsRes?.data) {
          tests = testsRes.data;
        }
      } catch (sbErr) {
        console.warn("[TrainingWizard] Error loading from database:", sbErr);
      }

      if (cancelled) return;
      loadedStageKeyRef.current = currentKey;
      setBlock(b);

      const stageTitle = STAGES.find((s) => s.key === stage)?.title || "Основной материал";
      const compositeBaseTitle = buildCompositeSubpageTitle({
        companyName: project?.companyName,
        vacancyTitle: project?.roleName || (project as any)?.title,
        subpageIdx: 0,
        totalSubpages: 1,
      });
      let parsed: TrainingSubpage[] = [];
      if (b?.subpages_json) {
        try {
          const json = typeof b.subpages_json === "string" ? JSON.parse(b.subpages_json) : b.subpages_json;
          if (Array.isArray(json) && json.length > 0) {
            parsed = json;
          }
        } catch {}
      }
      if (!parsed.length) {
        parsed = parseSubpages(b?.materials_md || b?.content || "", compositeBaseTitle);
      }

      // Upgrade generic titles to composite standard format:
      // "Профессиональное обучение от (компания) для (вакансия)"
      parsed = parsed.map((p, pIdx) => {
        const trimmed = (p.title || "").trim();
        const isGeneric =
          !trimmed ||
          trimmed === "Основной материал" ||
          trimmed === stageTitle ||
          /^Подстраница\s+\d+$/i.test(trimmed) ||
          /^Раздел\s+\d+$/i.test(trimmed);
        if (isGeneric) {
          return {
            ...p,
            title: buildCompositeSubpageTitle({
              companyName: project?.companyName,
              vacancyTitle: project?.roleName || (project as any)?.title,
              subpageIdx: pIdx,
              totalSubpages: parsed.length,
            }),
          };
        }
        return p;
      });

      setSubpages(parsed);
      setActiveSubpageIdx(0);
      setPreviewSubpageIdx(0);
      setSubpageSourceText("");

      const hasBlockInDb = Boolean(b && (b.subpages_json || b.materials_md || b.content));
      setHasSavedMaterials(hasBlockInDb);

      const rawQuestions = (tests as any)?.questions || (tests as any)?.questions_json || [];
      const parsedQuestions = normalizeQuestionsList(rawQuestions);
      const hasQuizInDb = Boolean(tests && parsedQuestions.length > 0);
      setHasSavedTest(hasQuizInDb);

      setTest({
        id: (tests as any)?.id,
        questions: parsedQuestions,
        pass_score: Number((tests as any)?.pass_score || (tests as any)?.passing_score) || 70,
        total_score: (tests as any)?.total_score || parsedQuestions.reduce((s, q) => s + (q.points || 5), 0) || 100,
        shuffle: (tests as any)?.shuffle_questions !== false,
      });
    })();
    return () => { cancelled = true; };
  }, [project?.id, stage, reloadCounter]);

  const activeSubpage = subpages[activeSubpageIdx] || subpages[0] || { id: "sub_1", title: "Основной материал", content: "" };

  const activeCompositeTitle = useMemo(() => {
    return buildCompositeSubpageTitle({
      companyName: project?.companyName,
      vacancyTitle: project?.roleName || (project as any)?.title,
      subpageIdx: activeSubpageIdx,
      totalSubpages: subpages.length,
    });
  }, [project?.companyName, project?.roleName, (project as any)?.title, activeSubpageIdx, subpages.length]);

  const updateActiveSubpage = (patch: Partial<TrainingSubpage>) => {
    setSubpages((prev) =>
      prev.map((p, idx) => (idx === activeSubpageIdx ? { ...p, ...patch } : p))
    );
  };

  const insertIntoActiveSubpage = (textToInsert: string) => {
    const current = activeSubpage.content || "";
    const updated = current ? `${current}\n${textToInsert}` : textToInsert;
    updateActiveSubpage({ content: updated });
  };

  const addSubpage = () => {
    const newIdx = subpages.length;
    const newTitle = buildCompositeSubpageTitle({
      companyName: project?.companyName,
      vacancyTitle: project?.roleName || (project as any)?.title,
      subpageIdx: newIdx,
      totalSubpages: newIdx + 1,
    });
    const newSubpage: TrainingSubpage = {
      id: `sub_${Date.now()}`,
      title: newTitle,
      content: "",
    };
    setSubpages((prev) => [...prev, newSubpage]);
    setActiveSubpageIdx(newIdx);
    setPreviewSubpageIdx(newIdx);
    toast.success(`Создана подстраница «${newTitle}»`);
  };

  const removeSubpage = (idxToRemove: number) => {
    if (subpages.length <= 1) {
      toast.error("Система обучения должна содержать как минимум одну подстраницу.");
      return;
    }
    const target = subpages[idxToRemove];
    setSubpages((prev) => prev.filter((_, idx) => idx !== idxToRemove));
    setActiveSubpageIdx((prev) => (prev >= idxToRemove ? Math.max(0, prev - 1) : prev));
    setPreviewSubpageIdx(0);
    toast.success(`Подстраница «${target.title}» удалена`);
  };

  const moveSubpage = (from: number, to: number) => {
    if (to < 0 || to >= subpages.length || from === to) return;
    setSubpages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
    setActiveSubpageIdx(to);
    setPreviewSubpageIdx(to);
  };

  // Helper formatting in active subpage
  const applyMd = (prefix: string, suffix: string, defaultText = "текст") => {
    const ta = materialsRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? activeSubpage.content.length;
    const end = ta.selectionEnd ?? activeSubpage.content.length;
    const sel = activeSubpage.content.slice(start, end) || defaultText;
    const next = activeSubpage.content.slice(0, start) + prefix + sel + suffix + activeSubpage.content.slice(end);
    updateActiveSubpage({ content: next.slice(0, 30000) });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + sel.length);
    });
  };

  const applyLinePrefix = (p: string) => {
    const ta = materialsRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? activeSubpage.content.length;
    const before = activeSubpage.content.slice(0, start);
    const after = activeSubpage.content.slice(start);
    const lineStart = before.lastIndexOf("\n") + 1;
    const next = before.slice(0, lineStart) + p + before.slice(lineStart) + after;
    updateActiveSubpage({ content: next.slice(0, 30000) });
    requestAnimationFrame(() => ta.focus());
  };

  const insertEmbed = (type: "youtube" | "vk" | "rutube" | "gdoc" | "carousel") => {
    const ta = materialsRef.current;
    if (!ta) return;
    let snippet = "";
    if (type === "youtube") {
      const url = prompt("Вставьте ссылку на YouTube (например: https://www.youtube.com/watch?v=...)");
      if (!url) return;
      snippet = `\n\n${url.trim()}\n\n`;
    } else if (type === "vk") {
      const url = prompt("Вставьте ссылку на VK Video (например: https://vk.com/video-12345_67890)");
      if (!url) return;
      snippet = `\n\n${url.trim()}\n\n`;
    } else if (type === "rutube") {
      const url = prompt("Вставьте ссылку на Rutube (например: https://rutube.ru/video/...)");
      if (!url) return;
      snippet = `\n\n${url.trim()}\n\n`;
    } else if (type === "gdoc") {
      const url = prompt("Вставьте ссылку на Google Docs / Sheets / Slides");
      if (!url) return;
      snippet = `\n\n${url.trim()}\n\n`;
    } else if (type === "carousel") {
      snippet = `\n\n:::carousel title="Галерея материалов"\n![Слайд 1](https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800)\n![Слайд 2](https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800)\n:::\n\n`;
    }

    const start = ta.selectionStart ?? activeSubpage.content.length;
    const before = activeSubpage.content.slice(0, start);
    const after = activeSubpage.content.slice(start);
    const next = (before + snippet + after).slice(0, 30000);
    updateActiveSubpage({ content: next });
    requestAnimationFrame(() => ta.focus());
  };

  const callEdge = async <T,>(fn: string, body: any): Promise<T> => {
    const payload = {
      ...(body || {}),
      ...(typeof window !== "undefined" && (window as any).__RR_FORCE_PROMAX ? { use_promax: true } : {}),
    };
    const { data: { session } } = await dbClient.auth.getSession();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };

    try {
      const localRes = await fetch(`/api/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (localRes.status !== 404) {
        const localJson = await localRes.json().catch(() => ({}));
        if (!localRes.ok || (localJson as any)?.error) {
          const e: any = new Error((localJson as any)?.error || `http_${localRes.status}`);
          e.jobId = (localJson as any)?.job_id || null;
          e.fallbackAvailable = !!(localJson as any)?.fallback_available;
          throw e;
        }
        return localJson as T;
      }
    } catch (localErr: any) {
      if (localErr?.message && !String(localErr.message).includes("Failed to fetch")) {
        throw localErr;
      }
    }

    const res = await fetch(FN(fn), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json as any)?.error) {
      const e: any = new Error((json as any)?.error || `http_${res.status}`);
      e.jobId = (json as any)?.job_id || null;
      e.fallbackAvailable = !!(json as any)?.fallback_available;
      throw e;
    }
    return json as T;
  };

  const generateMaterial = async () => {
    if (!project) return;
    setBusyMaterial(true);
    try {
      const r = await aiWaitRun({
        title: `ИИ оформляет подстраницу «${activeSubpage.title}»`,
        theme: activeCompanyTheme,
        task: (attempt) => {
          const effEmpId = resolveActiveEmployerId({ employer_id: employerId, ...(project || {}) });
          return callEdge<{ text: string }>("ai-generate-stage-material", {
            project_id: project.id,
            employer_id: effEmpId,
            employer_public_id: effEmpId,
            stage,
            source_text: subpageSourceText || activeSubpage.content || undefined,
            context_keys: contextKeys,
            wishes: wishesMaterial || undefined,
            use_promax: attempt > 0,
          });
        },
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data: any) => {
            if (data?.text) {
              updateActiveSubpage({ content: data.text });
              addAuditEvent("success", "Робот Рекрутер", "Материал сгенерирован резервной моделью");
              toast.success("Подстраница успешно оформлена ИИ");
            }
          },
        },
      });
      if (!r) return;
      if (r.text) {
        updateActiveSubpage({ content: r.text });
        addAuditEvent("success", "Материал сгенерирован ИИ", `${stage} • ${activeSubpage.title}`);
        toast.success("Материал успешно сгенерирован и структурирован ИИ");
      }
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка генерации материала", e?.message || "");
      toast.error(e?.message || "Не удалось сгенерировать материал");
    } finally {
      setBusyMaterial(false);
    }
  };

  const saveMaterials = async (silent = false) => {
    if (!project) return;
    setSaving(true);
    try {
      const stageTitle = STAGES.find((s) => s.key === stage)!.title;
      const serialized = serializeSubpages(subpages);
      let currentBlockId = block?.id;

      // 1. Persist to Express / ProTalk PG training_blocks table for durability
      let savedBlock: any = null;
      try {
        const sqlRes = await fetch("/api/training-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: currentBlockId,
            project_id: project.id,
            public_id: (project as any).public_id || (project as any).publicId || project.id,
            stage,
            title: stageTitle,
            materials_md: serialized,
            content: serialized,
            subpages_json: subpages,
            pass_score: test.pass_score || (block as any)?.pass_score || 70,
          }),
        });
        if (sqlRes.ok) {
          savedBlock = await sqlRes.json();
          if (savedBlock?.id) {
            currentBlockId = savedBlock.id;
            setBlock(savedBlock);
          }
        }
      } catch (sqlErr) {
        console.warn("[TrainingWizard] ProTalk PG training-blocks sync warning:", sqlErr);
      }

      // 2. Also sync to database if accessible
      try {
        if (block?.id) {
          await dbClient.from("training_blocks").update({ materials_md: serialized, title: stageTitle }).eq("id", block.id);
        } else {
          const { data, error } = await dbClient
            .from("training_blocks")
            .insert({
              project_id: project.id,
              stage,
              block_key: stage,
              title: stageTitle,
              materials_md: serialized,
              pass_score: test.pass_score || (block as any)?.pass_score || 70,
            })
            .select("*")
            .single();
          if (data && !savedBlock) {
            setBlock(data as any);
          }
        }
      } catch (sbErr) {
        console.warn("[TrainingWizard] database training_blocks sync:", sbErr);
      }

      // Check if user chose to publish current subpage to the blog
      if (publishSubpageToBlog && activeSubpage?.content?.trim()) {
        try {
          const postTitle = activeSubpage.title?.trim() || `${stageTitle} • Учебный материал`;
          const imgMatch = activeSubpage.content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
          const coverUrl = imgMatch ? imgMatch[1] : null;
          const cleanExcerpt = cleanArticleExcerpt(activeSubpage.content, 250);

          const postRes = await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: postTitle,
              content_md: activeSubpage.content,
              cover_url: coverUrl,
              excerpt: cleanExcerpt,
              is_published: true,
            }),
          });
          const postData = await postRes.json();
          if (postRes.ok && (postData?.public_id || postData?.id)) {
            const pubId = postData.public_id || postData.id;
            toast.success(`Подстраница «${postTitle}» также опубликована в блоге: /blog/post${pubId}`);
          }
        } catch (postErr) {
          console.error("[TrainingWizard] Error publishing subpage to blog:", postErr);
        }
      }

      setHasSavedMaterials(true);
      if (!silent) {
        addAuditEvent("success", "Материалы сохранены", `Этап: ${stage}, подстраниц: ${subpages.length}`);
        setSavedFlashMaterial(true);
        setTimeout(() => setSavedFlashMaterial(false), 2200);
        toast.success("Все подстраницы обучения успешно сохранены в базе данных ProTalk");
        try {
          refreshProjects?.();
        } catch {}
      }
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка сохранения", e?.message || "");
      toast.error("Ошибка при сохранении материалов");
    } finally {
      setSaving(false);
    }
  };

  const generateTest = async () => {
    if (!project) return;
    setBusyTest(true);
    try {
      // 1. Ensure latest materials across ALL subpages are saved to the DB
      await saveMaterials(true);

      // 2. Extract plain text strictly from all subpages of this stage
      const allSubpagesText = getAllSubpagesPlainText(subpages);

      const r = await aiWaitRun({
        title: "Генерация теста по всем подстраницам",
        theme: activeCompanyTheme,
        task: async (attempt) => {
          const storedEmpId = resolveActiveEmployerId({ employer_id: employerId, ...(project || {}) });

          const res = await fetch("/api/generate-stage-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.id,
              stage,
              employer_id: storedEmpId,
              employer_public_id: storedEmpId,
              context_keys: contextKeys,
              wishes: wishesTest || undefined,
              materials_text: allSubpagesText,
              pass_score: test.pass_score > 0 ? test.pass_score : undefined,
              use_promax: attempt > 0,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || json.error) {
            throw new Error(json.error || `HTTP ${res.status}`);
          }
          return json as {
            ok: boolean;
            id?: string;
            count: number;
            total_score: number;
            pass_score: number;
            questions: QuestionRow[];
          };
        },
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data: any) => {
            const rawQs = data?.questions || data?.questions_json;
            const normalized = normalizeQuestionsList(rawQs);
            if (normalized.length > 0) {
              setTest({
                id: data.id,
                questions: normalized,
                pass_score: (Number(data.pass_score) > 0 ? Number(data.pass_score) : test.pass_score) || 70,
                total_score: data.total_score || normalized.reduce((s, q) => s + (q.points || 5), 0) || 100,
                shuffle: true,
              });
              setHasSavedTest(true);
              addAuditEvent("success", "Робот Рекрутер", "Тест сгенерирован резервной моделью");
              toast.success("Тест успешно сформирован и сохранён в базе данных");
            }
          },
        },
      });
      if (!r) return;

      if (r.questions && Array.isArray(r.questions) && r.questions.length > 0) {
        const normalized = normalizeQuestionsList(r.questions);
        const effPassScore = (Number(r.pass_score) > 0 ? Number(r.pass_score) : test.pass_score) || 70;
        setTest({
          id: r.id,
          questions: normalized,
          pass_score: effPassScore,
          total_score: r.total_score || normalized.reduce((s, q) => s + (q.points || 5), 0) || 100,
          shuffle: true,
        });
        setHasSavedTest(true);

        // Immediate sync to database so both API and database are consistent
        try {
          await (dbClient as any).from("training_stage_tests").upsert({
            id: r.id || `tst-${project.id}-${stage}`,
            project_id: project.id,
            stage,
            questions: normalized,
            pass_score: effPassScore,
            total_score: r.total_score || 100,
            shuffle_questions: true,
            updated_at: new Date().toISOString(),
          });
        } catch (sbErr) {
          console.warn("[TrainingWizard] database sync after generation notice:", sbErr);
        }
      } else {
        const resp = await fetch(`/api/training-tests?project_id=${encodeURIComponent(project.id)}&stage=${encodeURIComponent(stage)}`);
        if (resp.ok) {
          const t = await resp.json();
          if (t) {
            const parsed = normalizeQuestionsList(t.questions || t.questions_json);
            setTest({
              id: t.id,
              questions: parsed,
              pass_score: t.pass_score || 70,
              total_score: t.total_score || parsed.reduce((s, q) => s + (q.points || 5), 0) || 100,
              shuffle: t.shuffle_questions !== 0,
            });
            if (parsed.length > 0) {
              setHasSavedTest(true);
            }
          }
        }
      }
      addAuditEvent("success", "Тест сгенерирован ИИ", `${stage}: ${r.count || r.questions?.length || 20} вопросов`);
      toast.success(`Тест успешно сформирован и сохранён в базе данных (${r.count || r.questions?.length || 20} вопросов)`);
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка генерации теста", e?.message || "");
      toast.error(e?.message || "Не удалось сгенерировать тест");
    } finally {
      setBusyTest(false);
    }
  };

  const saveTest = async () => {
    if (!project || !test.questions.length) return;
    setSaving(true);
    try {
      const total = test.questions.reduce((s, q) => s + (q.points || 5), 0);
      let savedId = test.id;
      if (test.id) {
        await (dbClient as any).from("training_stage_tests").update({
          questions: test.questions,
          pass_score: test.pass_score,
          total_score: total,
          shuffle_questions: test.shuffle,
        }).eq("id", test.id);
      } else {
        const { data, error } = await (dbClient as any).from("training_stage_tests").insert({
          project_id: project.id,
          stage,
          questions: test.questions,
          pass_score: test.pass_score,
          total_score: total,
          shuffle_questions: test.shuffle,
        }).select("*").single();
        if (error) throw error;
        savedId = (data as any)?.id;
        setTest((t) => ({ ...t, id: savedId, total_score: total }));
      }

      // Sync to ProTalk PG on the server to prevent data loss across restarts
      try {
        await fetch("/api/training-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: savedId,
            project_id: project.id,
            stage,
            questions: test.questions,
            pass_score: test.pass_score,
            total_score: total,
            shuffle_questions: test.shuffle,
          }),
        });
      } catch (sqlSyncErr) {
        console.warn("[TrainingWizard] ProTalk PG sync notice:", sqlSyncErr);
      }

      setHasSavedTest(true);
      addAuditEvent("success", "Тест сохранён", `${test.questions.length} вопросов, проходной ${test.pass_score}`);
      setSavedFlashTest(true);
      setTimeout(() => setSavedFlashTest(false), 2200);
      toast.success("Тест успешно сохранён в базе данных");
    } catch (e: any) {
      addAuditEvent("warning", "Ошибка сохранения теста", e?.message || "");
      toast.error("Не удалось сохранить тест");
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (i: number, patch: Partial<QuestionRow>) => {
    setTest((t) => ({
      ...t,
      questions: t.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    }));
  };

  const changeQuestionKind = (qi: number, newKind: QuestionKind) => {
    setTest((t) => ({
      ...t,
      questions: t.questions.map((q, idx) => {
        if (idx !== qi) return q;
        let options = q.options;
        if (newKind === "choice" || newKind === "multichoice") {
          if (!options || options.length === 0) {
            options = [
              { text: "Вариант ответа #1", is_correct: true },
              { text: "Вариант ответа #2", is_correct: false },
              { text: "Вариант ответа #3", is_correct: false },
              { text: "Вариант ответа #4", is_correct: false },
            ];
          }
        } else {
          options = null;
        }
        return {
          ...q,
          kind: newKind,
          options,
        };
      }),
    }));
  };

  const updateChoiceOption = (qi: number, oi: number, text: string, correct?: boolean) => {
    setTest((t) => ({
      ...t,
      questions: t.questions.map((q, idx) => {
        if (idx !== qi) return q;
        const options = (q.options || []).map((o, j) =>
          j === oi
            ? { text, is_correct: correct ?? o.is_correct }
            : (correct === true && q.kind === "choice" ? { ...o, is_correct: false } : o)
        );
        const correctText = options.find((o) => o.is_correct)?.text || (typeof q.correct === "string" ? q.correct : "");
        const correctList = options.filter((o) => o.is_correct).map((o) => o.text);
        return { ...q, options, correct: q.kind === "multichoice" ? correctList : correctText };
      }),
    }));
  };

  const toggleMultichoiceOptionCorrect = (qi: number, oi: number) => {
    setTest((t) => ({
      ...t,
      questions: t.questions.map((q, idx) => {
        if (idx !== qi) return q;
        const options = (q.options || []).map((o, j) =>
          j === oi ? { ...o, is_correct: !o.is_correct } : o
        );
        const correctList = options.filter((o) => o.is_correct).map((o) => o.text);
        return { ...q, options, correct: correctList };
      }),
    }));
  };

  const addOptionToQuestion = (qi: number) => {
    setTest((t) => ({
      ...t,
      questions: t.questions.map((q, idx) => {
        if (idx !== qi) return q;
        const opts = q.options || [];
        return {
          ...q,
          options: [...opts, { text: `Вариант ответа #${opts.length + 1}`, is_correct: false }],
        };
      }),
    }));
  };

  const removeOptionFromQuestion = (qi: number, oi: number) => {
    setTest((t) => ({
      ...t,
      questions: t.questions.map((q, idx) => {
        if (idx !== qi) return q;
        const options = (q.options || []).filter((_, j) => j !== oi);
        const correctList = options.filter((o) => o.is_correct).map((o) => o.text);
        return { ...q, options, correct: q.kind === "multichoice" ? correctList : (options[0]?.text || "") };
      }),
    }));
  };

  const addQuestionWithKind = (kind: QuestionKind) => {
    if (test.questions.length >= MAX_QUESTIONS) return;
    const newId = `q${Date.now()}`;
    let newQ: QuestionRow;
    if (kind === "choice") {
      newQ = {
        id: newId,
        kind: "choice",
        question: "",
        options: [
          { text: "Вариант 1", is_correct: true },
          { text: "Вариант 2", is_correct: false },
          { text: "Вариант 3", is_correct: false },
          { text: "Вариант 4", is_correct: false },
        ],
        correct: "Вариант 1",
        points: 5,
      };
    } else if (kind === "multichoice") {
      newQ = {
        id: newId,
        kind: "multichoice",
        question: "",
        options: [
          { text: "Вариант 1 (правильный)", is_correct: true },
          { text: "Вариант 2 (правильный)", is_correct: true },
          { text: "Вариант 3", is_correct: false },
          { text: "Вариант 4", is_correct: false },
        ],
        correct: ["Вариант 1 (правильный)", "Вариант 2 (правильный)"],
        points: 5,
      };
    } else if (kind === "string") {
      newQ = {
        id: newId,
        kind: "string",
        question: "",
        expected_answer: "",
        points: 5,
      };
    } else {
      newQ = {
        id: newId,
        kind: "paragraph",
        question: "",
        expected_answer: "",
        points: 5,
      };
    }
    const nextQuestions = [...test.questions, newQ];
    const point = Number((100 / nextQuestions.length).toFixed(2));
    setTest((t) => ({
      ...t,
      questions: nextQuestions.map((q) => ({ ...q, points: point })),
      total_score: 100,
    }));
  };

  // Employer Exam Preview Methods
  const getExamPreviewMultichoice = (qId: string): string[] => {
    const raw = examPreviewAnswers[qId];
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const toggleExamPreviewMultichoice = (qId: string, optText: string) => {
    const current = getExamPreviewMultichoice(qId);
    const next = current.includes(optText)
      ? current.filter((t) => t !== optText)
      : [...current, optText];
    setExamPreviewAnswers((a) => ({ ...a, [qId]: JSON.stringify(next) }));
  };

  const submitExamPreview = async () => {
    if (!project) return;
    setExamPreviewChecking(true);
    try {
      const questionsToGrade = test.questions.length > 0 ? test.questions : [];
      if (!questionsToGrade.length) {
        toast.error("В тесте пока нет вопросов для проверки");
        return;
      }
      const payload = questionsToGrade.map((q) => ({
        question_id: q.id,
        value: examPreviewAnswers[q.id] || "",
      }));

      const storedEmpId = resolveActiveEmployerId({ employer_id: employerId, ...(project || {}) });

      const r = await aiWaitRun<any>({
        title: "Проверка ответов аттестации (предпоказ)",
        theme: activeCompanyTheme,
        task: (attempt) =>
          callEdge<any>("ai-grade-training-quiz", {
            project_id: project.id,
            stage,
            answers: payload,
            questions: questionsToGrade,
            pass_score: test.pass_score || 70,
            total_score: test.total_score || 100,
            is_preview: true,
            employer_id: storedEmpId,
            employer_public_id: storedEmpId,
            use_promax: attempt > 0,
          }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data: any) => {
            if (data) {
              setExamPreviewResult({
                score: data.score || 0,
                passed: Boolean(data.passed),
                per_question: data.per_question || [],
                candidate_summary: data.candidate_summary || null,
              });
            }
          },
        },
      });

      if (r) {
        setExamPreviewResult({
          score: r.score || 0,
          passed: Boolean(r.passed),
          per_question: r.per_question || [],
          candidate_summary: r.candidate_summary || null,
        });
        toast.success(`Ответы проверены. Результат: ${r.score} из ${test.total_score || 100} баллов (без списания лимитов)`);
      }
    } catch (e: any) {
      console.error("[submitExamPreview] error:", e);
      toast.error(e?.message || "Ошибка при проверке ответов");
    } finally {
      setExamPreviewChecking(false);
    }
  };

  const resetExamPreview = () => {
    setExamPreviewAnswers({});
    setExamPreviewResult(null);
  };

  // Preview active subpage
  const previewPage = subpages[previewSubpageIdx] || subpages[0] || { id: "p1", title: "", content: "" };

  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-300 hover:text-white flex items-center gap-2 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> К списку систем обучения
        </button>
      )}

      {/* Main Header Container in Apple Liquid Glass */}
      <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-transparent border border-white/20 flex items-center justify-center text-[#E7C768]">
            <GraduationCap className="w-6 h-6 text-[#E7C768]" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              {createMode ? "Создание системы обучения" : "Редактор системы обучения"}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              3 последовательных этапа обучения с разделением на подстраницы. Кандидат проходит этапы по порядку, тест каждого этапа можно перепроходить неограниченно.
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-slate-200 mb-1.5 inline-flex items-center gap-1">
            Вакансия{createMode ? " (обязательно)" : ""}:
            <FieldHelp
              section="training"
              fieldKey="project_select"
              fallbackTitle="Выбор вакансии"
              fallbackBody="Обучение всегда привязано к конкретной вакансии. ИИ берёт описание этой вакансии и компании как контекст для генерации материалов и тестов."
            />
          </label>
          <select
            value={projectId}
            disabled={lockedProject}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-transparent backdrop-blur-xl text-sm p-3 rounded-2xl border border-white/20 text-white focus:outline-none focus:border-[#E7C768] disabled:opacity-70"
          >
            <option value="" className="bg-[#17344F] text-white">— Выберите вакансию —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#17344F] text-white">
                {p.roleName || "(без названия)"} — {p.companyName || "—"}
                {createMode && existingSystems.has(p.id) ? " · уже есть система" : ""}
              </option>
            ))}
          </select>
          {createMode && projectId && existingSystems.has(projectId) && (
            <p className="text-sm text-[#E7C768] mt-2">
              Для этой вакансии уже создана система обучения. Сохранение обновит существующие материалы и тесты.
            </p>
          )}

          {projectId && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setCopyModalMode("from")}
                className="cursor-pointer bg-transparent hover:bg-white/10 border border-[#E7C768]/60 text-[#E7C768] hover:text-white font-bold text-sm py-2 px-4 rounded-2xl transition flex items-center gap-2 shadow-md active:scale-95"
                title="Скопировать блоки обучения и тесты аттестации из другой вакансии"
              >
                <Copy className="w-4 h-4 text-[#E7C768]" />
                <span>Копировать обучение из вакансии</span>
              </button>
              <button
                type="button"
                onClick={() => setCopyModalMode("to")}
                className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white hover:text-[#E7C768] font-bold text-sm py-2 px-4 rounded-2xl transition flex items-center gap-2 shadow-md active:scale-95"
                title="Скопировать текущие материалы и тесты в другую вакансию"
              >
                <Copy className="w-4 h-4 text-slate-300" />
                <span>Копировать обучение в другую вакансию</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {project && (
        <>
          {/* Stage Selector (3 stages) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STAGES.map((s) => {
              const isSelected = stage === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStage(s.key)}
                  className={`p-4 rounded-3xl text-left border transition backdrop-blur-xl cursor-pointer ${
                    isSelected
                      ? "bg-transparent border-[#E7C768] text-[#E7C768] shadow-lg shadow-[#E7C768]/10"
                      : "bg-transparent text-white border-white/20 hover:border-white/40 hover:bg-white/5"
                  }`}
                >
                  <div className="text-sm font-bold">{s.title}</div>
                  <div className="text-sm text-slate-300 opacity-90 mt-1">{s.hint}</div>
                </button>
              );
            })}
          </div>

          {/* 4 Sub-tabs Navigation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setSubTab("material")}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-sm font-bold border transition backdrop-blur-xl flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer break-words whitespace-normal text-wrap ${
                subTab === "material"
                  ? "bg-transparent border-[#E7C768] text-[#E7C768] shadow-lg"
                  : "bg-transparent border-white/20 text-white hover:border-[#E7C768]/50 hover:bg-white/5"
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span className="break-words whitespace-normal text-wrap">Учебный материал ({subpages.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!hasSavedMaterials) {
                  setSavePromptModal({ open: true, type: "material" });
                  return;
                }
                setSubTab("preview");
                setPreviewSubpageIdx(activeSubpageIdx);
              }}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-sm font-bold border transition backdrop-blur-xl flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer break-words whitespace-normal text-wrap ${
                subTab === "preview"
                  ? "bg-transparent border-[#E7C768] text-[#E7C768] shadow-lg"
                  : "bg-transparent border-white/20 text-white hover:border-[#E7C768]/50 hover:bg-white/5"
              }`}
            >
              <Eye className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span className="break-words whitespace-normal text-wrap">Предпоказ материала</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab("test")}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-sm font-bold border transition backdrop-blur-xl flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer break-words whitespace-normal text-wrap ${
                subTab === "test"
                  ? "bg-transparent border-[#E7C768] text-[#E7C768] shadow-lg"
                  : "bg-transparent border-white/20 text-white hover:border-[#E7C768]/50 hover:bg-white/5"
              }`}
            >
              <FileQuestion className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span className="break-words whitespace-normal text-wrap">Аттестация — тест ({test.questions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!hasSavedTest || !test.questions || test.questions.length === 0) {
                  setSavePromptModal({ open: true, type: "test" });
                  return;
                }
                setSubTab("test_preview");
                resetExamPreview();
              }}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-sm font-bold border transition backdrop-blur-xl flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer break-words whitespace-normal text-wrap ${
                subTab === "test_preview"
                  ? "bg-transparent border-[#E7C768] text-[#E7C768] shadow-lg"
                  : "bg-transparent border-white/20 text-white hover:border-[#E7C768]/50 hover:bg-white/5"
              }`}
            >
              <Play className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span className="break-words whitespace-normal text-wrap">Предпоказ аттестации</span>
            </button>
          </div>

          {/* TAB 1: УЧЕБНЫЙ МАТЕРИАЛ И ПОДСТРАНИЦЫ */}
          {subTab === "material" && (
            <>
              {/* Subpages Management Header */}
              <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[#E7C768]" />
                    <span className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      Подстраницы обучения ({subpages.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addSubpage}
                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold flex items-center gap-1.5 shadow-lg hover:brightness-105 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#17344F]" /> Добавить подстраницу
                  </button>
                </div>

                {/* Subpages Tabs Bar */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {subpages.map((p, idx) => {
                    const isCurrent = idx === activeSubpageIdx;
                    return (
                      <div
                        key={p.id || idx}
                        onClick={() => setActiveSubpageIdx(idx)}
                        className={`group flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition cursor-pointer ${
                          isCurrent
                            ? "bg-transparent border-[#E7C768] text-[#E7C768] shadow-lg shadow-[#E7C768]/10"
                            : "bg-transparent border-white/15 text-slate-200 hover:border-white/30 hover:bg-white/5"
                        }`}
                      >
                        <span className="text-sm font-bold">
                          {idx + 1}. {p.title || `Подстраница ${idx + 1}`}
                        </span>
                        {subpages.length > 1 && (
                          <div className="flex items-center gap-1 ml-1 opacity-60 group-hover:opacity-100">
                            {idx > 0 && (
                              <button
                                type="button"
                                title="Сдвинуть влево"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveSubpage(idx, idx - 1);
                                }}
                                className="hover:text-white p-0.5"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {idx < subpages.length - 1 && (
                              <button
                                type="button"
                                title="Сдвинуть вправо"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveSubpage(idx, idx + 1);
                                }}
                                className="hover:text-white p-0.5"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Удалить подстраницу"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeSubpage(idx);
                              }}
                              className="hover:text-[#E7C768] p-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Active Subpage Title Input with Voice Dictation and Auto-assembly button */}
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white/90">
                      Название подстраницы #{activeSubpageIdx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        updateActiveSubpage({ title: activeCompositeTitle });
                        toast.success(`Подставлено название: «${activeCompositeTitle}»`);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-xl bg-white/10 hover:bg-[#E7C768]/20 border border-white/20 hover:border-[#E7C768]/50 text-[#E7C768] transition cursor-pointer active:scale-95 shadow-sm break-words whitespace-normal text-wrap text-left"
                      title="Подставить сборное название: Профессиональное обучение от компании для вакансии"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="break-words">
                        Подставить: «{activeCompositeTitle}»
                      </span>
                    </button>
                  </div>
                  <MiniAudioField
                    label=""
                    value={activeSubpage.title}
                    onChange={(val) => updateActiveSubpage({ title: val })}
                    placeholder={`Например: ${activeCompositeTitle}`}
                    maxLength={150}
                    minRows={1}
                  />
                </div>
              </div>

              {/* Active Subpage Document Recognition System */}
              <GetDoc
                entity="training"
                entityId={project.id}
                pathPrefix={`${project.id}/${stage}/subpage_${activeSubpage.id || activeSubpageIdx + 1}`}
                rawText={subpageSourceText}
                onRawTextChange={setSubpageSourceText}
                onAppendText={(text) => {
                  const combined = activeSubpage.content
                    ? `${activeSubpage.content}\n\n${text}`
                    : text;
                  updateActiveSubpage({ content: combined.slice(0, 30000) });
                }}
                title={`Загрузка и распознавание материалов для «${activeSubpage.title}»`}
                hint="Загрузите файл (PDF, DOC, DOCX, XLS, PPT, TXT) или вставьте ссылку на Google Docs/Диск. Распознавание запустится автоматически."
                maxChars={30000}
                onAudit={addAuditEvent}
                enhanceLabel="Вставить распознанный текст в подстраницу"
                onEnhance={() => {
                  if (!subpageSourceText.trim()) {
                    toast.error("Сначала распознайте текст из документа.");
                    return;
                  }
                  const combined = activeSubpage.content
                    ? `${activeSubpage.content}\n\n${subpageSourceText}`
                    : subpageSourceText;
                  updateActiveSubpage({ content: combined.slice(0, 30000) });
                  toast.success("Распознанный текст добавлен в подстраницу!");
                }}
              />

              {/* Active Subpage Content Editor powered by ArticleConstructor */}
              <div className="space-y-4">
                <ArticleConstructor
                  title={activeSubpage.title}
                  onTitleChange={(newTitle) => updateActiveSubpage({ title: newTitle })}
                  content={activeSubpage.content}
                  onChange={(newContent) => updateActiveSubpage({ content: newContent })}
                  hideTitle={true}
                  hideCover={true}
                  hidePublishToggle={true}
                  ownerId={project?.id || "100007"}
                  placeholder="Markdown учебного материала для этой подстраницы (поддерживаются заголовки, списки, таблицы, видео и карусели картинок)..."
                  theme={activeCompanyTheme}
                  onPreview={() => {
                    if (!hasSavedMaterials) {
                      setSavePromptModal({ open: true, type: "material" });
                      return;
                    }
                    setSubTab("preview");
                    setPreviewSubpageIdx(activeSubpageIdx);
                  }}
                />

                {/* Wishes for AI Material Beautification with MiniAudioField */}
                <div className="pt-2">
                  <MiniAudioField
                    label="Пожелания к ИИ по этой подстранице (необязательно)"
                    value={wishesMaterial}
                    onChange={setWishesMaterial}
                    placeholder="Например: Добавь практические примеры, сделай наглядные таблицы, выдели важные правила..."
                    maxLength={1000}
                    minRows={2}
                  />
                </div>

                {/* Context Sources Box - Relocated between wishes and AI button with MiniAudioField */}
                <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                        Источники контекста для ИИ
                      </div>
                      <p className="text-sm text-slate-300">
                        Отметьте блоки, передаваемые ИИ для «{STAGES.find((s) => s.key === stage)?.title}». Содержимое сохраняется в вакансии.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={saveContextValues}
                      disabled={contextSaving || !Object.values(contextDirty).some(Boolean)}
                      className="text-sm px-4 py-2 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold flex items-center gap-2 disabled:opacity-40 shadow-lg cursor-pointer"
                    >
                      {contextSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Сохранить контекст в БД
                    </button>
                  </div>

                  <div className="space-y-3">
                    {CONTEXT_OPTIONS.map((opt) => {
                      const checked = contextKeys.includes(opt.key);
                      const isOpen = contextExpanded[opt.key] ?? false;
                      const dirty = !!contextDirty[opt.key];
                      const val = contextValues[opt.key] || "";
                      return (
                        <div
                          key={opt.key}
                          className={`rounded-2xl border backdrop-blur-xl transition ${
                            dirty
                              ? "border-[#E7C768] bg-transparent"
                              : "border-white/15 bg-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between px-4 py-3 gap-3">
                            <button
                              type="button"
                              onClick={() => setContextExpanded((e) => ({ ...e, [opt.key]: !isOpen }))}
                              className="flex-1 flex items-center justify-between text-left cursor-pointer"
                            >
                              <span className="text-sm font-bold text-white flex items-center gap-2">
                                {opt.label}
                                {dirty && <span className="text-sm text-[#E7C768]">● изменено</span>}
                              </span>
                              <span className="flex items-center gap-2 text-sm text-slate-300">
                                <span>{val.length} / {CONTEXT_MAX}</span>
                                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>
                            </button>
                            <label
                              title={checked ? "Передавать ИИ" : "Не передавать ИИ"}
                              className={`shrink-0 w-7 h-7 rounded-xl border flex items-center justify-center cursor-pointer transition ${
                                checked
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] border-[#E7C768]"
                                  : "bg-transparent border-white/20 hover:border-white/40"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleContextKey(opt.key)}
                                className="hidden"
                              />
                              {checked && <Check className="w-4 h-4 text-[#17344F] stroke-[3]" />}
                            </label>
                          </div>
                          {isOpen && (
                            <div className="px-4 pb-4 pt-1">
                              <MiniAudioField
                                label={opt.label}
                                value={val}
                                onChange={(newVal) => {
                                  setContextValues((s) => ({ ...s, [opt.key]: newVal }));
                                  setContextDirty((d) => ({ ...d, [opt.key]: true }));
                                }}
                                placeholder={`Текст блока «${opt.label}» (передаётся ИИ, если галочка активна)...`}
                                maxLength={CONTEXT_MAX}
                                minRows={3}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Material Generation Button */}
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={generateMaterial}
                    disabled={busyMaterial}
                    className="px-6 py-3 text-sm flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow-xl hover:brightness-105 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    {busyMaterial ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Оформляем подстраницу ИИ…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-[#17344F]" /> Оформить подстраницу через ИИ
                      </>
                    )}
                  </button>
                </div>
                {busyMaterial && <LoadingPhrase entity="training" />}

                {/* Save Materials Footer */}
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10 flex-wrap">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm text-slate-300">
                      Всего подстраниц: {subpages.length} • Суммарно символов: {getAllSubpagesPlainText(subpages).length}
                    </span>

                    {/* Checkbox button to publish current subpage as a public blog post */}
                    <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-white/20 bg-transparent backdrop-blur-md cursor-pointer hover:border-[#E7C768]/60 transition text-sm text-white select-none">
                      <input
                        type="checkbox"
                        checked={publishSubpageToBlog}
                        onChange={(e) => setPublishSubpageToBlog(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#E7C768] cursor-pointer"
                      />
                      <BookOpen className="w-4 h-4 text-[#E7C768]" />
                      <span>Опубликовать текущую подстраницу в блог</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    {saving && (
                      <span className="flex items-center gap-2 text-[#E7C768] text-sm animate-pulse">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#E7C768]" /> Сохранение в базу данных…
                      </span>
                    )}
                    {savedFlashMaterial && !saving && (
                      <span className="flex items-center gap-1.5 text-white text-sm">
                        <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено в БД
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => saveMaterials(false)}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold hover:brightness-105 transition disabled:opacity-50 flex items-center gap-2 shadow-lg cursor-pointer"
                    >
                      <Save className="w-4 h-4 text-[#17344F]" /> Сохранить все материалы
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: ПРЕДПОКАЗ ОБУЧАЮЩЕЙ СТРАНИЦЫ (Live Candidate Preview) */}
          {subTab === "preview" && (
            <div className="space-y-4">
              {/* Preview Controls Bar */}
              <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-4 sm:p-5 shadow-xl flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      Интерактивный предпоказ страницы кандидата
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full border border-white/20 bg-white/5 text-sm text-slate-300 font-medium">
                      {isThemeMonochrome ? "Черно-белый стиль компании" : "Фирменный стиль компании"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">
                    Точное отображение в личном кабинете кандидата с учётом всех настроек стиля компании (шрифты, цвета, прозрачности, кнопки, фильтры логотипа и фона).
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Device Viewport Selector */}
                  <div className="flex items-center bg-black/40 border border-white/15 rounded-2xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("desktop")}
                      title="Десктоп (100% ширина)"
                      className={`p-2 rounded-xl transition cursor-pointer text-sm flex items-center gap-1.5 ${
                        previewDevice === "desktop"
                          ? "bg-white/20 text-white font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Monitor className="w-4 h-4" />
                      <span className="hidden sm:inline">ПК</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("tablet")}
                      title="Планшет (768px)"
                      className={`p-2 rounded-xl transition cursor-pointer text-sm flex items-center gap-1.5 ${
                        previewDevice === "tablet"
                          ? "bg-white/20 text-white font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Tablet className="w-4 h-4" />
                      <span className="hidden sm:inline">Планшет</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("mobile")}
                      title="Мобильный телефон (390px)"
                      className={`p-2 rounded-xl transition cursor-pointer text-sm flex items-center gap-1.5 ${
                        previewDevice === "mobile"
                          ? "bg-white/20 text-white font-bold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span className="hidden sm:inline">Телефон</span>
                    </button>
                  </div>

                  {/* Fullscreen Toggle */}
                  <button
                    type="button"
                    onClick={() => setPreviewFullscreen((f) => !f)}
                    title={previewFullscreen ? "Свернуть" : "Во весь экран"}
                    className="p-2.5 rounded-2xl border border-white/20 bg-transparent hover:bg-white/5 text-white transition cursor-pointer"
                  >
                    {previewFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-[#E7C768]" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-[#E7C768]" />
                    )}
                  </button>

                  {/* Return to Editing */}
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFullscreen(false);
                      setSubTab("material");
                    }}
                    className="px-4 py-2 rounded-2xl border border-white/20 bg-transparent hover:bg-white/5 text-sm font-bold text-white flex items-center gap-2 transition cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 text-[#E7C768]" />
                    <span>Редактировать</span>
                  </button>
                </div>
              </div>

              {/* The Frame Container (embedded or full screen overlay) */}
              <div
                className={
                  previewFullscreen
                    ? "fixed inset-0 z-50 bg-black/95 backdrop-blur-md overflow-y-auto p-3 sm:p-6 flex flex-col items-center"
                    : "w-full"
                }
              >
                {previewFullscreen && (
                  <div className="w-full max-w-5xl flex items-center justify-between pb-3 text-white">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Eye className="w-4 h-4 text-[#E7C768]" /> Полноэкранный просмотр кабинета кандидата
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewFullscreen(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Minimize2 className="w-3.5 h-3.5" /> Выйти из полноэкранного режима
                    </button>
                  </div>
                )}

                {/* Outer Window Chrome Frame */}
                <div
                  className="transition-all duration-300 shadow-2xl rounded-2xl md:rounded-3xl border border-white/20 [overflow-x:clip]"
                  style={{
                    maxWidth:
                      previewDevice === "mobile"
                        ? "390px"
                        : previewDevice === "tablet"
                          ? "768px"
                          : "100%",
                    width: "100%",
                    margin: "0 auto",
                  }}
                >
                  {/* Browser Window Header Chrome */}
                  <div className="bg-[#0B0F19] border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-3 select-none text-sm rounded-t-2xl md:rounded-t-3xl">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#EF4444] inline-block shadow-sm" />
                      <span className="w-3 h-3 rounded-full bg-[#F59E0B] inline-block shadow-sm" />
                      <span className="w-3 h-3 rounded-full bg-[#10B981] inline-block shadow-sm" />
                      <span className="ml-2 text-slate-400 font-medium hidden sm:inline text-sm">
                        Личный кабинет кандидата • Обучение
                      </span>
                    </div>
                    <div className="flex-1 max-w-sm mx-auto bg-black/50 border border-white/10 rounded-lg px-3 py-1 text-slate-300 text-center font-mono text-sm truncate">
                      🔒 /{project?.companySlug || (project as any)?.company_slug || "company"}/candidate/training
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                      <span className="hidden md:inline px-2 py-0.5 rounded bg-white/5 border border-white/10 text-sm">
                        {isThemeMonochrome ? "Черно-белый стиль" : "Фирменный стиль"}
                      </span>
                    </div>
                  </div>

                  {/* Simulated Candidate Page Canvas - COMPLETELY OPAQUE SOLID BACKGROUND */}
                  <div
                    id="company-landing-root"
                    className="company-landing-root training-preview-root candidate-training-root relative min-h-screen px-[2%] py-3.5 sm:px-5 sm:py-5 md:p-8 space-y-4 sm:space-y-6 text-left transition-colors w-full max-w-full [overflow-x:clip] rounded-b-2xl md:rounded-b-3xl"
                    style={{
                      backgroundColor: previewPageBg,
                      color: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                      fontFamily: activeCompanyTheme?.fontFamily || undefined,
                    }}
                  >
                    {/* Dynamic Company Theme CSS Rules */}
                    {activeCompanyTheme && (
                      <style>{buildThemeCss(activeCompanyTheme)}</style>
                    )}

                    {/* Fixed-to-screen Background Animation Canvas & Media following scroll */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                      {activeCompanyTheme?.pageBgImageUrl && (
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${activeCompanyTheme.pageBgImageUrl})`,
                            filter: isThemeMonochrome ? "grayscale(100%)" : undefined,
                          }}
                        />
                      )}
                      <InteractiveLandingBackground
                        containerMode
                        showBadges={false}
                        showSphere={Boolean(activeCompanyTheme?.showSphereAnimation ?? activeCompanyTheme?.showSphere)}
                        showWaves={(activeCompanyTheme?.showWaveAnimation ?? activeCompanyTheme?.showWaves) !== false}
                        themeColors={{
                          headingColor: activeCompanyTheme?.headingsSolidColor || "#FFFFFF",
                          bodyTextColor: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                          boldTextColor: activeCompanyTheme?.boldTextColor || "#FFFFFF",
                          iconColor: activeCompanyTheme?.iconColor || "#FFFFFF",
                          headingsColorMode: activeCompanyTheme?.headingsColorMode || "solid",
                          isMonochrome: isThemeMonochrome,
                        }}
                      />
                      {activeCompanyTheme?.pageBgFilterOpacity ? (
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundColor: hexToRgba(
                              activeCompanyTheme.pageBgFilterColor || "#000000",
                              activeCompanyTheme.pageBgFilterOpacity
                            ),
                          }}
                        />
                      ) : null}
                    </div>

                    {/* Content Layer (elevated above background animation) */}
                    <div className="relative z-10 space-y-4 sm:space-y-5">
                      {/* 1. Progress Header Card */}
                      <div
                        className="section-card liquid-glass-card px-[2%] py-3 sm:px-4 sm:py-4 md:p-6 space-y-3 sm:space-y-4 shadow-xl border transition-all w-full"
                        style={previewCardBoxStyle}
                      >
                        <div className="flex items-center gap-3 mb-2 flex-wrap sm:flex-nowrap">
                          <CompanyThemedLogo
                            logoUrl={(project as any).companyLogoUrl || (project as any).logo_url}
                            companyName={project.companyName}
                            theme={activeCompanyTheme}
                            size="md"
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h2
                              className="text-sm sm:text-base md:text-lg font-bold truncate break-words"
                              style={previewHeadingStyle}
                            >
                              Курс обучения — 3 этапа
                            </h2>
                            <p
                              className="text-sm line-clamp-2 break-words"
                              style={{ color: activeCompanyTheme?.bodyTextColor || "#CBD5E1" }}
                            >
                              Этапы открываются по очереди. Тест каждого можно перепроходить неограниченно — пока не наберёте {test.questions.length > 0 ? (test.pass_score || 70) : 100} баллов.
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className="text-base sm:text-lg md:text-xl font-bold"
                              style={{ color: activeCompanyTheme?.boldTextColor || "#FFFFFF" }}
                            >
                              {stage === "professional" ? "33%" : stage === "product" ? "66%" : "100%"}
                            </div>
                            <div className="text-sm text-slate-400">прогресс</div>
                          </div>
                        </div>

                        {/* 3 stages switchers */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {STAGES.map((s) => {
                            const isCurrent = s.key === stage;
                            const btnTextColor = isCurrent
                              ? (activeCompanyTheme?.btnActiveTextColor || "#000000")
                              : (activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF");
                            return (
                              <button
                                key={s.key}
                                type="button"
                                onClick={() => setStage(s.key)}
                                className="p-2 sm:p-2.5 md:p-3 text-left border transition cursor-pointer flex flex-col justify-between gap-1 shadow-sm break-words whitespace-normal text-wrap"
                                style={{
                                  ...(isCurrent ? previewActiveBtnStyle : previewInactiveBtnStyle),
                                  color: btnTextColor,
                                }}
                              >
                                <div
                                  className="flex items-center justify-between text-sm font-bold leading-tight break-words whitespace-normal text-wrap"
                                  style={{ color: btnTextColor }}
                                >
                                  <span className="break-words whitespace-normal text-wrap" style={{ color: btnTextColor }}>{s.title}</span>
                                  {isCurrent && <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: btnTextColor }} />}
                                </div>
                                <div
                                  className="text-sm opacity-80 break-words whitespace-normal text-wrap"
                                  style={{ color: btnTextColor }}
                                >
                                  {isCurrent ? "Текущий раздел" : "Включён в курс"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Subpages Navigation (if multiple subpages) */}
                      {subpages.length > 1 && (
                        <div
                          className="section-card liquid-glass-card px-[2%] py-2.5 sm:px-4 sm:py-3.5 space-y-2.5 sm:space-y-3 shadow-xl border transition-all w-full"
                          style={previewCardBoxStyle}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <BookOpen
                                className="w-4 h-4 shrink-0"
                                style={{ color: activeCompanyTheme?.iconColor || "#FFFFFF" }}
                              />
                              <span className="text-sm font-bold truncate" style={previewHeadingStyle}>
                                Подстраницы обучения
                              </span>
                            </div>
                            <span
                              className="text-sm font-semibold border px-2.5 py-1 rounded-xl"
                              style={{
                                color: activeCompanyTheme?.bodyTextColor || "#CBD5E1",
                                borderColor: previewCardBoxStyle.borderColor,
                              }}
                            >
                              Подстраница {previewSubpageIdx + 1} из {subpages.length}
                            </span>
                          </div>

                          {/* Mobile-friendly vertical stack / wrap buttons without horizontal scroll */}
                          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                            {subpages.map((p, pIdx) => {
                              const isCurrent = pIdx === previewSubpageIdx;
                              const btnTextColor = isCurrent
                                ? (activeCompanyTheme?.btnActiveTextColor || "#000000")
                                : (activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF");
                              return (
                                <button
                                  key={p.id || pIdx}
                                  type="button"
                                  onClick={() => setPreviewSubpageIdx(pIdx)}
                                  className="px-3 py-2 text-sm font-bold border transition text-left cursor-pointer shadow-md break-words whitespace-normal text-wrap leading-snug"
                                  style={{
                                    ...(isCurrent ? previewActiveBtnStyle : previewInactiveBtnStyle),
                                    color: btnTextColor,
                                  }}
                                >
                                  <span className="break-words whitespace-normal text-wrap" style={{ color: btnTextColor }}>
                                    {pIdx + 1}. {p.title || `Подстраница ${pIdx + 1}`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 3. Live Training Material Card */}
                      <RichTrainingMaterialCard
                        title={`${STAGES.find((s) => s.key === stage)?.title || ""}${
                          subpages.length > 1 && previewPage.title ? ` • ${previewPage.title}` : ""
                        }`}
                        companyName={project.companyName}
                        theme={activeCompanyTheme}
                        logoUrl={(project as any).companyLogoUrl || (project as any).logo_url}
                      >
                        {previewPage.content || "_Материал этой подстраницы ещё не заполнен._"}
                      </RichTrainingMaterialCard>

                      {/* 4. Subpages Bottom Navigation Bar */}
                      <div className="flex items-center justify-between gap-2.5 flex-wrap pt-1">
                        {subpages.length > 1 ? (
                          <>
                            <button
                              type="button"
                              disabled={previewSubpageIdx === 0}
                              onClick={() => setPreviewSubpageIdx((i) => Math.max(0, i - 1))}
                              className="landing-btn-inactive px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold flex items-center gap-1.5 border transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer break-words whitespace-normal text-wrap shadow-sm"
                              style={{
                                ...previewInactiveBtnStyle,
                                color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                WebkitTextFillColor: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                              }}
                            >
                              <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF", stroke: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF" }} />
                              <span className="break-words" style={{ color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF", WebkitTextFillColor: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF" }}>Предыдущая подстраница</span>
                            </button>

                            <span
                              className="text-sm font-medium"
                              style={{ color: activeCompanyTheme?.bodyTextColor || "#CBD5E1" }}
                            >
                              {previewSubpageIdx + 1} из {subpages.length}
                            </span>

                            {previewSubpageIdx < subpages.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => setPreviewSubpageIdx((i) => Math.min(subpages.length - 1, i + 1))}
                                className="landing-btn-active px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold flex items-center gap-1.5 border transition cursor-pointer break-words whitespace-normal text-wrap shadow-md"
                                style={{
                                  ...previewActiveBtnStyle,
                                  color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                }}
                              >
                                <span
                                  className="break-words font-bold"
                                  style={{
                                    color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                    WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  }}
                                >
                                  Следующая подстраница
                                </span>
                                <ChevronRight
                                  className="w-4 h-4 shrink-0"
                                  style={{
                                    color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                    stroke: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  }}
                                />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSubTab("test_preview");
                                  resetExamPreview();
                                }}
                                className="landing-btn-active px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-bold flex items-center gap-1.5 shadow-xl hover:brightness-105 transition cursor-pointer break-words whitespace-normal text-wrap border"
                                style={{
                                  ...previewActiveBtnStyle,
                                  color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                }}
                              >
                                <Sparkles
                                  className="w-4 h-4 shrink-0"
                                  style={{
                                    color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                    stroke: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  }}
                                />
                                <span
                                  className="break-words font-bold"
                                  style={{
                                    color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                    WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  }}
                                >
                                  Перейти к тестированию
                                </span>
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="w-full flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setSubTab("test_preview");
                                resetExamPreview();
                              }}
                              className="landing-btn-active px-5 py-2.5 text-sm font-bold flex items-center gap-2 shadow-xl hover:brightness-105 transition cursor-pointer break-words whitespace-normal text-wrap border"
                              style={{
                                ...previewActiveBtnStyle,
                                color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                              }}
                            >
                              <Sparkles
                                className="w-4 h-4 shrink-0"
                                style={{
                                  color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  stroke: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                }}
                              />
                              <span
                                className="break-words font-bold"
                                style={{
                                  color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                }}
                              >
                                Перейти к тестированию
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: АТТЕСТАЦИЯ — ТЕСТ */}
          {subTab === "test" && (
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                  <FileQuestion className="w-5 h-5 text-[#E7C768]" />
                  Тест по этапу ({test.questions.length} / {MAX_QUESTIONS} вопросов, проходной {test.pass_score} / {test.total_score || 100})
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setSubTab("test_preview");
                      resetExamPreview();
                    }}
                    className="text-sm px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20 flex items-center gap-2 shadow-md transition cursor-pointer"
                  >
                    <Play className="w-4 h-4 text-[#E7C768]" />
                    <span>Предпоказ аттестации</span>
                  </button>
                  <button
                    type="button"
                    onClick={generateTest}
                    disabled={busyTest || !getAllSubpagesPlainText(subpages)}
                    className="text-sm px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold flex items-center gap-2 disabled:opacity-40 shadow-lg hover:brightness-105 transition cursor-pointer"
                  >
                    {busyTest ? <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> : <Sparkles className="w-4 h-4 text-[#17344F]" />}
                    <span>Сгенерировать тест по всем подстраницам</span>
                  </button>
                </div>
              </div>

              {/* Pass score and shuffle in Apple Liquid Glass */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between gap-3 bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-4">
                  <label className="text-sm text-slate-200 font-bold inline-flex items-center gap-1.5">
                    Минимальный проходной балл:
                    <FieldHelp
                      section="training"
                      fieldKey="pass_score"
                      fallbackTitle="Проходной балл этапа"
                      fallbackBody="Минимальный % правильных ответов в тесте. Если кандидат не набрал балл — может перепроходить тест неограниченно. Рекомендуем 70–80%."
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={Math.max(test.total_score || 100, 1)}
                      step={1}
                      value={test.pass_score}
                      onChange={(e) => {
                        const max = Math.max(test.total_score || 100, 1);
                        const v = Math.max(1, Math.min(max, Number(e.target.value) || 0));
                        setTest((t) => ({ ...t, pass_score: v }));
                      }}
                      className="w-20 bg-transparent text-sm p-2 rounded-xl border border-white/20 text-white focus:outline-none focus:border-[#E7C768] text-center font-bold"
                    />
                    <span className="text-sm text-slate-300">/ {test.total_score || (test.questions.length * 5) || 100}</span>
                  </div>
                </div>

                <label className="flex items-center gap-3 bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={test.shuffle}
                    onChange={(e) => setTest((t) => ({ ...t, shuffle: e.target.checked }))}
                    className="accent-[#E7C768] w-5 h-5 rounded"
                  />
                  <div>
                    <span className="text-sm text-white font-bold block">Случайный порядок вопросов</span>
                    <span className="text-sm text-slate-300 block">При каждой попытке вопросы перемешиваются</span>
                  </div>
                </label>
              </div>

              {/* Wishes for test with MiniAudioField */}
              <div className="pt-1">
                <MiniAudioField
                  label="Пожелания к тесту (необязательно)"
                  value={wishesTest}
                  onChange={setWishesTest}
                  placeholder="Например: Сделай акцент на кейсы из второй подстраницы, включи 3 каверзных вопроса..."
                  maxLength={1000}
                  minRows={2}
                />
              </div>

              {busyTest && <LoadingPhrase entity="training" />}

              {test.questions.length === 0 && !busyTest && (
                <div className="bg-transparent border border-white/15 rounded-2xl p-6 text-center text-slate-300 text-sm">
                  Тест ещё не создан. Заполните материалы на подстраницах и нажмите «Сгенерировать тест по всем подстраницам», либо добавьте вопросы вручную кнопками ниже.
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
                {test.questions.map((q, i) => {
                  const effectiveKind: QuestionKind = (q.kind === "multichoice" || q.kind === "string" || q.kind === "paragraph" || q.kind === "choice")
                    ? q.kind
                    : (q.kind === "text" ? "paragraph" : "choice");

                  return (
                    <div
                      key={q.id || i}
                      className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap text-sm text-[#E7C768] font-bold">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>Вопрос #{i + 1}</span>

                          {/* 4 Types Switcher Buttons in standard Gold & Blue */}
                          <div className="flex items-center bg-black/40 border border-white/15 rounded-xl p-1 gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => changeQuestionKind(i, "string")}
                              className={`px-2.5 py-1 rounded-lg text-sm transition cursor-pointer ${
                                effectiveKind === "string"
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow"
                                  : "text-slate-300 hover:text-white"
                              }`}
                            >
                              Строка (MiniAudioField)
                            </button>
                            <button
                              type="button"
                              onClick={() => changeQuestionKind(i, "paragraph")}
                              className={`px-2.5 py-1 rounded-lg text-sm transition cursor-pointer ${
                                effectiveKind === "paragraph"
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow"
                                  : "text-slate-300 hover:text-white"
                              }`}
                            >
                              Абзац (AudioField)
                            </button>
                            <button
                              type="button"
                              onClick={() => changeQuestionKind(i, "choice")}
                              className={`px-2.5 py-1 rounded-lg text-sm transition cursor-pointer ${
                                effectiveKind === "choice"
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow"
                                  : "text-slate-300 hover:text-white"
                              }`}
                            >
                              Один из списка
                            </button>
                            <button
                              type="button"
                              onClick={() => changeQuestionKind(i, "multichoice")}
                              className={`px-2.5 py-1 rounded-lg text-sm transition cursor-pointer ${
                                effectiveKind === "multichoice"
                                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow"
                                  : "text-slate-300 hover:text-white"
                              }`}
                            >
                              Мультивыбор
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-sm text-slate-300">
                            <span>Балл:</span>
                            <span
                              className="px-2.5 py-1 rounded-lg border border-white/20 bg-transparent text-white text-center font-mono font-bold text-sm"
                              title="Рассчитывается пропорционально: 100 / количество вопросов"
                            >
                              {(100 / (test.questions.length || 1)).toFixed(2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const remaining = test.questions.filter((_, idx) => idx !== i);
                              const point = remaining.length > 0 ? Number((100 / remaining.length).toFixed(2)) : 0;
                              setTest((t) => ({
                                ...t,
                                questions: remaining.map((q) => ({ ...q, points: point })),
                                total_score: 100,
                              }));
                            }}
                            className="text-slate-300 hover:text-white p-1 transition cursor-pointer"
                            title="Удалить вопрос"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={q.question || (q as any).q || ""}
                        onChange={(e) => updateQuestion(i, { question: e.target.value })}
                        placeholder="Формулировка проверочного вопроса..."
                        className="w-full bg-transparent backdrop-blur-xl text-sm p-3 rounded-xl border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768]"
                      />

                      {/* 1. Choice: Один из списка */}
                      {effectiveKind === "choice" && (
                        <div className="space-y-2 pt-1">
                          <div className="text-sm text-slate-300 font-semibold">
                            Варианты ответа (отметьте кружком один правильный ответ):
                          </div>
                          {(q.options || []).map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2.5">
                              <input
                                type="radio"
                                name={`correct-${i}`}
                                checked={!!o.is_correct}
                                onChange={() => updateChoiceOption(i, oi, o?.text ?? (typeof o === "string" ? o : ""), true)}
                                className="accent-[#E7C768] w-4 h-4 cursor-pointer"
                                title="Отметить как правильный ответ"
                              />
                              <input
                                value={o?.text ?? (typeof o === "string" ? o : "")}
                                onChange={(e) => updateChoiceOption(i, oi, e.target.value)}
                                placeholder={`Вариант ответа #${oi + 1}`}
                                className="flex-1 bg-transparent text-sm p-2.5 rounded-xl border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768]"
                              />
                              {(q.options || []).length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeOptionFromQuestion(i, oi)}
                                  className="text-slate-400 hover:text-rose-300 p-1"
                                  title="Удалить вариант"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addOptionToQuestion(i)}
                            className="text-sm text-[#E7C768] hover:underline flex items-center gap-1 pt-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Добавить вариант ответа
                          </button>
                        </div>
                      )}

                      {/* 2. Multichoice: Мультивыбор с чекбоксами */}
                      {effectiveKind === "multichoice" && (
                        <div className="space-y-2 pt-1">
                          <div className="text-sm text-slate-300 font-semibold">
                            Варианты ответа (отметьте чекбоксами несколько правильных ответов):
                          </div>
                          {(q.options || []).map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={!!o.is_correct}
                                onChange={() => toggleMultichoiceOptionCorrect(i, oi)}
                                className="accent-[#E7C768] w-4 h-4 cursor-pointer rounded"
                                title="Отметить как правильный вариант"
                              />
                              <input
                                value={o?.text ?? (typeof o === "string" ? o : "")}
                                onChange={(e) => updateChoiceOption(i, oi, e.target.value)}
                                placeholder={`Вариант ответа #${oi + 1}`}
                                className="flex-1 bg-transparent text-sm p-2.5 rounded-xl border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768]"
                              />
                              {(q.options || []).length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeOptionFromQuestion(i, oi)}
                                  className="text-slate-400 hover:text-rose-300 p-1"
                                  title="Удалить вариант"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addOptionToQuestion(i)}
                            className="text-sm text-[#E7C768] hover:underline flex items-center gap-1 pt-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Добавить вариант ответа
                          </button>
                        </div>
                      )}

                      {/* 3. String: Строка - короткий текст с голосовым вводом MiniAudioField */}
                      {effectiveKind === "string" && (
                        <div className="space-y-2 pt-1 bg-black/20 border border-white/10 rounded-xl p-3.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#E7C768] flex items-center gap-1.5">
                              <Mic className="w-4 h-4 text-[#E7C768]" /> Строка с голосовым вводом MiniAudioField
                            </span>
                            <span className="text-sm text-slate-300">Кандидат увидит компактное поле с микрофоном</span>
                          </div>
                          <label className="block text-sm text-slate-300">
                            Эталонный краткий ответ (термин, факт, число или фраза, по которому ИИ оценивает кандидата):
                          </label>
                          <input
                            type="text"
                            value={q.expected_answer || ""}
                            onChange={(e) => updateQuestion(i, { expected_answer: e.target.value })}
                            placeholder="Например: Воронка продаж или 24 часа..."
                            className="w-full bg-transparent backdrop-blur-xl text-sm p-3 rounded-xl border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768]"
                          />
                        </div>
                      )}

                      {/* 4. Paragraph: Абзац - развернутый текст с голосовым вводом AudioField */}
                      {effectiveKind === "paragraph" && (
                        <div className="space-y-2 pt-1 bg-black/20 border border-white/10 rounded-xl p-3.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#E7C768] flex items-center gap-1.5">
                              <Mic className="w-4 h-4 text-[#E7C768]" /> Абзац с голосовым вводом AudioField
                            </span>
                            <span className="text-sm text-slate-300">Кандидат увидит развернутое поле с микрофоном</span>
                          </div>
                          <label className="block text-sm text-slate-300">
                            Эталонный развернутый ответ (развернутое объяснение из 2-5 предложений, по которому ИИ проверяет полноту мыслей кандидата):
                          </label>
                          <textarea
                            rows={3}
                            value={q.expected_answer || ""}
                            onChange={(e) => updateQuestion(i, { expected_answer: e.target.value })}
                            placeholder="Развёрнутый эталонный ответ для методической оценки ИИ..."
                            className="w-full bg-transparent backdrop-blur-xl text-sm p-3 rounded-xl border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add 4 Question Types Buttons */}
              <div className="flex flex-wrap gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={test.questions.length >= MAX_QUESTIONS}
                  onClick={() => addQuestionWithKind("string")}
                  className="text-sm px-4 py-2.5 rounded-2xl bg-transparent hover:bg-white/10 text-white border border-white/20 flex items-center gap-2 disabled:opacity-40 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#E7C768]" />
                  <span>Строка (MiniAudioField)</span>
                </button>

                <button
                  type="button"
                  disabled={test.questions.length >= MAX_QUESTIONS}
                  onClick={() => addQuestionWithKind("paragraph")}
                  className="text-sm px-4 py-2.5 rounded-2xl bg-transparent hover:bg-white/10 text-white border border-white/20 flex items-center gap-2 disabled:opacity-40 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#E7C768]" />
                  <span>Абзац (AudioField)</span>
                </button>

                <button
                  type="button"
                  disabled={test.questions.length >= MAX_QUESTIONS}
                  onClick={() => addQuestionWithKind("choice")}
                  className="text-sm px-4 py-2.5 rounded-2xl bg-transparent hover:bg-white/10 text-white border border-white/20 flex items-center gap-2 disabled:opacity-40 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#E7C768]" />
                  <span>Один из списка</span>
                </button>

                <button
                  type="button"
                  disabled={test.questions.length >= MAX_QUESTIONS}
                  onClick={() => addQuestionWithKind("multichoice")}
                  className="text-sm px-4 py-2.5 rounded-2xl bg-transparent hover:bg-white/10 text-white border border-white/20 flex items-center gap-2 disabled:opacity-40 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#E7C768]" />
                  <span>Мультивыбор</span>
                </button>

                {test.questions.length >= MAX_QUESTIONS && (
                  <span className="text-sm text-[#E7C768] self-center">
                    Достигнут максимум {MAX_QUESTIONS} вопросов.
                  </span>
                )}
              </div>

              {/* Save Test Footer */}
              {test.questions.length > 0 && (
                <div className="pt-4 border-t border-white/10 space-y-2">
                  <button
                    type="button"
                    onClick={saveTest}
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm py-3 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:brightness-105 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Сохраняем в базу данных…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-[#17344F]" /> Сохранить тест
                      </>
                    )}
                  </button>

                  {savedFlashTest && !saving && (
                    <div className="flex items-center justify-center gap-2 text-sm text-white animate-fade-in pt-1">
                      <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Тест успешно сохранён в базе данных
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ПРЕДПОКАЗ АТТЕСТАЦИИ (Live Candidate Cabinet Frame) */}
          {subTab === "test_preview" && (
            <div className="space-y-4">
              {/* Preview Controls Bar */}
              <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-4 sm:p-5 shadow-xl flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      Интерактивный предпоказ аттестации (теста)
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full border border-[#E7C768]/40 bg-transparent backdrop-blur-md text-sm text-white font-medium">
                      Проверка Роботом Рекрутером без списания лимитов
                    </span>
                  </div>
                  <p className="text-sm text-white">
                    Здесь руководитель может проверочно пройти тест точно так, как его видит кандидат в личном кабинете с учётом фирменного стиля компании, и проверить работу нейросети Роботом Рекрутером.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Device Viewport Selector */}
                  <div className="flex items-center bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("desktop")}
                      title="Десктоп (100% ширина)"
                      className={`p-2 rounded-xl transition cursor-pointer text-sm flex items-center gap-1.5 ${
                        previewDevice === "desktop"
                          ? "bg-transparent backdrop-blur-md border border-[#E7C768]/50 text-white font-bold"
                          : "border border-transparent text-white/70 hover:text-white"
                      }`}
                    >
                      <Monitor className="w-4 h-4" />
                      <span className="hidden sm:inline">ПК</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("tablet")}
                      title="Планшет (768px)"
                      className={`p-2 rounded-xl transition cursor-pointer text-sm flex items-center gap-1.5 ${
                        previewDevice === "tablet"
                          ? "bg-transparent backdrop-blur-md border border-[#E7C768]/50 text-white font-bold"
                          : "border border-transparent text-white/70 hover:text-white"
                      }`}
                    >
                      <Tablet className="w-4 h-4" />
                      <span className="hidden sm:inline">Планшет</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("mobile")}
                      title="Мобильный телефон (390px)"
                      className={`p-2 rounded-xl transition cursor-pointer text-sm flex items-center gap-1.5 ${
                        previewDevice === "mobile"
                          ? "bg-transparent backdrop-blur-md border border-[#E7C768]/50 text-white font-bold"
                          : "border border-transparent text-white/70 hover:text-white"
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span className="hidden sm:inline">Телефон</span>
                    </button>
                  </div>

                  {/* Fullscreen Toggle */}
                  <button
                    type="button"
                    onClick={() => setPreviewFullscreen((f) => !f)}
                    title={previewFullscreen ? "Свернуть" : "Во весь экран"}
                    className="p-2.5 rounded-2xl border border-white/20 bg-transparent backdrop-blur-md text-white transition cursor-pointer"
                  >
                    {previewFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-[#E7C768]" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-[#E7C768]" />
                    )}
                  </button>

                  {/* Return to Editing Test */}
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFullscreen(false);
                      setSubTab("test");
                    }}
                    className="px-4 py-2 rounded-2xl border border-white/20 bg-transparent backdrop-blur-md text-sm font-bold text-white flex items-center gap-2 transition cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 text-[#E7C768]" />
                    <span>Редактировать тест</span>
                  </button>
                </div>
              </div>

              {/* The Frame Container */}
              <div
                className={
                  previewFullscreen
                    ? "fixed inset-0 z-50 bg-black/95 backdrop-blur-md overflow-y-auto p-3 sm:p-6 flex flex-col items-center"
                    : "w-full"
                }
              >
                {previewFullscreen && (
                  <div className="w-full max-w-5xl flex items-center justify-between pb-3 text-white">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Play className="w-4 h-4 text-[#E7C768]" /> Полноэкранный предпоказ аттестации кандидата
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewFullscreen(false)}
                      className="px-3.5 py-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-sm font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Minimize2 className="w-4 h-4" /> Выйти из полноэкранного режима
                    </button>
                  </div>
                )}

                {/* Outer Window Chrome Frame */}
                <div
                  className="transition-all duration-300 shadow-2xl rounded-2xl md:rounded-3xl border border-white/20 overflow-hidden"
                  style={{
                    maxWidth:
                      previewDevice === "mobile"
                        ? "390px"
                        : previewDevice === "tablet"
                          ? "768px"
                          : "100%",
                    width: "100%",
                    margin: "0 auto",
                  }}
                >
                  {/* Browser Window Header Chrome */}
                  <div className="bg-[#0B0F19] border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-3 select-none text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#EF4444] inline-block shadow-sm" />
                      <span className="w-3 h-3 rounded-full bg-[#F59E0B] inline-block shadow-sm" />
                      <span className="w-3 h-3 rounded-full bg-[#10B981] inline-block shadow-sm" />
                      <span className="ml-2 text-slate-400 font-medium hidden sm:inline text-sm">
                        Личный кабинет кандидата • Аттестация
                      </span>
                    </div>
                    <div className="flex-1 max-w-sm mx-auto bg-black/50 border border-white/10 rounded-lg px-3 py-1 text-slate-300 text-center font-mono text-sm truncate">
                      🔒 /{project?.companySlug || (project as any)?.company_slug || "company"}/candidate/training?stage={stage}&mode=exam
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                      <span className="hidden md:inline px-2 py-0.5 rounded bg-white/5 border border-white/10 text-sm">
                        {isThemeMonochrome ? "Черно-белый стиль" : "Фирменный стиль"}
                      </span>
                    </div>
                  </div>

                  {/* Simulated Candidate Page Canvas */}
                  <div
                    id="company-landing-root"
                    className="company-landing-root training-preview-root candidate-training-root relative min-h-[620px] px-[2%] py-4 sm:px-5 sm:py-6 md:p-8 space-y-4 sm:space-y-6 text-left transition-colors w-full max-w-full overflow-hidden"
                    style={{
                      backgroundColor: previewPageBg,
                      color: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                      fontFamily: activeCompanyTheme?.fontFamily || undefined,
                    }}
                  >
                    {/* Dynamic Company Theme CSS Rules */}
                    {activeCompanyTheme && (
                      <style>{buildThemeCss(activeCompanyTheme)}</style>
                    )}

                    {/* Background Animation Canvas & Media */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                      {activeCompanyTheme?.pageBgImageUrl && (
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${activeCompanyTheme.pageBgImageUrl})`,
                            filter: isThemeMonochrome ? "grayscale(100%)" : undefined,
                          }}
                        />
                      )}
                      <InteractiveLandingBackground
                        containerMode
                        showBadges={false}
                        showSphere={Boolean(activeCompanyTheme?.showSphereAnimation ?? activeCompanyTheme?.showSphere)}
                        showWaves={(activeCompanyTheme?.showWaveAnimation ?? activeCompanyTheme?.showWaves) !== false}
                        themeColors={{
                          headingColor: activeCompanyTheme?.headingsSolidColor || "#FFFFFF",
                          bodyTextColor: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                          boldTextColor: activeCompanyTheme?.boldTextColor || "#FFFFFF",
                          iconColor: activeCompanyTheme?.iconColor || "#FFFFFF",
                          headingsColorMode: activeCompanyTheme?.headingsColorMode || "solid",
                          isMonochrome: isThemeMonochrome,
                        }}
                      />
                    </div>

                    <div className="relative z-10 space-y-5">
                      {/* Top Header inside Frame */}
                      <div
                        className="flex items-center justify-between gap-3 border-b pb-4 flex-wrap"
                        style={{ borderColor: previewCardBoxStyle.borderColor, borderBottomWidth: previewCardBoxStyle.borderWidth }}
                      >
                        <div className="flex items-center gap-3">
                          <CompanyThemedLogo
                            logoUrl={project?.logoUrl || (project as any)?.logo_url}
                            companyName={project?.companyName}
                            theme={activeCompanyTheme}
                            size="md"
                            className="w-10 h-10 shrink-0"
                          />
                          <div>
                            <h2 className="text-base sm:text-lg font-bold" style={previewHeadingStyle}>
                              {STAGES.find((s) => s.key === stage)?.title}
                            </h2>
                            <p className="text-sm text-slate-300">
                              {project?.roleName || "Должность"} • {project?.companyName || "Компания"}
                            </p>
                          </div>
                        </div>

                        <div
                          className="px-3 py-1 border text-sm font-semibold"
                          style={{
                            borderRadius: previewCardBoxStyle.borderRadius,
                            borderColor: previewCardBoxStyle.borderColor,
                            borderWidth: previewCardBoxStyle.borderWidth,
                            backgroundColor: previewInactiveBtnStyle.backgroundColor,
                            color: activeCompanyTheme?.bodyTextColor || "#FFFFFF",
                          }}
                        >
                          Проходной балл: {test.pass_score} / {test.total_score || 100}
                        </div>
                      </div>

                      {/* Result Mode OR Taking Exam Mode */}
                      {examPreviewResult ? (
                        <div
                          className="p-5 space-y-4 shadow-xl"
                          style={previewCardBoxStyle}
                        >
                          <div
                            className="border-b pb-3 flex items-center justify-between gap-2 flex-wrap"
                            style={{ borderColor: previewCardBoxStyle.borderColor }}
                          >
                            <h3 className="text-base font-bold" style={previewHeadingStyle}>
                              Результат проверки аттестации
                            </h3>
                            <span
                              className="text-sm px-2.5 py-0.5 border font-medium"
                              style={{
                                color: activeCompanyTheme?.iconColor || "#E7C768",
                                borderColor: previewCardBoxStyle.borderColor,
                                borderRadius: previewInactiveBtnStyle.borderRadius,
                              }}
                            >
                              Проверка без списания лимитов
                            </span>
                          </div>

                          <CandidateTrainingStageReport
                            passed={examPreviewResult.passed}
                            score={examPreviewResult.score}
                            max={test.total_score || 100}
                            passScore={test.pass_score || 70}
                            summary={examPreviewResult.candidate_summary}
                            theme={activeCompanyTheme}
                            perQuestionLegacy={examPreviewResult.per_question.map((pq: any) => ({
                              ...pq,
                              question: test.questions.find((qq) => qq.id === pq.id)?.question,
                            }))}
                          />

                          <div className="flex gap-2 pt-2 flex-wrap">
                            <button
                              type="button"
                              onClick={resetExamPreview}
                              className="landing-btn-active px-4 py-2.5 text-sm font-bold flex items-center gap-2 hover:brightness-105 transition cursor-pointer border shadow-md"
                              style={{
                                ...previewActiveBtnStyle,
                                color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                              }}
                            >
                              <RotateCcw
                                className="w-4 h-4 shrink-0"
                                style={{
                                  color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  stroke: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                }}
                              />
                              <span
                                style={{
                                  color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                }}
                              >
                                Перепройти проверочный тест
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewFullscreen(false);
                                setSubTab("test");
                              }}
                              className="landing-btn-inactive px-4 py-2.5 text-sm font-bold transition cursor-pointer border"
                              style={{
                                ...previewInactiveBtnStyle,
                                color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                WebkitTextFillColor: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                              }}
                            >
                              <span
                                style={{
                                  color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                  WebkitTextFillColor: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                }}
                              >
                                Вернуться к редактированию теста
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="p-4 sm:p-6 space-y-5 shadow-xl"
                          style={previewCardBoxStyle}
                        >
                          <div
                            className="flex items-center justify-between gap-2 border-b pb-3"
                            style={{ borderColor: previewCardBoxStyle.borderColor }}
                          >
                            <h3 className="text-base font-bold" style={previewHeadingStyle}>
                              Прохождение теста: {test.questions.length} вопросов
                            </h3>
                            <span
                              className="text-sm"
                              style={{ color: activeCompanyTheme?.bodyTextColor || "#CBD5E1" }}
                            >
                              Ответьте на вопросы и нажмите «Проверить ответы»
                            </span>
                          </div>

                          {test.questions.length === 0 ? (
                            <div
                              className="text-center py-8 text-sm"
                              style={{ color: activeCompanyTheme?.bodyTextColor || "#CBD5E1" }}
                            >
                              В тесте пока нет вопросов. Вернитесь во вкладку «Аттестация — тест» и сгенерируйте вопросы через ИИ или добавьте их вручную.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {test.questions.map((q, idx) => {
                                const effectiveKind = (q.kind === "multichoice" || q.kind === "string" || q.kind === "paragraph" || q.kind === "choice")
                                  ? q.kind
                                  : (q.kind === "text" ? "paragraph" : "choice");

                                return (
                                  <div
                                    key={q.id || idx}
                                    className="p-4 space-y-3 border"
                                    style={{
                                      ...previewCardBoxStyle,
                                      backgroundColor: activeCompanyTheme?.containerBgColor
                                        ? hexToRgba(activeCompanyTheme.containerBgColor, activeCompanyTheme.containerBgOpacity ?? 12)
                                        : "rgba(0, 0, 0, 0.28)",
                                    }}
                                  >
                                    <div
                                      className="flex items-center justify-between text-sm font-bold"
                                      style={{ color: activeCompanyTheme?.boldTextColor || "#FFFFFF" }}
                                    >
                                      <span>Вопрос {idx + 1} • {q.points || 5} б.</span>
                                      <span
                                        className="text-sm px-2.5 py-0.5 border font-medium"
                                        style={{
                                          color: activeCompanyTheme?.iconColor || "#E7C768",
                                          borderColor: previewCardBoxStyle.borderColor,
                                          borderRadius: previewInactiveBtnStyle.borderRadius,
                                        }}
                                      >
                                        {effectiveKind === "string" ? "Строка" : effectiveKind === "paragraph" ? "Абзац" : effectiveKind === "multichoice" ? "Мультивыбор" : "Один из списка"}
                                      </span>
                                    </div>

                                    <div
                                      className="text-sm font-medium leading-relaxed"
                                      style={{ color: activeCompanyTheme?.bodyTextColor || "#FFFFFF" }}
                                    >
                                      {q.question || "(Текст вопроса не заполнен)"}
                                    </div>

                                    {/* 1. Choice radio */}
                                    {effectiveKind === "choice" && (
                                      <div className="space-y-1.5 pt-1">
                                        {(q.options || []).map((o, oi) => {
                                          const isSelected = examPreviewAnswers[q.id] === o.text;
                                          return (
                                            <label
                                              key={oi}
                                              className={`flex items-start gap-2.5 p-2.5 cursor-pointer border transition text-sm ${
                                                isSelected ? "landing-btn-active font-bold" : "landing-btn-inactive hover:bg-white/10"
                                              }`}
                                              style={isSelected ? previewActiveBtnStyle : previewInactiveBtnStyle}
                                            >
                                              <input
                                                type="radio"
                                                name={`prev-${q.id}`}
                                                checked={isSelected}
                                                onChange={() => setExamPreviewAnswers((a) => ({ ...a, [q.id]: o.text }))}
                                                className="mt-1 cursor-pointer"
                                                style={{ accentColor: activeCompanyTheme?.iconColor || "#E7C768" }}
                                              />
                                              <span
                                                className="text-sm leading-relaxed"
                                                style={{
                                                  color: isSelected
                                                    ? (activeCompanyTheme?.btnActiveTextColor || "#000000")
                                                    : (activeCompanyTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                                                  WebkitTextFillColor: isSelected
                                                    ? (activeCompanyTheme?.btnActiveTextColor || "#000000")
                                                    : (activeCompanyTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                                                }}
                                              >
                                                {o.text}
                                              </span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* 2. Multichoice checkboxes */}
                                    {effectiveKind === "multichoice" && (
                                      <div className="space-y-2 pt-1">
                                        <div
                                          className="text-sm"
                                          style={{ color: activeCompanyTheme?.bodyTextColor || "#CBD5E1" }}
                                        >
                                          Выберите один или несколько вариантов:
                                        </div>
                                        {(q.options || []).map((o, oi) => {
                                          const isSelected = getExamPreviewMultichoice(q.id).includes(o.text);
                                          return (
                                            <div
                                              key={oi}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => toggleExamPreviewMultichoice(q.id, o.text)}
                                              onKeyDown={(e) => {
                                                if (e.key === " " || e.key === "Enter") {
                                                  e.preventDefault();
                                                  toggleExamPreviewMultichoice(q.id, o.text);
                                                }
                                              }}
                                              className={`flex items-start gap-2.5 p-2.5 cursor-pointer border transition text-sm select-none ${
                                                isSelected ? "landing-btn-active font-bold" : "landing-btn-inactive hover:bg-white/10"
                                              }`}
                                              style={isSelected ? previewActiveBtnStyle : previewInactiveBtnStyle}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                readOnly
                                                tabIndex={-1}
                                                className="pointer-events-none mt-1 cursor-pointer"
                                                style={{ accentColor: activeCompanyTheme?.iconColor || "#E7C768" }}
                                              />
                                              <span
                                                className="text-sm leading-relaxed pointer-events-none"
                                                style={{
                                                  color: isSelected
                                                    ? (activeCompanyTheme?.btnActiveTextColor || "#000000")
                                                    : (activeCompanyTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                                                  WebkitTextFillColor: isSelected
                                                    ? (activeCompanyTheme?.btnActiveTextColor || "#000000")
                                                    : (activeCompanyTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                                                }}
                                              >
                                                {o.text}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* 3. String: MiniAudioField */}
                                    {effectiveKind === "string" && (
                                      <div className="pt-1">
                                        <MiniAudioField
                                          value={examPreviewAnswers[q.id] || ""}
                                          onChange={(val) => setExamPreviewAnswers((a) => ({ ...a, [q.id]: val }))}
                                          placeholder="Введите краткий ответ или продиктуйте через микрофон..."
                                          theme={activeCompanyTheme}
                                          sphereColor={activeCompanyTheme?.iconColor || "#E7C768"}
                                          borderColor={activeCompanyTheme?.containerBorderColor}
                                        />
                                      </div>
                                    )}

                                    {/* 4. Paragraph: AudioField */}
                                    {effectiveKind === "paragraph" && (
                                      <div className="pt-1">
                                        <AudioField
                                          value={examPreviewAnswers[q.id] || ""}
                                          onChange={(val) => setExamPreviewAnswers((a) => ({ ...a, [q.id]: val }))}
                                          placeholder="Введите развернутый ответ или запишите через микрофон..."
                                          theme={activeCompanyTheme}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Action buttons inside Frame */}
                              <div
                                className="pt-3 border-t flex items-center justify-between gap-3 flex-wrap"
                                style={{ borderColor: previewCardBoxStyle.borderColor }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewFullscreen(false);
                                    setSubTab("test");
                                  }}
                                  className="landing-btn-inactive px-4 py-2.5 text-sm font-bold transition cursor-pointer border"
                                  style={{
                                    ...previewInactiveBtnStyle,
                                    color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                    WebkitTextFillColor: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                  }}
                                >
                                  <span
                                    style={{
                                      color: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                      WebkitTextFillColor: activeCompanyTheme?.btnInactiveTextColor || "#FFFFFF",
                                    }}
                                  >
                                    ← К редактированию теста
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={submitExamPreview}
                                  disabled={examPreviewChecking || test.questions.length === 0}
                                  className="landing-btn-active px-6 py-2.5 text-sm font-bold flex items-center gap-2 shadow-lg hover:brightness-105 active:scale-95 transition disabled:opacity-50 cursor-pointer border"
                                  style={{
                                    ...previewActiveBtnStyle,
                                    color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                    WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                  }}
                                >
                                  {examPreviewChecking ? (
                                    <>
                                      <RefreshCw
                                        className="w-4 h-4 animate-spin"
                                        style={{
                                          color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                        }}
                                      />
                                      <span
                                        style={{
                                          color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                          WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                        }}
                                      >
                                        Проверяем ответы…
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles
                                        className="w-4 h-4 shrink-0"
                                        style={{
                                          color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                          stroke: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                        }}
                                      />
                                      <span
                                        style={{
                                          color: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                          WebkitTextFillColor: activeCompanyTheme?.btnActiveTextColor || "#000000",
                                        }}
                                      >
                                        Проверить ответы
                                      </span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {examPreviewChecking && <LoadingPhrase entity="training" />}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Rich Media and Content Constructor Modals */}
      <ImageConstructorModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsert={insertIntoActiveSubpage}
        ownerId={project?.id || "100007"}
      />

      <VideoConstructorModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        onInsert={insertIntoActiveSubpage}
        ownerId={project?.id || "100007"}
      />

      <DocumentConstructorModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        onInsert={insertIntoActiveSubpage}
        ownerId={project?.id || "100007"}
        theme={activeCompanyTheme}
      />

      <LinkConstructorModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onInsert={insertIntoActiveSubpage}
        theme={activeCompanyTheme}
      />

      <TableConstructorModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        onInsert={insertIntoActiveSubpage}
      />

      {/* Modal: Requirement to save before previewing */}
      {savePromptModal.open && (
        <div className="fixed inset-0 z-50 bg-transparent backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-white box-border overflow-hidden">
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-transparent backdrop-blur-md border border-[#E7C768]/40 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-[#E7C768]" />
              </div>
              <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent break-words">
                {savePromptModal.type === "material"
                  ? "Необходимо сохранить материалы для просмотра"
                  : "Необходимо сохранить тест для просмотра"}
              </h3>
            </div>

            <p className="relative z-10 text-sm text-white/90 leading-relaxed break-words">
              {savePromptModal.type === "material"
                ? "Предпросмотр учебного материала становится доступным после его сохранения в базе данных хотя бы один раз. Сохраните подстраницы прямо сейчас, чтобы кандидат увидел актуальные обучающие материалы."
                : "Предпросмотр аттестации становится доступным после сохранения проверочного теста в базе данных хотя бы один раз. Сохраните тест прямо сейчас, чтобы протестировать его в интерактивном режиме."}
            </p>

            <div className="relative z-10 flex items-center justify-end gap-3 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSavePromptModal({ open: false, type: "material" })}
                className="px-4 py-2.5 rounded-xl bg-transparent backdrop-blur-md border border-white/25 text-sm font-semibold text-white transition cursor-pointer"
              >
                Отмена
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (savePromptModal.type === "material") {
                    await saveMaterials();
                    setSubTab("preview");
                    setPreviewSubpageIdx(activeSubpageIdx);
                    setSavePromptModal({ open: false, type: "material" });
                  } else {
                    await saveTest();
                    setSubTab("test_preview");
                    resetExamPreview();
                    setSavePromptModal({ open: false, type: "test" });
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold shadow-lg hover:brightness-105 active:scale-95 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" />
                    <span>Сохраняем…</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-[#17344F]" />
                    <span>Сохранить сейчас</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {copyModalMode && projectId && (
        <CopyTrainingModal
          isOpen={true}
          mode={copyModalMode}
          currentProjectId={projectId}
          projects={projects}
          onClose={() => setCopyModalMode(null)}
          onSuccess={() => {
            loadedStageKeyRef.current = "";
            setReloadCounter((prev) => prev + 1);
            if (refreshProjects) refreshProjects();
          }}
          addAuditEvent={addAuditEvent}
        />
      )}
    </div>
  );
}
