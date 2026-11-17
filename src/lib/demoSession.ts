// LocalStorage helpers for the /demo interview flow.
// All progress (template, answers, results) lives in the browser.

export type DemoStage = "pick" | "restart" | "situations" | "checklist" | "resume" | "done";

export type DemoQuestionKind = "choice" | "multichoice" | "text" | "paragraph";

export type DemoQuestion = {
  id: string;
  kind: DemoQuestionKind;
  question: string;
  options?: any;
  correct?: any;
  correct_options?: any;
  expected_answer?: string | null;
};

export type DemoSituation = { id: string; title: string; brief: string; criteria?: string };

export type DemoTemplate = {
  titleId: string;
  title: string;
  vacancy_text?: string;
  situations: DemoSituation[];
  checklist: DemoQuestion[];
  resume_criteria: string;
};

export type DemoState = {
  titleId: string;
  title: string;
  stage: DemoStage;
  template: DemoTemplate | null;
  sitAnswers: Record<string, string>;
  checkAnswers: Record<string, string>;
  resumeText: string;
  sitResult: { score: number; items: { id: string; feedback: string; score: number }[]; advice: string } | null;
  checkResult: { score: number; feedback: any } | null;
  resumeResult: { score: number; summary: string; strengths: string[]; gaps: string[] } | null;
  finalScore: number | null;
};

const STATE_KEY = "demo:state";
const TPL_PREFIX = "demo:tpl:";
const DEMO_USER_KEY = "demo:user_id";

/**
 * Stable per-browser anonymous 6-digit demo session ID (e.g. "579409").
 * Used to form stage-specific ProTalk chat_ids (e.g. demo579409_RRstart,
 * demo579409_RRsituations, demo579409_RRcheklist, demo579409_RRresume).
 * Preserved during the demo session and reset when choosing a new position.
 */
export function getDemoUserId(): string {
  try {
    const cur = localStorage.getItem(DEMO_USER_KEY);
    if (cur && /^\d{6}$/.test(cur)) return cur;
    if (cur && /^demo\d{6}$/.test(cur)) return cur.replace("demo", "");
    if (cur && cur.length > 0) {
      const match = cur.match(/\d{6}/);
      if (match) {
        localStorage.setItem(DEMO_USER_KEY, match[0]);
        return match[0];
      }
    }
    const fresh = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem(DEMO_USER_KEY, fresh);
    return fresh;
  } catch {
    return "579409";
  }
}

export function resetDemoUserId(): void {
  try { localStorage.removeItem(DEMO_USER_KEY); } catch { /* ignore */ }
}

export function loadDemoState(): DemoState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed && parsed.template) {
      if (!Array.isArray(parsed.template.situations)) parsed.template.situations = [];
      if (!Array.isArray(parsed.template.checklist)) parsed.template.checklist = [];
    }
    return parsed;
  } catch { return null; }
}

export function saveDemoState(s: DemoState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* ignore quota */ }
}

export function clearDemoState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* ignore */ }
}

export function loadCachedTemplate(titleId: string): DemoTemplate | null {
  try {
    const raw = localStorage.getItem(TPL_PREFIX + titleId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoTemplate;
    if (parsed) {
      if (!Array.isArray(parsed.situations)) parsed.situations = [];
      if (!Array.isArray(parsed.checklist)) parsed.checklist = [];
    }
    return parsed;
  } catch { return null; }
}

export function saveCachedTemplate(tpl: DemoTemplate) {
  try { localStorage.setItem(TPL_PREFIX + tpl.titleId, JSON.stringify(tpl)); } catch { /* ignore */ }
}

export function makeInitialState(titleId: string, title: string): DemoState {
  return {
    titleId, title,
    stage: "restart",
    template: null,
    sitAnswers: {}, checkAnswers: {}, resumeText: "",
    sitResult: null, checkResult: null, resumeResult: null,
    finalScore: null,
  };
}