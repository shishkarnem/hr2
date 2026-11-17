export interface TrainingSubpage {
  id: string;
  title: string;
  content: string;
}

/**
 * Assembles a composite subpage title according to company standard:
 * "Профессиональное обучение от (название компании) для (название вакансии)"
 */
export function buildCompositeSubpageTitle({
  companyName,
  vacancyTitle,
  subpageIdx = 0,
  totalSubpages = 1,
}: {
  companyName?: string;
  vacancyTitle?: string;
  subpageIdx?: number;
  totalSubpages?: number;
}): string {
  const comp = (companyName || "").trim() || "компании";
  const vac = (vacancyTitle || "").trim() || "должности";
  const base = `Профессиональное обучение от ${comp} для ${vac}`;
  if (subpageIdx > 0 || (totalSubpages && totalSubpages > 1 && subpageIdx > 0)) {
    return `${base} • Подстраница ${subpageIdx + 1}`;
  }
  return base;
}

/**
 * Parses markdown that may contain multiple subpages delimited by
 * <!-- SUBPAGE_START title="..." id="..." --> ... <!-- SUBPAGE_END -->
 * If no delimiters are present, treats the entire raw markdown as a single subpage.
 */
export function parseSubpages(rawMd: string, fallbackTitle: string = "Основной материал"): TrainingSubpage[] {
  if (!rawMd || !rawMd.trim()) {
    return [{ id: `page_${Date.now()}`, title: fallbackTitle, content: "" }];
  }

  const regex = /<!--\s*SUBPAGE_START(?:\s+title="([^"]*)")?(?:\s+id="([^"]*)")?\s*-->([\s\S]*?)<!--\s*SUBPAGE_END\s*-->/gi;
  const pages: TrainingSubpage[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawMd)) !== null) {
    const rawTitle = match[1] || "";
    const rawId = match[2] || `sub_${pages.length + 1}_${Date.now()}`;
    const rawContent = match[3] || "";
    pages.push({
      id: rawId,
      title: rawTitle ? rawTitle.replace(/&quot;/g, '"') : `Подстраница ${pages.length + 1}`,
      content: rawContent.trim(),
    });
  }

  if (pages.length === 0) {
    return [{ id: `page_1_${Date.now()}`, title: fallbackTitle, content: rawMd.trim() }];
  }

  return pages;
}

/**
 * Serializes an array of subpages into a single Markdown string
 * preserving HTML comment delimiters for reliable two-way editing.
 */
export function serializeSubpages(pages: TrainingSubpage[]): string {
  if (!pages || pages.length === 0) return "";
  return pages.map((page, idx) => {
    const title = (page.title || `Подстраница ${idx + 1}`).trim();
    const id = page.id || `sub_${idx + 1}_${Date.now()}`;
    const cleanContent = (page.content || "").trim();
    return `<!-- SUBPAGE_START title="${title.replace(/"/g, '&quot;')}" id="${id}" -->\n${cleanContent}\n<!-- SUBPAGE_END -->`;
  }).join("\n\n");
}

/**
 * Combines all subpages into a clean plain text / Markdown representation
 * for test generation, AI prompts, or export.
 */
export function getAllSubpagesPlainText(pages: TrainingSubpage[]): string {
  if (!pages || pages.length === 0) return "";
  return pages
    .map((p, idx) => {
      const heading = p.title ? `## ${p.title}\n\n` : `## Подстраница ${idx + 1}\n\n`;
      return `${heading}${p.content.trim()}`;
    })
    .join("\n\n---\n\n");
}
