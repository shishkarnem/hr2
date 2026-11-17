import { Request } from "express";
import { PgDBWrapper } from "../db";

export function extractSmartCompanyResult(text: string, rawResponse: string, parsedJson: any) {
  let name = parsedJson?.company_name;
  let industry = parsedJson?.industry;
  let description = parsedJson?.description;
  let advantages =
    Array.isArray(parsedJson?.key_advantages) && parsedJson.key_advantages.length > 0
      ? parsedJson.key_advantages
      : null;

  const cleanRaw = (rawResponse || "").replace(/AI Reasoning.*?\n\n/gs, "").trim();

  if (!name || name === "ООО Инновационные Технологии") {
    const matchQuotes = (cleanRaw + " " + text).match(/«([^»]+)»|'([^']+)'|"([^"]+)"/);
    if (matchQuotes) {
      name = matchQuotes[1] || matchQuotes[2] || matchQuotes[3];
    } else {
      const matchWords = (cleanRaw + " " + text).match(/(?:компания|организация|фирма|сервис|проект)\s+([А-ЯA-Z][а-яa-z0-9_-]+)/i);
      if (matchWords) {
        name = matchWords[1];
      } else {
        const words = text.trim().split(/\s+/).slice(0, 3).join(" ");
        name = words || "Компания Заказчика";
      }
    }
  }

  if (!description) {
    const extractedDesc = cleanRaw
      .replace(/^Принял описание компании\.?\s*/i, "")
      .replace(/^Правильно понял:?\s*/i, "")
      .replace(/Уточните, пожалуйста.*$/i, "")
      .replace(/Вторая часть текста.*$/i, "")
      .trim();

    description = extractedDesc.length > 15 ? extractedDesc : text.trim();
  }

  if (!industry) {
    if (/продаж|роп|руководител/i.test(text + " " + cleanRaw)) {
      industry = "Аренда руководителей отдела продаж и консалтинг";
    } else if (/it|ии|програм|софт|разработ/i.test(text + " " + cleanRaw)) {
      industry = "Информационные технологии и ИИ автоматизация";
    } else {
      industry = "Услуги для бизнеса и развитие коммерческого направления";
    }
  }

  if (!advantages) {
    advantages = [
      "Опытные руководители и сильная команда экспертов",
      "Гибкое подстраивание под индивидуальные задачи бизнеса",
      "Ориентация на достижение конкретных коммерческих результатов",
    ];
  }

  return {
    company_name: name,
    industry,
    tagline: parsedJson?.tagline || `Профессиональные решения в сфере ${industry.toLowerCase()}`,
    description,
    key_advantages: advantages,
    corporate_values:
      Array.isArray(parsedJson?.corporate_values) && parsedJson.corporate_values.length > 0
        ? parsedJson.corporate_values
        : ["Профессионализм и сфокусированность", "Прозрачность и ответственность"],
    ai_summary:
      parsedJson?.ai_summary ||
      "Карточка компании сгенерирована Роботом Рекрутером. Экспертный профиль привлекателен для соискателей.",
  };
}

export const VALID_INGEST_FILE_TYPES = new Set([
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "txt",
  "rtf",
  "csv",
  "md",
  "json",
  "html",
]);

export async function resolveIngestFileUrlAndType(
  req: Request,
  db: PgDBWrapper | null,
  rawFileUrl: string,
  filename?: string,
  reqFileType?: string
): Promise<{ directFileUrl: string; detectedFileType: string }> {
  let directFileUrl = String(rawFileUrl || "").trim();
  const extFromName = String(filename || "").split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  const extFromUrl = directFileUrl.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();

  let detectedFileType =
    (reqFileType && VALID_INGEST_FILE_TYPES.has(String(reqFileType).toLowerCase())
      ? String(reqFileType).toLowerCase()
      : null) ||
    (extFromName && VALID_INGEST_FILE_TYPES.has(extFromName) ? extFromName : null) ||
    (extFromUrl && VALID_INGEST_FILE_TYPES.has(extFromUrl) ? extFromUrl : null) ||
    "pdf";

  if (directFileUrl && directFileUrl.startsWith("/")) {
    const host = req.get("x-forwarded-host") || req.get("host") || "localhost:3000";
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    directFileUrl = `${proto}://${host}${directFileUrl}`;
  }

  if (directFileUrl && (directFileUrl.includes("docs.google.com") || directFileUrl.includes("drive.google.com"))) {
    const docMatch = directFileUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    const sheetMatch = directFileUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const slideMatch = directFileUrl.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    const fileMatch =
      directFileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      directFileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (docMatch) {
      detectedFileType = "docx";
      directFileUrl = `https://docs.google.com/document/d/${docMatch[1]}/edit`;
    } else if (sheetMatch) {
      detectedFileType = "xlsx";
      directFileUrl = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/edit`;
    } else if (slideMatch) {
      detectedFileType = "pptx";
      directFileUrl = `https://docs.google.com/presentation/d/${slideMatch[1]}/edit`;
    } else if (fileMatch) {
      directFileUrl = `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
      if (reqFileType && VALID_INGEST_FILE_TYPES.has(String(reqFileType).toLowerCase())) {
        detectedFileType = String(reqFileType).toLowerCase();
      }
    }
  }

  if (directFileUrl && db) {
    try {
      const match = String(directFileUrl).match(/\/(?:files|file)\/([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const param = match[1];
        const fileRow = /^\d+$/.test(param)
          ? await db.get("SELECT * FROM file_storage WHERE id = ?", [parseInt(param, 10)])
          : await db.get("SELECT * FROM file_storage WHERE file_key = ?", [param]);
        if (fileRow) {
          if (fileRow.original_url && /^https?:\/\//i.test(fileRow.original_url)) {
            directFileUrl = fileRow.original_url;
          }
          if (!reqFileType && fileRow.original_name) {
            const rowExt = String(fileRow.original_name).split(".").pop()?.toLowerCase();
            if (rowExt && VALID_INGEST_FILE_TYPES.has(rowExt)) {
              detectedFileType = rowExt;
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn("[resolveIngestFileUrlAndType] file_storage lookup warning:", dbErr);
    }
  }

  return { directFileUrl, detectedFileType };
}
