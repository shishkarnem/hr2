import crypto from "crypto";
import { getProTalkDB, saveAILog } from "../db";
import { queryGetPg, queryRunPg } from "../db/protalkDb";
import { extractUserSocialId, formatChatIdFromPrefix } from "./chatIdHelpers";
import { DEFAULT_PROTALK_LOG_URL } from "./utils";

export function stripProTalkGreetingNoise(text: string): string {
  if (!text) return "";
  let cleaned = String(text)
    .replace(/##INLINE:[^#]*##/gi, "")
    .replace(/Здравствуйте\.?\s*\n*\s*Для регистрации в RR[^\n]*(?:\n[^\n]*Напиши мой ID телеграм[^\n]*)?/gi, "")
    .replace(/Для регистрации в RR нажмите на эту кнопку[^\n]*/gi, "")
    .trim();
  return cleaned;
}

export function isProTalkGreetingOnly(text: string): boolean {
  if (!text || !text.trim()) return true;
  const raw = String(text);
  const hasOnboardingMarkers =
    /Для регистрации в RR/i.test(raw) ||
    /нажмите на эту кнопку.*🆕/i.test(raw) ||
    /##INLINE:[^#]*🆕/i.test(raw) ||
    /Напиши мой ID телеграм/i.test(raw);
  const cleaned = stripProTalkGreetingNoise(raw);
  if (hasOnboardingMarkers && cleaned.length < 20) return true;
  if (cleaned.length === 0) return true;
  return false;
}

export async function createAiJobRecord(params: {
  prompt_key: string;
  model_type?: string;
  entity_type?: string;
  entity_id?: string;
  payload?: any;
}): Promise<string> {
  const jobId = `job_${crypto.randomBytes(6).toString("hex")}`;
  try {
    await queryRunPg(
      `INSERT INTO ai_jobs (id, job_type, status, prompt_key, model_type, entity_type, entity_id, payload_json, created_at, updated_at)
       VALUES ($1, $2, 'running', $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        jobId,
        params.prompt_key || params.model_type || "other",
        params.prompt_key || "unknown",
        params.model_type || "other",
        params.entity_type || null,
        params.entity_id || null,
        params.payload ? JSON.stringify(params.payload).slice(0, 8000) : null,
      ]
    );
  } catch {}
  return jobId;
}

export async function finishAiJobRecord(
  jobId: string,
  status: "completed" | "failed",
  errorMessage?: string
): Promise<void> {
  if (!jobId) return;
  try {
    const cleanErr = errorMessage ? String(errorMessage).slice(0, 1000) : null;
    await queryRunPg(
      `UPDATE ai_jobs SET status = $1, error = $2, error_message = $2, updated_at = NOW() WHERE id = $3`,
      [status, cleanErr, jobId]
    );
  } catch {}
}

export async function getProTalkPrompt(
  promptKey: string,
  fallbackPrompt?: string,
  useProMax?: boolean
): Promise<{
  system_prompt: string;
  user_prompt_template: string;
  function_id?: number | null;
  log_url?: string;
  prompt_name?: string;
  bot?: {
    id: string;
    system_name?: string;
    bot_id: number;
    bot_name: string;
    model_type: string;
    model_alias: string;
    bot_token: string;
    api_url: string;
    temperature: number;
    user_prefix: string;
  };
}> {
  try {
    const isProMax = Boolean(useProMax || promptKey.endsWith("_promax"));
    const effectiveKey = isProMax && !promptKey.endsWith("_promax") ? `${promptKey}_promax` : promptKey;

    let row: any = await queryGetPg(
      `SELECT p.prompt_key, p.prompt_name, p.system_prompt, p.user_prompt_template, p.function_id, p.log_url, p.bot_id,
              b.id as bot_table_id, b.system_name, b.bot_id as protalk_bot_num, b.bot_name, b.model_type, b.model_alias, b.bot_token, b.api_url, b.temperature, b.user_prefix
       FROM protalk_prompts p
       LEFT JOIN protalk_bots b ON p.bot_id = b.id
       WHERE p.prompt_key = $1 AND COALESCE(p.is_active::text, '1') IN ('1', 'true', 't', 'TRUE')
       LIMIT 1`,
      [effectiveKey]
    );

    if (!row && effectiveKey !== promptKey) {
      row = await queryGetPg(
        `SELECT p.prompt_key, p.prompt_name, p.system_prompt, p.user_prompt_template, p.function_id, p.log_url, p.bot_id,
                b.id as bot_table_id, b.system_name, b.bot_id as protalk_bot_num, b.bot_name, b.model_type, b.model_alias, b.bot_token, b.api_url, b.temperature, b.user_prefix
         FROM protalk_prompts p
         LEFT JOIN protalk_bots b ON p.bot_id = b.id
         WHERE p.prompt_key = $1 AND COALESCE(p.is_active::text, '1') IN ('1', 'true', 't', 'TRUE')
         LIMIT 1`,
        [promptKey]
      );
    }

    if (row && (row.system_prompt || row.user_prompt_template)) {
      let botRecord: any = row;
      if (isProMax && Number(row.protalk_bot_num) !== 67370) {
        const promaxBotTableId =
          String(row.bot_id || "").startsWith("pt-") && !String(row.bot_id || "").startsWith("pt-promax-")
            ? String(row.bot_id).replace(/^pt-/, "pt-promax-")
            : "pt-promax-6";
        const promaxBotRow =
          (await queryGetPg(
            `SELECT id as bot_table_id, system_name, bot_id as protalk_bot_num, bot_name, model_type, model_alias, bot_token, api_url, temperature, user_prefix
             FROM protalk_bots
             WHERE (id = $1 OR (bot_id = 67370 AND user_prefix = $2)) AND COALESCE(is_active::text, '1') IN ('1', 'true', 't', 'TRUE')
             ORDER BY CASE WHEN id = $3 THEN 0 ELSE 1 END
             LIMIT 1`,
            [promaxBotTableId, row.user_prefix || "{id}_RRchat", promaxBotTableId]
          )) ||
          (await queryGetPg(
            `SELECT id as bot_table_id, system_name, bot_id as protalk_bot_num, bot_name, model_type, model_alias, bot_token, api_url, temperature, user_prefix
             FROM protalk_bots
             WHERE bot_id = 67370 AND COALESCE(is_active::text, '1') IN ('1', 'true', 't', 'TRUE')
             LIMIT 1`
          ));
        if (promaxBotRow) {
          botRecord = { ...row, ...promaxBotRow };
        }
      }

      const resolvedBotId = Number(botRecord.protalk_bot_num) || (isProMax ? 67370 : 66337);
      const rawDbToken = String(
        botRecord.bot_token ||
          (isProMax ? "XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY" : "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs")
      )
        .replace(new RegExp(`^${resolvedBotId}_`), "")
        .trim();

      return {
        system_prompt: row.system_prompt || "",
        user_prompt_template: row.user_prompt_template || row.system_prompt || "",
        function_id: row.function_id !== undefined && row.function_id !== null ? Number(row.function_id) : null,
        log_url:
          row.log_url !== undefined && row.log_url !== null
            ? String(row.log_url)
            : DEFAULT_PROTALK_LOG_URL,
        prompt_name: row.prompt_name,
        bot: {
          id: botRecord.bot_table_id || row.bot_id || (isProMax ? "pt-promax-6" : "pt-6"),
          system_name: botRecord.system_name || botRecord.model_type || "other",
          bot_id: resolvedBotId,
          bot_name: botRecord.bot_name || (isProMax ? "ProMax Bot" : "ProTalk Bot"),
          model_type: botRecord.model_type || "other",
          model_alias: botRecord.model_alias || (isProMax ? "promax" : "hr_rr"),
          bot_token: rawDbToken,
          api_url: botRecord.api_url || "https://ai.pro-talk.ru/v1/chat/completions",
          temperature:
            botRecord.temperature !== null && botRecord.temperature !== undefined
              ? Number(botRecord.temperature)
              : 0.1,
          user_prefix: botRecord.user_prefix || "{id}_RRchat",
        },
      };
    }
  } catch (err) {
    console.warn(`[ProTalk] Error reading prompt "${promptKey}":`, err);
  }

  return {
    system_prompt: fallbackPrompt || "",
    user_prompt_template: fallbackPrompt || "",
    log_url: DEFAULT_PROTALK_LOG_URL,
  };
}

export async function callProTalkLLM(
  modelType:
    | "chat"
    | "company"
    | "vacancy"
    | "school"
    | "resume"
    | "other"
    | "review"
    | "training"
    | "checklist"
    | "situations"
    | "file"
    | "voice_company"
    | "voice_sales"
    | "demo_resume"
    | "demo_checklist"
    | "demo_situations"
    | "demo_review",
  messages: Array<{ role: string; content: string }>,
  tempCandidateId?: string,
  tempEmployerId?: string,
  tempProjectId?: string,
  promptKey?: string,
  useProMax?: boolean
): Promise<string> {
  const isProMaxRequested = Boolean(useProMax || (promptKey && promptKey.endsWith("_promax")));

  const defaultKeyMap: Record<string, string> = {
    chat: "seeker_assistant",
    company: "company_generation",
    vacancy: "vacancy_generation",
    resume: "candidate_evaluation",
    school: "training_stage_quiz_grade",
    checklist: "checklist_evaluation",
    situations: "situation_analysis",
    review: "review_moderation",
    training: "training_stage_test_generate",
    file: "document_ingestion",
    voice_company: "voice_company_card",
    voice_sales: "voice_sales_objection",
    demo_resume: "demo_resume_screening",
    demo_checklist: "demo_checklist_evaluation",
    demo_situations: "demo_situations_evaluation",
    demo_review: "review_moderation",
    other: "landing_theme_generation",
  };

  const effectivePromptKey = promptKey || defaultKeyMap[modelType] || "seeker_assistant";
  const jobId = await createAiJobRecord({
    prompt_key: effectivePromptKey,
    model_type: modelType,
    entity_type: tempCandidateId ? "candidate" : tempProjectId ? "project" : tempEmployerId ? "employer" : "system",
    entity_id: tempCandidateId || tempProjectId || tempEmployerId || undefined,
  });

  let model = isProMaxRequested ? "promax" : "hr_rr";
  let bot_id = isProMaxRequested ? 67370 : 66337;
  let bot_token = isProMaxRequested
    ? "XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY"
    : "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs";
  let api_url = "https://ai.pro-talk.ru/v1/chat/completions";
  let temperature = 0.1;
  let prependedSystemPrompt: string | null = null;
  let bot_user_prefix: string | null = null;

  if (effectivePromptKey) {
    const promptData = await getProTalkPrompt(effectivePromptKey, undefined, isProMaxRequested);
    if (promptData.system_prompt) {
      prependedSystemPrompt = promptData.system_prompt;
    }
    if (promptData.bot) {
      bot_id = promptData.bot.bot_id;
      bot_token = promptData.bot.bot_token;
      model = promptData.bot.model_alias;
      api_url = promptData.bot.api_url;
      temperature = promptData.bot.temperature;
      bot_user_prefix = promptData.bot.user_prefix;
    }
  }

  if (!bot_user_prefix) {
    try {
      const targetSystemName = isProMaxRequested ? `${modelType}_promax` : modelType;
      const botRow =
        (await queryGetPg(
          `SELECT * FROM protalk_bots WHERE (system_name = $1 OR model_type = $2 OR (bot_id = $3 AND system_name = $4)) AND COALESCE(is_active::text, '1') IN ('1', 'true', 't', 'TRUE') LIMIT 1`,
          [targetSystemName, targetSystemName, isProMaxRequested ? 67370 : 66337, modelType]
        )) ||
        (await queryGetPg(
          `SELECT * FROM protalk_bots WHERE bot_id = $1 AND COALESCE(is_active::text, '1') IN ('1', 'true', 't', 'TRUE') LIMIT 1`,
          [isProMaxRequested ? 67370 : 66337]
        ));

      if (botRow) {
        if (botRow.bot_id) bot_id = Number(botRow.bot_id);
        if (botRow.bot_token) bot_token = String(botRow.bot_token).replace(new RegExp(`^${bot_id}_`), "").trim();
        if (botRow.model_alias) model = String(botRow.model_alias).trim();
        if (botRow.api_url) api_url = String(botRow.api_url).trim();
        if (botRow.temperature !== null && botRow.temperature !== undefined) temperature = Number(botRow.temperature);
        if (botRow.user_prefix) bot_user_prefix = String(botRow.user_prefix).trim();
      }
    } catch {}
  }

  const chatCompletionsUrl =
    api_url && api_url.includes("/chat/completions")
      ? api_url
      : "https://ai.pro-talk.ru/v1/chat/completions";

  const finalMessages = [...messages];
  const promptSnippet = prependedSystemPrompt ? prependedSystemPrompt.trim().slice(0, 60) : "";
  const alreadyContainsPrompt = Boolean(
    promptSnippet &&
      finalMessages.some((m) => typeof m.content === "string" && m.content.includes(promptSnippet))
  );
  const userHasFormattedPrompt = finalMessages.some(
    (m) =>
      typeof m.content === "string" &&
      (m.content.includes("ОТЗЫВ ДЛЯ ПРОВЕРКИ:") || m.content.includes("Ты — модератор"))
  );

  if (
    prependedSystemPrompt &&
    !finalMessages.some((m) => m.role === "system") &&
    !alreadyContainsPrompt &&
    !userHasFormattedPrompt
  ) {
    finalMessages.unshift({ role: "system", content: prependedSystemPrompt });
  }

  const defaultSuffixMap: Record<string, string> = {
    chat: "RRchat",
    company: "RRcompany",
    vacancy: "RRvacancy",
    school: "RRschool",
    checklist: "RRchecklist",
    situations: "RRsituations",
    resume: "RRresume",
    review: "RRfeed",
    training: "RRtraining",
    file: "RRfile",
    voice_company: "RRaudio",
    voice_sales: "RRaudio",
    demo_resume: "RRresume",
    demo_checklist: "RRchecklist",
    demo_situations: "RRsituations",
    demo_review: "RRfeed",
    other: "RRstyle",
  };

  let suffix = defaultSuffixMap[modelType] || "RRchat";
  if (bot_user_prefix) {
    const suffixMatch = bot_user_prefix.match(/_([A-Za-z0-9_]+)$/);
    if (suffixMatch && suffixMatch[1] && suffixMatch[1] !== "id}" && suffixMatch[1].length > 1) {
      suffix = suffixMatch[1];
    }
  }

  const rawActorId = tempCandidateId || tempEmployerId || tempProjectId || "100007";
  const rawActorStr = String(rawActorId || "").trim();
  const isAlreadyFormatted = /^(?:demo)?\d{5,15}_(?:RR[a-zA-Z0-9_-]+|cheklist|cases|prod|prof|system)$/i.test(rawActorStr);
  const bot_chat_id = isAlreadyFormatted
    ? rawActorStr
    : await formatChatIdFromPrefix(bot_user_prefix, rawActorId, suffix);

  const userSocialId = extractUserSocialId(
    bot_chat_id || tempCandidateId || tempEmployerId || ""
  );

  const rawBotToken = bot_token.replace(new RegExp(`^${bot_id}_`), "").trim();
  const key = `${bot_id}_${rawBotToken}`;
  const promptText = finalMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
  const targetModel = bot_chat_id || model;

  const payload = {
    model: targetModel,
    messages: finalMessages,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
    bot_id,
    bot_token: rawBotToken,
    bot_chat_id,
    chat_id: bot_chat_id,
    user_social_id: userSocialId,
    social_id: userSocialId,
    channel_id: bot_chat_id,
  };

  let responseText = "";
  let functionErr = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  const executeStreamAttempt = async (): Promise<string> => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(chatCompletionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned HTTP ${response.status}: ${errText}`);
      }

      const reader = (response.body as any)?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine === "data: [DONE]") continue;
          if (cleanLine.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(cleanLine.substring(6));
              if (parsed.usage) {
                if (parsed.usage.prompt_tokens) promptTokens = parsed.usage.prompt_tokens;
                if (parsed.usage.completion_tokens) completionTokens = parsed.usage.completion_tokens;
                if (parsed.usage.total_tokens) totalTokens = parsed.usage.total_tokens;
              }
              const chunkText = parsed.choices?.[0]?.delta?.content || "";
              accumulatedText += chunkText;
            } catch {}
          }
        }
      }

      if (buffer) {
        const cleanLine = buffer.trim();
        if (cleanLine.startsWith("data: ") && cleanLine !== "data: [DONE]") {
          try {
            const parsed = JSON.parse(cleanLine.substring(6));
            if (parsed.usage) {
              if (parsed.usage.prompt_tokens) promptTokens = parsed.usage.prompt_tokens;
              if (parsed.usage.completion_tokens) completionTokens = parsed.usage.completion_tokens;
              if (parsed.usage.total_tokens) totalTokens = parsed.usage.total_tokens;
            }
            const chunkText = parsed.choices?.[0]?.delta?.content || "";
            accumulatedText += chunkText;
          } catch {}
        }
      }

      return accumulatedText.trim();
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  try {
    let rawAttemptText = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        rawAttemptText = await executeStreamAttempt();
      } catch (attemptErr: any) {
        if (attempt === 1 && (attemptErr?.name === "AbortError" || /empty stream/i.test(String(attemptErr?.message || "")))) {
          console.warn(`[ProTalk Retry] Attempt 1 failed for chat_id=${bot_chat_id}: ${attemptErr?.message}. Retrying once...`);
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        throw attemptErr;
      }

      if (!rawAttemptText) {
        if (attempt === 1) {
          console.warn(`[ProTalk Retry] Attempt 1 returned empty response for chat_id=${bot_chat_id}. Retrying once...`);
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        throw new Error("ProTalk returned an empty stream response");
      }

      if (
        rawAttemptText.includes("[##ERROR##") ||
        rawAttemptText.includes("ERROR 'NoneType'") ||
        rawAttemptText.includes("ERROR [tool_completion]")
      ) {
        if (attempt === 1) {
          console.warn(`[ProTalk Retry] Attempt 1 returned tool/model error for chat_id=${bot_chat_id}. Retrying once...`);
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        throw new Error(`Ошибка модели ProTalk: ${rawAttemptText.slice(0, 300)}`);
      }

      if (isProTalkGreetingOnly(rawAttemptText)) {
        if (attempt === 1) {
          console.warn(`[ProTalk Retry] Attempt 1 returned Telegram onboarding stub for chat_id=${bot_chat_id} (Dialog initialized). Retrying real request...`);
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        throw new Error(`ProTalk вернул системное приветствие вместо ответа: ${rawAttemptText.slice(0, 200)}`);
      }

      responseText = stripProTalkGreetingNoise(rawAttemptText) || rawAttemptText;
      break;
    }

    if (!responseText) {
      throw new Error("ProTalk returned an empty response after retry");
    }

    await finishAiJobRecord(jobId, "completed");
    return responseText;
  } catch (err: any) {
    functionErr = err?.name === "AbortError" ? "Превышено время ожидания ответа ИИ (90 сек)" : err?.message || String(err);
    await finishAiJobRecord(jobId, "failed", functionErr);
    if (err && typeof err === "object") {
      err.jobId = jobId;
      err.job_id = jobId;
    }
    console.error(`[ProTalk Error] jobId=${jobId}:`, functionErr);
    throw err;
  } finally {
    try {
      const inTokens = promptTokens > 0 ? promptTokens : Math.max(1, Math.ceil((promptText || "").length / 3));
      const outTokens =
        completionTokens > 0 ? completionTokens : responseText ? Math.max(1, Math.ceil(responseText.length / 3)) : 0;
      const totTokens = totalTokens > 0 ? totalTokens : inTokens + outTokens;

      const dbInst = await getProTalkDB();
      await saveAILog(dbInst, {
        channel_id: bot_chat_id,
        user_social_id: userSocialId,
        user_message: promptText.slice(0, 10000),
        bot_reply: responseText.slice(0, 10000),
        channel_name: effectivePromptKey || modelType || "demo_interview",
        bot_id: String(bot_id),
        llm: model,
        api_key: bot_token,
        tokens_in_source: inTokens,
        tokens_out_source: outTokens,
        tokens_total: totTokens,
        function_error: functionErr || undefined,
        function_call_params: {
          job_id: jobId,
          model,
          temperature,
          bot_id,
          bot_chat_id,
          user_social_id: userSocialId,
        },
      });
    } catch {}
  }
}
