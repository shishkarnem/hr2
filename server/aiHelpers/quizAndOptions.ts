export function stripNonText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/:::[a-zA-Z0-9_\-]+[\s\S]*?:::/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeKind(raw: any): "text" | "paragraph" | "choice" | "multichoice" {
  const k = String(raw || "").toLowerCase().trim();
  if (k === "multichoice" || k === "multiple_choice" || k === "checkbox") return "multichoice";
  if (k === "paragraph" || k === "long_text" || k === "essay") return "paragraph";
  if (k === "choice" || k === "single_choice" || k === "radio" || k === "select") return "choice";
  return "text";
}

export function parseMultiList(val: any): string[] {
  if (Array.isArray(val)) {
    return val.map((x) => String(x || "").trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.includes("||")) {
      return trimmed.split("||").map((s) => s.trim()).filter(Boolean);
    }
    if (trimmed.includes(";")) {
      return trimmed.split(";").map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

export function calcMultiChoiceScore(selectedList: string[], correctList: string[], totalOptionsCount: number) {
  const selNorm = Array.from(new Set(selectedList.map((s) => s.trim().toLowerCase()).filter(Boolean)));
  const corNorm = Array.from(new Set(correctList.map((s) => s.trim().toLowerCase()).filter(Boolean)));
  if (selNorm.length === 0 || corNorm.length === 0) {
    return { score5: 0, matched: 0, wrong: selNorm.length, totalCorrect: corNorm.length, verdict: "wrong" as const };
  }
  const matched = selNorm.filter((s) => corNorm.includes(s)).length;
  const wrong = selNorm.filter((s) => !corNorm.includes(s)).length;
  if (matched === corNorm.length && wrong === 0) {
    return { score5: 5, matched, wrong: 0, totalCorrect: corNorm.length, verdict: "correct" as const };
  }
  if (matched === 0) {
    return { score5: 0, matched: 0, wrong, totalCorrect: corNorm.length, verdict: "wrong" as const };
  }
  const nonCorrectPool = Math.max(1, Math.max(totalOptionsCount, corNorm.length + 1) - corNorm.length);
  const rawRatio = Math.max(0, matched / corNorm.length - (wrong / nonCorrectPool) * 0.5);
  const score5 = Math.max(0, Math.min(5, Math.round(rawRatio * 5 * 10) / 10));
  const verdict: "correct" | "partial" | "wrong" = score5 >= 4.8 ? "correct" : score5 > 0 ? "partial" : "wrong";
  return { score5, matched, wrong, totalCorrect: corNorm.length, verdict };
}

const STUB_OPTION_PATTERNS = [
  /^правильный регламент и ключевой стандарт этапа$/i,
  /^ключевое правило и регламент компании$/i,
  /^обязательное условие сдачи отч[ёе]тности$/i,
  /^нерекомендуемый вариант выполнения задачи$/i,
  /^второстепенное или нерекомендуемое действие$/i,
  /^устаревший подход без согласования$/i,
  /^прямое нарушение правил компании$/i,
  /^прямой запрет по внутренним стандартам$/i,
  /^вариант\s*\d+$/i,
];

export function isStubOptionText(text: string): boolean {
  const clean = String(text || "").trim();
  if (!clean) return true;
  return STUB_OPTION_PATTERNS.some((re) => re.test(clean));
}

export function normalizeOptions(
  rawOptions: any,
  rawCorrect: any,
  isMulti: boolean
): { text: string; is_correct: boolean }[] | null {
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
    return null;
  }

  const list: { text: string; is_correct: boolean }[] = [];
  for (let idx = 0; idx < rawOptions.length; idx++) {
    const opt = rawOptions[idx];
    if (typeof opt === "string") {
      const text = opt.trim();
      if (text && !isStubOptionText(text)) {
        list.push({ text, is_correct: false });
      }
    } else if (opt && typeof opt === "object") {
      const text = String(opt.text || opt.title || opt.option || opt.label || opt.value || "").trim();
      if (text && !isStubOptionText(text)) {
        const is_correct = Boolean(opt.is_correct || opt.correct || opt.right);
        list.push({ text, is_correct });
      }
    }
  }

  if (list.length < 2) {
    return null;
  }

  if (rawCorrect !== undefined && rawCorrect !== null) {
    if (typeof rawCorrect === "string") {
      const matchLower = rawCorrect.trim().toLowerCase();
      let matchIdx = list.findIndex((o) => o.text.trim().toLowerCase() === matchLower);
      if (matchIdx < 0 && matchLower.length > 2) {
        matchIdx = list.findIndex((o) => o.text.toLowerCase().includes(matchLower) || matchLower.includes(o.text.toLowerCase()));
      }
      if (matchIdx < 0) {
        const letterIdx = ["a", "b", "c", "d", "e"].indexOf(matchLower.charAt(0));
        if (letterIdx >= 0 && letterIdx < list.length) matchIdx = letterIdx;
        const num = parseInt(matchLower, 10);
        if (!isNaN(num) && num >= 1 && num <= list.length) matchIdx = num - 1;
      }
      if (matchIdx >= 0) {
        list.forEach((o, i) => {
          o.is_correct = isMulti ? (o.is_correct || i === matchIdx) : (i === matchIdx);
        });
      }
    } else if (Array.isArray(rawCorrect)) {
      const set = new Set(rawCorrect.map((c) => String(c).trim().toLowerCase()).filter(Boolean));
      list.forEach((o) => {
        const oLower = o.text.trim().toLowerCase();
        if (set.has(oLower) || Array.from(set).some((s) => oLower.includes(s) || s.includes(oLower))) {
          o.is_correct = true;
        }
      });
    } else if (typeof rawCorrect === "number" && rawCorrect >= 0 && rawCorrect < list.length) {
      list.forEach((o, i) => {
        o.is_correct = i === rawCorrect;
      });
    }
  }

  const hasCorrect = list.some((o) => o.is_correct);
  if (!hasCorrect) {
    list[0].is_correct = true;
    if (isMulti && list.length > 1) {
      list[1].is_correct = true;
    }
  }

  if (!isMulti) {
    let firstFound = false;
    list.forEach((o) => {
      if (o.is_correct) {
        if (!firstFound) firstFound = true;
        else o.is_correct = false;
      }
    });
  }

  return list;
}

export function extractRequestedQuestionCount(wishesText?: string, defaultCount: number = 20): number {
  if (!wishesText) return defaultCount;
  const s = String(wishesText).toLowerCase();
  const m1 = s.match(/(?:сделай|создай|сгенерируй|напиши|нужно|надо|составь|из)?\s*(\d{1,2})\s*(?:вопрос|вопр|пункт|task|question|q\b)/i);
  if (m1 && m1[1]) {
    const val = parseInt(m1[1], 10);
    if (val >= 4 && val <= 30) return val;
  }
  const m2 = s.match(/(?:кол-?во|количество|число)\s*(?:вопросов|заданий)?\s*[:=–—\-]?\s*(\d{1,2})/i);
  if (m2 && m2[1]) {
    const val = parseInt(m2[1], 10);
    if (val >= 4 && val <= 30) return val;
  }
  return defaultCount;
}

export function computeTypeDistribution(count: number, wishes?: string) {
  const wishesText = (wishes || "").toLowerCase();

  let parsedChoice: number | null = null;
  let parsedMulti: number | null = null;
  let parsedString: number | null = null;
  let parsedParagraph: number | null = null;

  const choiceMatch = wishesText.match(/(\d+)\s*(?:вопрос\S*)?\s*(?:«|"|')?\s*(?:один из списка|один выбор|одиночн\S*|choice|single)\s*(?:»|"|')?/i);
  if (choiceMatch) parsedChoice = parseInt(choiceMatch[1], 10);

  const multiMatch = wishesText.match(/(\d+)\s*(?:вопрос\S*)?\s*(?:«|"|')?\s*(?:мультивыбор|множественн\S*|несколько|multichoice|multiple|multi)\s*(?:»|"|')?/i);
  if (multiMatch) parsedMulti = parseInt(multiMatch[1], 10);

  const stringMatch = wishesText.match(/(\d+)\s*(?:вопрос\S*)?\s*(?:«|"|')?\s*(?:строк\S*|кратк\S*|коротк\S*|string|short)\s*(?:»|"|')?/i);
  if (stringMatch) parsedString = parseInt(stringMatch[1], 10);

  const paragraphMatch = wishesText.match(/(\d+)\s*(?:вопрос\S*)?\s*(?:«|"|')?\s*(?:абзац\S*|развернут\S*|essay|paragraph|эссе)\s*(?:»|"|')?/i);
  if (paragraphMatch) parsedParagraph = parseInt(paragraphMatch[1], 10);

  if (parsedChoice !== null || parsedMulti !== null || parsedString !== null || parsedParagraph !== null) {
    const c = parsedChoice !== null ? Math.max(0, parsedChoice) : 0;
    const m = parsedMulti !== null ? Math.max(0, parsedMulti) : 0;
    const s = parsedString !== null ? Math.max(0, parsedString) : 0;
    const p = parsedParagraph !== null ? Math.max(0, parsedParagraph) : 0;
    const totalExplicit = c + m + s + p;
    if (totalExplicit === count) {
      return { choice: c, multichoice: m, string: s, paragraph: p };
    } else if (totalExplicit > 0) {
      const rem = count - totalExplicit;
      if (rem > 0) {
        if (parsedChoice === null) return { choice: rem, multichoice: m, string: s, paragraph: p };
        if (parsedParagraph === null) return { choice: c, multichoice: m, string: s, paragraph: rem };
        return { choice: c + rem, multichoice: m, string: s, paragraph: p };
      }
      return { choice: c, multichoice: m, string: s, paragraph: p };
    }
  }

  const base = Math.floor(count / 4);
  const rem = count % 4;
  return {
    choice: base + (rem > 0 ? 1 : 0),
    multichoice: base + (rem > 1 ? 1 : 0),
    string: base + (rem > 2 ? 1 : 0),
    paragraph: base,
  };
}

export function normalizeDynamicQuestions(
  rawQuestions: any[],
  _stage: string,
  targetCount: number = 20,
  distOverride?: any
): any[] {
  const safeList = (Array.isArray(rawQuestions) ? rawQuestions : []).filter((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const q = String(raw.question || raw.title || "").trim();
    if (!q || q.length < 8) return false;
    if (/^Контрольный вопрос #\d+/i.test(q)) return false;
    return true;
  });
  if (safeList.length === 0) return [];

  const preliminary: any[] = [];
  const count = Math.min(safeList.length, Math.max(4, Math.min(30, targetCount)));
  const dist = distOverride || computeTypeDistribution(count);
  const targetKinds: string[] = [];
  for (let i = 0; i < dist.choice; i++) targetKinds.push("choice");
  for (let i = 0; i < dist.multichoice; i++) targetKinds.push("multichoice");
  for (let i = 0; i < dist.string; i++) targetKinds.push("string");
  for (let i = 0; i < dist.paragraph; i++) targetKinds.push("paragraph");
  while (targetKinds.length < count) targetKinds.push("choice");

  for (let i = 0; i < count; i++) {
    const raw = safeList[i];
    const targetKind = targetKinds[i] || "choice";

    const rawType = String(raw.kind || raw.type || raw.question_type || raw.questionType || raw.format || "").toLowerCase().trim();
    let detectedKind = "";
    if (["choice", "single_choice", "single", "radio", "one_of_list"].includes(rawType)) {
      detectedKind = "choice";
    } else if (["multichoice", "multiple_choice", "multiple", "checkbox", "multi"].includes(rawType)) {
      detectedKind = "multichoice";
    } else if (["string", "short_answer", "short_text", "text_short", "line", "term", "text"].includes(rawType)) {
      detectedKind = "string";
    } else if (["paragraph", "long_answer", "essay", "open_ended", "long_text", "detailed"].includes(rawType)) {
      detectedKind = "paragraph";
    }

    const kind = detectedKind || targetKind;
    const qId = raw.id || `q${preliminary.length + 1}`;
    const questionText = String(raw.question || raw.title || "").trim();
    if (!questionText) continue;
    const explanation = String(raw.explanation || raw.comment || "").trim();

    const rawExpected = raw.expected_answer ?? raw.correct_answer ?? raw.answer ?? raw.correct ?? raw.standard_answer ?? raw.reference_answer;
    let expectedAnswer = "";
    if (typeof rawExpected === "string" && rawExpected.trim()) {
      expectedAnswer = rawExpected.trim();
    } else if (Array.isArray(rawExpected) && rawExpected.length > 0) {
      expectedAnswer = rawExpected.map((x) => String(x).trim()).filter(Boolean).join(", ");
    } else if (rawExpected !== undefined && rawExpected !== null) {
      expectedAnswer = String(rawExpected).trim();
    }

    if (kind === "choice") {
      const rawCorrect = raw.correct ?? raw.correct_answer ?? raw.answer ?? raw.expected_answer;
      const options = normalizeOptions(raw.options, rawCorrect, false);
      if (!options) {
        if (expectedAnswer) {
          preliminary.push({
            id: qId,
            kind: "string",
            question: questionText,
            options: null,
            correct: null,
            expected_answer: expectedAnswer,
            explanation: explanation || "Сверка с ключевым эталонным ответом.",
          });
        }
        continue;
      }
      const correctOpt = options.find((o) => o.is_correct) || options[0];
      preliminary.push({
        id: qId,
        kind: "choice",
        question: questionText,
        options,
        correct: correctOpt.text,
        expected_answer: null,
        explanation: explanation || `Верный вариант: ${correctOpt.text}`,
      });
    } else if (kind === "multichoice") {
      const rawCorrect = raw.correct ?? raw.correct_answers ?? raw.correct_answer ?? raw.answers ?? raw.answer;
      const options = normalizeOptions(raw.options, rawCorrect, true);
      if (!options) {
        if (expectedAnswer) {
          preliminary.push({
            id: qId,
            kind: "paragraph",
            question: questionText,
            options: null,
            correct: null,
            expected_answer: expectedAnswer,
            explanation: explanation || "Развёрнутая сверка с эталонным ответом.",
          });
        }
        continue;
      }
      const correctList = options.filter((o) => o.is_correct).map((o) => o.text);
      preliminary.push({
        id: qId,
        kind: "multichoice",
        question: questionText,
        options,
        correct: correctList,
        expected_answer: null,
        explanation: explanation || `Верные варианты: ${correctList.join(", ")}`,
      });
    } else if (kind === "string") {
      if (!expectedAnswer && !explanation) continue;
      preliminary.push({
        id: qId,
        kind: "string",
        question: questionText,
        options: null,
        correct: null,
        expected_answer: expectedAnswer || explanation,
        explanation: explanation || expectedAnswer,
      });
    } else {
      if (!expectedAnswer && !explanation) continue;
      preliminary.push({
        id: qId,
        kind: "paragraph",
        question: questionText,
        options: null,
        correct: null,
        expected_answer: expectedAnswer || explanation,
        explanation: explanation || expectedAnswer,
      });
    }
  }

  if (preliminary.length === 0) return [];
  const points = Number((100 / preliminary.length).toFixed(2));
  return preliminary.map((item, idx) => ({
    ...item,
    id: item.id || `q${idx + 1}`,
    points,
  }));
}
