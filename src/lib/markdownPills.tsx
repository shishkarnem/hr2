import React, { useState } from "react";
import { Check, Copy, Tag } from "lucide-react";
import { hexToRgba } from "@/components/LandingStyleEditor";

/**
 * Formats bracketed text:
 * - Standalone [Заголовок: факт, без оценок] or [Действия: ...] into styled active button tabs
 * - Inline [Действия: ...], [Заголовок: ...] into active button tabs
 * - Inline [ситуации], [дата/время] into subtle variable chips
 */
export function formatBracketedText(text: string, theme?: any): React.ReactNode {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  const fullBlockMatch = trimmed.match(/^\[([^\]]+)\]$/);

  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
  const activeBtnText = theme?.btnActiveTextColor || "var(--landing-btn-active-text, #000000)";
  const activeBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    theme?.btnBorderRadius === 999
      ? "9999px"
      : theme?.btnBorderRadius != null
      ? `${theme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnBorderWidth = theme?.btnBorderWidth != null ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnText,
    borderColor: activeBtnBorder,
    borderWidth: activeBtnBorderWidth,
    borderRadius: activeBtnRadius,
    fontFamily: theme?.fontFamily || undefined,
  };

  if (fullBlockMatch) {
    return (
      <div
        className="landing-btn-active inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 my-1.5 border text-[11px] sm:text-xs md:text-sm font-bold shadow-md select-none tracking-wide break-words whitespace-normal text-wrap leading-snug"
        style={activeBtnStyle}
      >
        <Tag className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
        <span className="break-words whitespace-normal text-wrap" style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>{fullBlockMatch[1]}</span>
      </div>
    );
  }

  const parts: (string | React.ReactNode)[] = [];
  const regex = /\[([^\[\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const inner = match[1];
    if (
      inner.includes(":") ||
      inner.toLowerCase().startsWith("действие") ||
      inner.toLowerCase().startsWith("действия") ||
      inner.toLowerCase().startsWith("заголовок") ||
      inner.toLowerCase().startsWith("позиция") ||
      inner.toLowerCase().startsWith("подпись") ||
      inner.toLowerCase().startsWith("этап") ||
      inner.toLowerCase().startsWith("шаг")
    ) {
      parts.push(
        <span
          key={`tab_${match.index}`}
          className="landing-btn-active inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 my-1 border text-[10px] sm:text-xs font-bold shadow-md select-none align-middle break-words whitespace-normal text-wrap leading-snug"
          style={activeBtnStyle}
        >
          <Tag className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
          <span className="break-words whitespace-normal text-wrap" style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>{inner}</span>
        </span>
      );
    } else {
      parts.push(
        <span
          key={`chip_${match.index}`}
          className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/20 bg-transparent backdrop-blur-sm text-xs font-medium text-[#F4EE8E] mx-1 align-middle break-words whitespace-normal"
          style={{
            color: "var(--landing-icon-color, #F4EE8E)",
            borderColor: "rgba(255,255,255,0.25)",
          }}
        >
          {inner}
        </span>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * Interactive checklist item component with Liquid Glass checkbox and checkmark icon.
 */
export function InteractiveChecklistItem({ initialChecked, children }: { initialChecked: boolean; children: React.ReactNode }) {
  const [checked, setChecked] = useState(initialChecked);
  return (
    <li
      onClick={() => setChecked((prev) => !prev)}
      className="not-prose flex items-start gap-2.5 my-2 text-sm md:text-base text-slate-100 leading-relaxed list-none group cursor-pointer select-none"
    >
      <div className="mt-0.5 shrink-0 flex items-center justify-center">
        {checked ? (
          <div
            className="w-5 h-5 rounded-lg border bg-transparent backdrop-blur-md flex items-center justify-center shadow-md"
            style={{
              borderColor: "var(--landing-icon-color, #E7C768)",
            }}
          >
            <Check
              className="w-3.5 h-3.5 stroke-[2.5]"
              style={{ color: "var(--landing-icon-color, #E7C768)" }}
            />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-lg border border-white/35 bg-transparent backdrop-blur-md group-hover:border-white/70 transition-colors shadow-sm" />
        )}
      </div>
      <div className={`flex-1 min-w-0 break-words transition-opacity ${checked ? "opacity-75 line-through text-slate-300" : "text-slate-100"}`}>
        {children}
      </div>
    </li>
  );
}

/**
 * Interactive ordered checklist item (e.g. "1. ✅ Текст" or "2. [x] Текст")
 * with Liquid Glass Apple styling: themed number, themed checkmark icon, and no green emojis.
 */
export function InteractiveOrderedChecklistItem({
  orderNumber,
  initialChecked,
  children,
}: {
  orderNumber?: number;
  initialChecked: boolean;
  children: React.ReactNode;
}) {
  const [checked, setChecked] = useState(initialChecked);
  return (
    <li
      onClick={() => setChecked((prev) => !prev)}
      className="not-prose flex items-start gap-2.5 my-2 text-sm md:text-base text-slate-100 leading-relaxed list-none group cursor-pointer select-none"
    >
      {orderNumber !== undefined && (
        <span
          className="font-bold shrink-0 min-w-[1.6rem] text-right pt-0.5 select-none text-sm md:text-base"
          style={{ color: "var(--landing-icon-color, #E7C768)" }}
        >
          {orderNumber}.
        </span>
      )}
      <div className="mt-0.5 shrink-0 flex items-center justify-center">
        {checked ? (
          <div
            className="w-5 h-5 rounded-lg border bg-transparent backdrop-blur-md flex items-center justify-center shadow-md"
            style={{
              borderColor: "var(--landing-icon-color, #E7C768)",
            }}
          >
            <Check
              className="w-3.5 h-3.5 stroke-[2.5]"
              style={{ color: "var(--landing-icon-color, #E7C768)" }}
            />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-lg border border-white/35 bg-transparent backdrop-blur-md group-hover:border-white/70 transition-colors shadow-sm" />
        )}
      </div>
      <div className={`flex-1 min-w-0 break-words transition-opacity ${checked ? "opacity-75 line-through text-slate-300" : "text-slate-100"}`}>
        {children}
      </div>
    </li>
  );
}

/**
 * Ordered list item for numbered lists ("1. **Текст**").
 * Displays clean themed number instead of bullet dots!
 */
export function OrderedListItem({
  orderNumber,
  children,
}: {
  orderNumber?: number;
  children: React.ReactNode;
}) {
  return (
    <li className="not-prose flex items-start gap-2.5 my-2 text-sm md:text-base text-slate-100 leading-normal list-none">
      <span
        className="font-bold shrink-0 min-w-[1.6rem] text-right pt-0.5 select-none text-sm md:text-base"
        style={{ color: "var(--landing-icon-color, #E7C768)" }}
      >
        {orderNumber !== undefined ? `${orderNumber}.` : "•"}
      </span>
      <div className="flex-1 min-w-0 text-slate-100 break-words">
        {children}
      </div>
    </li>
  );
}

const CHECKMARK_PREFIX_REGEX = /^(\s*(?:✅|✔|☑|\[[xX]\]|\[\s*\]))\s*/;

/**
 * Detects if children begins with a checkmark indicator (such as ✅, ✔, ☑, [x], [ ])
 * and strips it so it can be replaced by the Liquid Glass Apple checkmark component.
 */
export function detectCheckmarkInContent(children: React.ReactNode, theme?: any): {
  hasCheck: boolean;
  isChecked: boolean;
  cleanedChildren: React.ReactNode;
} {
  if (!children) {
    return { hasCheck: false, isChecked: false, cleanedChildren: children };
  }

  // 1. Single string child
  if (typeof children === "string") {
    const match = children.match(CHECKMARK_PREFIX_REGEX);
    if (match) {
      const rawCheck = match[1].trim();
      const isChecked = rawCheck !== "[ ]";
      const rest = children.slice(match[0].length);
      return {
        hasCheck: true,
        isChecked,
        cleanedChildren: formatBracketedText(rest, theme),
      };
    }
    return { hasCheck: false, isChecked: false, cleanedChildren: children };
  }

  // 2. Array of children
  if (Array.isArray(children) && children.length > 0) {
    const first = children[0];
    if (typeof first === "string") {
      const match = first.match(CHECKMARK_PREFIX_REGEX);
      if (match) {
        const rawCheck = match[1].trim();
        const isChecked = rawCheck !== "[ ]";
        const restFirst = first.slice(match[0].length);
        const newFirst = typeof restFirst === "string" ? formatBracketedText(restFirst, theme) : restFirst;
        return {
          hasCheck: true,
          isChecked,
          cleanedChildren: [newFirst, ...children.slice(1)],
        };
      }
    } else if (React.isValidElement(first)) {
      const sub = detectCheckmarkInContent((first.props as any)?.children, theme);
      if (sub.hasCheck) {
        return {
          hasCheck: true,
          isChecked: sub.isChecked,
          cleanedChildren: [
            React.cloneElement(first as any, {}, sub.cleanedChildren),
            ...children.slice(1),
          ],
        };
      }
    }
  }

  // 3. Single React Element (e.g. <p> wrapped inside <li>)
  if (React.isValidElement(children)) {
    const sub = detectCheckmarkInContent((children.props as any)?.children, theme);
    if (sub.hasCheck) {
      return {
        hasCheck: true,
        isChecked: sub.isChecked,
        cleanedChildren: React.cloneElement(children as any, {}, sub.cleanedChildren),
      };
    }
  }

  return { hasCheck: false, isChecked: false, cleanedChildren: children };
}

/**
 * Fallback parser for text that contains multiline numbered items (e.g. inside paragraphs)
 */
export function renderParagraphOrList(children: React.ReactNode, theme?: any): React.ReactNode {
  if (typeof children !== "string") {
    return typeof children === "string" ? formatBracketedText(children, theme) : children;
  }
  const lines = children.split("\n");
  if (lines.length <= 1) {
    return formatBracketedText(children, theme);
  }

  const numberedLineRegex = /^(\d+)\.\s*(?:(✅|✔|☑|\[[xX]\]|\[\s*\])\s*)?(.*)$/;
  const hasNumberedLines = lines.filter((l) => numberedLineRegex.test(l.trim())).length >= 2;

  if (!hasNumberedLines) {
    return formatBracketedText(children, theme);
  }

  return (
    <ol className="not-prose my-3 space-y-2.5 pl-0 text-slate-100 text-sm md:text-base list-none">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const match = trimmed.match(numberedLineRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          const rawCheck = match[2];
          const text = match[3];
          if (rawCheck) {
            const isChecked = rawCheck !== "[ ]";
            return (
              <InteractiveOrderedChecklistItem key={idx} orderNumber={num} initialChecked={isChecked}>
                {formatBracketedText(text, theme)}
              </InteractiveOrderedChecklistItem>
            );
          }
          return (
            <OrderedListItem key={idx} orderNumber={num}>
              {formatBracketedText(text, theme)}
            </OrderedListItem>
          );
        }
        return (
          <div key={idx} className="my-1 text-slate-100">
            {formatBracketedText(trimmed, theme)}
          </div>
        );
      })}
    </ol>
  );
}

/**
 * Template card for template/pre blocks with tabs, variable pills, and copy button.
 */
export function TemplateCard({
  content,
  isCode,
  language,
  theme,
}: {
  content: string;
  isCode?: boolean;
  language?: string;
  theme?: any;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isCode) {
    return (
      <div className="not-prose my-4 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5 backdrop-blur-md text-xs text-[#F4EE8E] font-mono">
          <span>{language || "code"}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/20 hover:border-[#E7C768] text-white hover:text-[#E7C768] transition-colors cursor-pointer text-xs"
          >
            {copied ? <Check className="w-3 h-3 text-[#E7C768]" /> : <Copy className="w-3 h-3 text-[#E7C768]" />}
            <span>{copied ? "Скопировано" : "Копировать"}</span>
          </button>
        </div>
        <pre className="p-4 text-sm font-mono text-slate-100 overflow-x-auto">
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  const lines = content.split("\n");

  return (
    <div className="not-prose my-4 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl p-4 md:p-5 shadow-xl space-y-2 relative">
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: theme?.iconColor || "#E7C768" }}>
          <Tag className="w-3.5 h-3.5" style={{ color: theme?.iconColor || "#E7C768" }} />
          <span>Шаблон / форма заявления</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-white/20 hover:border-[#E7C768] text-white hover:text-[#E7C768] bg-transparent backdrop-blur-md transition-colors cursor-pointer text-xs"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5 text-[#E7C768]" />}
          <span>{copied ? "Скопировано" : "Копировать"}</span>
        </button>
      </div>

      <div className="space-y-2 text-sm md:text-base text-slate-100 leading-relaxed font-sans">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-1.5" />;
          }

          const blockTabMatch = trimmed.match(/^\[([^\]]+)\]$/);
          if (blockTabMatch) {
            return (
              <div key={idx} className="pt-2 first:pt-0">
                {formatBracketedText(trimmed, theme)}
              </div>
            );
          }

          return (
            <div key={idx} className="text-slate-100">
              {formatBracketedText(line, theme)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
