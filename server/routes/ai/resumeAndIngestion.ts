import { Router, Request, Response } from "express";
import {
  formatDemoChatId,
  formatEmployerChatId,
  formatChatIdFromPrefix,
  resolveCandidate6DigitPublicId,
  resolveEmployerPublicId,
  findCandidateRow,
  extractUserSocialId,
  callProTalkLLM,
  getProTalkPrompt,
  tryParseLLMJson,
  getShuffled20Questions,
} from "../../common";
import { getProTalkDB, saveAILog, saveCandidateToProTalkDB } from "../../db";
import {
  CandidateCustomFieldDef,
  buildDefaultVacancyCustomFields,
  buildResumeExtractionPromptSegment,
  parseVacancyCandidateFieldsConfig,
  extractFieldsFromResumeText,
  mergeCandidateFields,
  extractStandardFieldsFromCandidateRow,
} from "../../../src/lib/candidateFields";
import {
  candidateAiJobStore,
  isStageManual,
  detectAiTextHeuristic,
  buildLlmMessagesFromPrompt,
  storeFailedAiJob,
  persistCandidateAfterResume,
} from "../../aiHelpers/common";
import { resolveIngestFileUrlAndType } from "../../aiHelpers/documentAndVoice";

export const resumeAndIngestionRouter = Router();

export const handleScreenResume = async (req: Request, res: Response) => {
  try {
    const {
      candidate_id,
      project_id,
      title: rawTitle,
      vacancy_text: rawVacancy,
      criteria_md: rawCriteria,
      resume_text: rawResume,
      demo_user_id,
      employer_id,
      employer_public_id,
      is_preview,
      anti_ai_enabled: reqAntiAi,
      employer_wishes: reqWishes,
      prompt_override: reqPromptOverride,
      use_promax,
    } = req.body || {};
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();

    let title = rawTitle;
    let vacancy_text = rawVacancy;
    let criteria_md = rawCriteria;
    let text = String(rawResume || "").trim();
    let blkRow: any = null;
    let parsedBlk: any = {};
    let projRow: any = null;

    const cand = candidate_id && db ? await findCandidateRow(db, candidate_id) : null;
    if (cand && !text) text = String(cand.resume_text || "").trim();

    let pid = project_id || cand?.project_id;
    if (!pid && candidate_id && db) {
      const cRow = await db.get(
        "SELECT project_id FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [String(candidate_id), String(candidate_id)]
      );
      pid = cRow?.project_id || null;
    }
    if (pid && db) {
      projRow = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [String(pid), String(pid)]
      );
      if (projRow) {
        if (!title) title = projRow.role_name || projRow.title;
        if (!vacancy_text) vacancy_text = projRow.vacancy_text || projRow.description || "";
      }
      blkRow = await db.get(
        "SELECT * FROM interview_blocks WHERE project_id = ? AND kind IN ('resume', 'resume_criteria') ORDER BY updated_at DESC LIMIT 1",
        [projRow?.id || String(pid)]
      );
      if (blkRow?.payload) {
        try {
          parsedBlk = typeof blkRow.payload === "string" ? JSON.parse(blkRow.payload) : blkRow.payload;
          if (!criteria_md) criteria_md = parsedBlk?.criteria_md || "";
        } catch {}
      }
    }

    const employerWishes = String(
      reqWishes ?? reqPromptOverride ?? parsedBlk?.employer_wishes ?? blkRow?.prompt_override ?? ""
    ).trim();

    let parsedSettings: any = {};
    try {
      if (blkRow?.settings_json) {
        parsedSettings = typeof blkRow.settings_json === "string" ? JSON.parse(blkRow.settings_json) : blkRow.settings_json;
      }
    } catch {}

    const antiAiEnabled =
      reqAntiAi !== undefined
        ? Boolean(reqAntiAi)
        : Boolean(
            blkRow?.anti_ai_enabled ||
              parsedBlk?.anti_ai_enabled ||
              parsedSettings?.anti_ai_enabled ||
              /Защита от нейросетей/i.test(employerWishes)
          );

    const isDemo = Boolean(demo_user_id && !candidate_id && !is_preview);
    let customDefs: CandidateCustomFieldDef[] = [];
    if (req.body?.custom_fields_config) {
      customDefs = parseVacancyCandidateFieldsConfig(req.body.custom_fields_config).customFields;
    } else if (projRow?.candidate_fields_config) {
      customDefs = parseVacancyCandidateFieldsConfig(projRow.candidate_fields_config).customFields;
    }
    if (customDefs.length === 0) {
      customDefs = buildDefaultVacancyCustomFields(title || projRow?.role_name || "Специалист");
    }

    const extractionPromptSegment = buildResumeExtractionPromptSegment(customDefs);
    const baseKey = isDemo ? "demo_resume_screening" : "candidate_evaluation";
    const promptKey = isProMax ? `${baseKey}_promax` : baseKey;
    const promptData = await getProTalkPrompt(
      promptKey,
      `Ты — HR-эксперт платформы «Робот Рекрутер». Оцени резюме кандидата на должность "{{title}}".

Критерии оценки:
{{criteria_md}}

{{vacancy_text}}

Резюме кандидата:
{{resume_text}}

Верни строго JSON: {"score":0..100,"raw_score":0..100,"ai_detected":boolean,"summary":string (3-4 предложения для кандидата),"strengths":string[] (2-5),"gaps":string[] (2-5),"standard_fields":{...},"custom_fields":{...}}`,
      isProMax
    );

    const fallbackMsg = `Должность: "${title || "Специалист"}"
Критерии:
${criteria_md || "(стандартные критерии)"}
${vacancy_text ? `Вакансия:\n${String(vacancy_text).slice(0, 3000)}\n` : ""}
Резюме кандидата:
${text.slice(0, 10000)}

Верни строго JSON: {"score":0..100,"raw_score":0..100,"ai_detected":boolean,"summary":string,"strengths":string[],"gaps":string[],"standard_fields":{...},"custom_fields":{...}}`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        title: title || "Специалист",
        role_name: title || "Специалист",
        criteria_md: criteria_md || "(используй стандартные критерии для этой должности)",
        vacancy_text: vacancy_text ? `Контекст должности:\n${String(vacancy_text).slice(0, 3000)}` : "",
        resume_text: text.slice(0, 10000),
      },
      fallbackMsg
    );

    const lastMsg = llmMessages[llmMessages.length - 1];
    lastMsg.content += `\n\n${extractionPromptSegment}`;
    if (employerWishes) {
      lastMsg.content += `\n\nДополнительные указания работодателя:\n${employerWishes}`;
    }
    if (antiAiEnabled) {
      lastMsg.content += `\n\nПравило защиты от нейросетей (включено работодателем):
Проанализируй текст резюме на признаки генерации нейросетью.
Добавь в JSON поля "ai_detected": boolean и "raw_score": 0..100.
Если обнаружено использование нейросети ("ai_detected": true), снизь score ровно в 2 раза (score = Math.round(raw_score / 2)) и укажи это в summary и gaps.`;
    }

    let chatId = "";
    if (is_preview) {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: projRow?.id || pid,
        companyId: projRow?.company_id,
      });
      chatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRresume", rawEmpId, "RRresume");
    } else if (candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
      chatId = `${candPubId}_RRresume`;
    } else if (demo_user_id) {
      chatId = formatDemoChatId(demo_user_id, "RRresume");
    } else {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: projRow?.id || pid,
        companyId: projRow?.company_id,
      });
      chatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRresume", rawEmpId, "RRresume");
    }

    let aiText = "";
    try {
      aiText = await callProTalkLLM(
        isDemo ? "demo_resume" : "resume",
        llmMessages,
        chatId,
        undefined,
        undefined,
        promptKey,
        isProMax
      );
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "resume_screen", req.body, candidate_id);
      return res.status(502).json({
        ok: false,
        job_id: failedJobId,
        retryable: true,
        error: `Ошибка вызова нейросети: ${err?.message || "Не удалось получить ответ"}. Попробуйте повторить с RR ProMax.`,
      });
    }

    const obj = tryParseLLMJson<any>(aiText);
    const rawParsedScore =
      obj && typeof obj === "object" && (obj.raw_score !== undefined || obj.score !== undefined)
        ? Math.max(0, Math.min(100, Number(obj.raw_score ?? obj.score) || 0))
        : text.length > 100
        ? 80
        : 60;
    let score =
      obj && typeof obj === "object" && obj.score !== undefined
        ? Math.max(0, Math.min(100, Number(obj.score) || 0))
        : rawParsedScore;

    const aiDetected = Boolean(antiAiEnabled && (obj?.ai_detected === true || detectAiTextHeuristic(text)));
    let summary = obj?.summary ? String(obj.summary).slice(0, 1500) : `Резюме кандидата обработано на ${score}%.`;
    const strengths = Array.isArray(obj?.strengths) ? obj.strengths.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : ["Предоставлены данные о кандидате"];
    const gaps = Array.isArray(obj?.gaps) ? obj.gaps.slice(0, 8).map((s: any) => String(s).slice(0, 300)) : ["Рекомендуется добавить детальный опыт и проекты"];

    if (aiDetected) {
      const baseScore = obj?.raw_score !== undefined ? rawParsedScore : (score > 0 ? score : rawParsedScore);
      score = Math.round(baseScore / 2);
      if (!/нейросет|ии|ai/i.test(summary)) {
        summary += ` Защита от нейросетей: обнаружены признаки генерации текста ИИ — итоговый балл снижен в 2 раза (${baseScore} → ${score}).`;
      }
      if (!gaps.some((g: string) => /нейросет|ии/i.test(g))) {
        gaps.unshift(`Обнаружены признаки генерации текста нейросетью — балл снижен в 2 раза (${baseScore} → ${score})`);
      }
    }

    const deterministicExtracted = extractFieldsFromResumeText(text, customDefs);
    const mergedFields = mergeCandidateFields(
      deterministicExtracted.standard_fields,
      obj?.standard_fields || {},
      deterministicExtracted.custom_fields,
      obj?.custom_fields || {},
      customDefs
    );

    const resultPayload = {
      score,
      raw_score: rawParsedScore,
      ai_detected: aiDetected,
      anti_ai_enabled: antiAiEnabled,
      summary: summary.slice(0, 1500),
      strengths,
      gaps,
      standard_fields: mergedFields.standard_fields,
      custom_fields: mergedFields.custom_fields,
      custom_fields_defs: customDefs,
    };

    if (db) {
      try {
        if (title && !is_preview && !isDemo) {
          await db.run("UPDATE job_titles SET usage_count = COALESCE(usage_count, 0) + 1 WHERE title = ?", [String(title).trim()]);
        }
        if (!is_preview && !isDemo && candidate_id) {
          const existingCand = (await findCandidateRow(db, candidate_id)) || cand;
          if (existingCand) {
            await persistCandidateAfterResume({
              db,
              existingCand,
              projRow,
              pid,
              text,
              score,
              summary,
              resultPayload,
              mergedFields,
              customDefs,
              incomingResumeUrl: String(req.body?.resume_url || req.body?.resumeUrl || "").trim(),
            });
          }
        }
      } catch (e) {
        console.warn("[screen-resume] Candidate persistence warning:", e);
      }
    }

    const jobId = `job-res-${Date.now()}`;
    const status = isProMax ? "fallback_succeeded" : "primary_succeeded";
    candidateAiJobStore.set(jobId, {
      id: jobId,
      candidate_id,
      task_type: "resume_screen",
      status,
      result: resultPayload,
      payload: req.body,
    });

    return res.json({
      ok: true,
      job_id: jobId,
      status,
      terminal: true,
      score,
      raw_score: rawParsedScore,
      ai_detected: aiDetected,
      anti_ai_enabled: antiAiEnabled,
      is_preview: Boolean(is_preview),
      standard_fields: mergedFields.standard_fields,
      custom_fields: mergedFields.custom_fields,
      custom_fields_defs: customDefs,
      result: resultPayload,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

resumeAndIngestionRouter.post(
  ["/ai-demo-screen-resume", "/ai-interview-screen-resume", "/ai-interview-screen-resume-v2"],
  handleScreenResume
);

resumeAndIngestionRouter.post("/ai-ingest-document", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const {
      entity,
      entity_id,
      file_url,
      filename,
      file_type: reqFileType,
      demo_user_id,
      candidate_id,
      employer_id,
      employer_public_id,
      chat_id,
      use_promax,
      max_chars,
    } = req.body || {};

    const isCompany = entity === "company" || (chat_id && String(chat_id).includes("RRcompany"));
    const isTraining = entity === "training" || (chat_id && String(chat_id).includes("RRschool"));
    const isResume = entity === "resume" || Boolean(candidate_id) || (chat_id && String(chat_id).includes("RRresume")) || (chat_id && String(chat_id).includes("RRrezume"));
    const isVacancy = entity === "vacancy" || entity === "project" || (!isCompany && !isTraining && !isResume);
    let chatId = chat_id ? String(chat_id).trim() : "";

    const resolvedEmpId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      projectId: !isCompany && !isResume ? entity_id : undefined,
      companyId: isCompany ? entity_id : undefined,
    });

    if (!chatId) {
      if (isResume) {
        if (candidate_id) {
          const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
          chatId = `${candPubId}_RRresume`;
        } else if (demo_user_id) {
          chatId = formatDemoChatId(demo_user_id, "RRresume");
        } else if (employer_id || employer_public_id || entity_id) {
          chatId = formatEmployerChatId(resolvedEmpId, "RRresume");
        } else {
          chatId = formatDemoChatId("100007", "RRresume");
        }
      } else if (demo_user_id && !employer_id && !employer_public_id) {
        chatId = formatDemoChatId(demo_user_id, isTraining ? "RRschool" : isCompany ? "RRcompany" : "RRfile");
      } else if (isCompany) {
        chatId = formatEmployerChatId(resolvedEmpId, "RRcompany");
      } else if (isTraining) {
        chatId = formatEmployerChatId(resolvedEmpId, "RRschool");
      } else if (isVacancy) {
        chatId = formatEmployerChatId(resolvedEmpId, "RRvacancy");
      } else {
        chatId = formatEmployerChatId(resolvedEmpId, "RRfile");
      }
    }

    const { directFileUrl, detectedFileType } = await resolveIngestFileUrlAndType(
      req,
      db,
      String(file_url || ""),
      filename,
      reqFileType
    );

    let extractedText: string | null = null;
    if (["txt", "text", "md", "csv", "json"].includes(detectedFileType) && directFileUrl && /^https?:\/\//i.test(directFileUrl)) {
      try {
        const textFetchRes = await fetch(directFileUrl);
        if (textFetchRes.ok) {
          const rawTxt = await textFetchRes.text();
          if (rawTxt && rawTxt.trim().length > 10) {
            extractedText = rawTxt.trim();
          }
        }
      } catch {}
    }

    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const ingestPromptKey = isCompany
      ? isProMax ? "company_ingestion_promax" : "company_ingestion"
      : isProMax ? "document_ingestion_promax" : "document_ingestion";
    const promptData = await getProTalkPrompt(ingestPromptKey, undefined, isProMax);
    const botId = promptData.bot?.bot_id || (isProMax ? 67370 : 66337);
    const botToken = String(promptData.bot?.bot_token || (isProMax ? "XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY" : "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs"))
      .replace(new RegExp(`^${botId}_`), "")
      .trim();
    const fnId = promptData.function_id && Number(promptData.function_id) !== 763 ? Number(promptData.function_id) : 369;

    let logChatId = "";
    if (isResume && candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
      logChatId = `${candPubId}_RRresume`;
    } else if (isResume && demo_user_id) {
      logChatId = formatDemoChatId(demo_user_id, "RRresume");
    } else if (chatId && /^(?:demo)?\d{5,15}_(?:RR[a-zA-Z0-9_-]+|cheklist|cases|prod|prof|system)$/i.test(chatId)) {
      logChatId = chatId;
    } else {
      const rawActorForFile = chatId || resolvedEmpId || demo_user_id || "100007";
      logChatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRfile", rawActorForFile, "RRfile");
    }
    chatId = logChatId;
    const resolvedLogUrl =
      promptData.log_url !== undefined && promptData.log_url !== null
        ? String(promptData.log_url).trim()
        : "https://docs.google.com/spreadsheets/d/1HAhAbwKRIXPFi8KhqLhDW6-Ha2tjQf4pj8rrSGPML8A/edit?usp=sharing";

    const channelName = isCompany ? "company_file_ingest" : isTraining ? "training_file_ingest" : isVacancy ? "vacancy_file_ingest" : "resume_file_ingest";
    const functionParams = {
      url: directFileUrl,
      file_type: detectedFileType,
      functions_base_id: "appkq3HrzrxYxoAV8",
      bot_id: botId,
      bot_token: botToken,
      sheet_number: 0,
      sheet_name: "",
      log_url: resolvedLogUrl,
      chat_id: logChatId,
      log_chat_id: logChatId,
    };

    if (extractedText) {
      const tokensInEst = Math.max(10, Math.ceil(String(directFileUrl || "").length / 3));
      const tokensOutEst = Math.ceil(extractedText.length / 3);
      await saveAILog({
        channel_id: logChatId,
        user_social_id: extractUserSocialId(logChatId),
        user_message: `[Function ${fnId} / Direct] Распознавание файла (${detectedFileType}): ${directFileUrl}`,
        bot_reply: extractedText.slice(0, 4000),
        channel_name: channelName,
        bot_id: String(botId),
        llm: `function_${fnId}`,
        api_key: `${botId}_${botToken}`,
        tokens_in_source: tokensInEst,
        tokens_out_source: tokensOutEst,
        tokens_total: tokensInEst + tokensOutEst,
        function_call_params: functionParams,
        server_name: "ProTalk_Function_369",
      });
    }

    if (!extractedText && directFileUrl && /^https?:\/\//i.test(directFileUrl)) {
      let fnErrorMsg = "";
      try {
        const fnPayload = {
          function_id: fnId,
          functions_base_id: "appkq3HrzrxYxoAV8",
          bot_id: botId,
          bot_token: botToken,
          parameters: functionParams,
          arguments: functionParams,
        };
        const primaryFnUrl =
          promptData.bot?.api_url && promptData.bot.api_url.includes("run_function")
            ? promptData.bot.api_url
            : "https://api.pro-talk.ru/api/v1.0/run_function";

        const fnRes = await fetch(primaryFnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${botToken}`,
            "X-Token": botToken,
          },
          body: JSON.stringify(fnPayload),
        }).catch(() => null);

        if (fnRes && fnRes.ok) {
          const rawBodyText = await fnRes.text().catch(() => "");
          let fnData: any = null;
          try {
            fnData = rawBodyText ? JSON.parse(rawBodyText) : null;
          } catch {
            fnData = rawBodyText;
          }
          if (typeof fnData === "string" && fnData.trim().length > 0) {
            extractedText = fnData.trim();
          } else if (typeof fnData === "object" && fnData !== null && fnData.status !== "error" && !fnData.error) {
            const rawResult = fnData?.result?.text || fnData?.result || fnData?.data?.text || fnData?.data || fnData?.text || fnData?.output;
            if (typeof rawResult === "string" && rawResult.trim().length > 0) extractedText = rawResult.trim();
            else if (typeof rawResult === "object" && rawResult !== null) {
              extractedText = typeof rawResult.text === "string" ? rawResult.text : JSON.stringify(rawResult, null, 2);
            }
          } else if (typeof fnData === "object" && fnData !== null && (fnData.error || fnData.status === "error")) {
            fnErrorMsg = String(fnData.error || fnData.message || "Function error");
          }
        } else if (fnRes) {
          fnErrorMsg = `HTTP ${fnRes.status}`;
        } else {
          fnErrorMsg = "Network error calling run_function";
        }
      } catch (fErr: any) {
        fnErrorMsg = fErr?.message || String(fErr);
      }

      const reqSummary = JSON.stringify(functionParams);
      const tokensInEst = Math.max(15, Math.ceil(reqSummary.length / 3));
      const tokensOutEst = extractedText ? Math.ceil(extractedText.length / 3) : 0;
      await saveAILog({
        channel_id: logChatId,
        user_social_id: extractUserSocialId(logChatId),
        user_message: `[Function ${fnId}] Распознавание файла (${detectedFileType}): ${directFileUrl}`,
        bot_reply: extractedText ? extractedText.slice(0, 4000) : fnErrorMsg || "Пустой ответ функции",
        channel_name: channelName,
        bot_id: String(botId),
        llm: `function_${fnId}`,
        api_key: `${botId}_${botToken}`,
        tokens_in_source: tokensInEst,
        tokens_out_source: tokensOutEst,
        tokens_total: tokensInEst + tokensOutEst,
        function_error: fnErrorMsg || undefined,
        function_call_params: functionParams,
        server_name: "ProTalk_Function_369",
      });
    }

    if (extractedText && extractedText.trim().length > 0) {
      const charLimit = max_chars && Number(max_chars) > 0 ? Number(max_chars) : 35000;
      const finalText = extractedText.slice(0, charLimit);
      let candidateResumeUrl = "";

      if (isResume && (candidate_id || entity_id) && db) {
        try {
          const candId = candidate_id || entity_id;
          const cleanCandId = String(candId).replace(/^candidate/i, "").trim();
          const cand = await db.get(
            "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
            [String(candId), String(candId), cleanCandId, cleanCandId]
          );
          if (cand) {
            const host = req.get("x-forwarded-host") || req.get("host") || "localhost:3000";
            const proto = req.get("x-forwarded-proto") || req.protocol || "https";
            let fullUploadedFileUrl = directFileUrl || file_url || "";
            if (fullUploadedFileUrl && fullUploadedFileUrl.startsWith("/")) {
              fullUploadedFileUrl = `${proto}://${host}${fullUploadedFileUrl}`;
            }

            const textExtracted = extractFieldsFromResumeText(finalText, [], { uploadedFileUrl: fullUploadedFileUrl || undefined });
            const curStd = extractStandardFieldsFromCandidateRow(cand);
            candidateResumeUrl = fullUploadedFileUrl || textExtracted.standard_fields.resume_url || curStd.resume_url || "";
            const updatedStd = {
              ...curStd,
              ...textExtracted.standard_fields,
              resume_url: candidateResumeUrl || curStd.resume_url || "",
            };
            const curCrm = cand.crm_stage || "registration";
            const isManual = isStageManual(cand.crm_stage_manual);
            const nextStage = isManual ? curCrm : curCrm === "registration" || !curCrm ? "screening" : curCrm;

            await db.run(
              `UPDATE candidates SET resume_text = ?, resume_url = ?, standard_fields_json = ?, crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?`,
              [finalText, candidateResumeUrl || cand.resume_url || "", JSON.stringify(updatedStd), nextStage, nextStage, nextStage, cand.id]
            );
          }
        } catch (candUpdateErr) {
          console.warn("[/api/ai-ingest-document] Candidate resume update warning:", candUpdateErr);
        }
      }

      return res.json({
        ok: true,
        text: finalText,
        result: finalText,
        reply: finalText,
        data: { text: finalText },
        file_url: directFileUrl || file_url || "",
        resume_url: candidateResumeUrl || directFileUrl || file_url || "",
        filename: filename || "",
        chat_id: chatId,
        source: "function_369_direct",
        characters: finalText.length,
      });
    }

    return res.status(422).json({
      ok: false,
      error: "Функция 369 не смогла распознать текст из указанного документа или вернула пустой ответ. Проверьте доступность ссылки на файл.",
      file_url: directFileUrl || file_url || "",
      filename: filename || "",
      chat_id: chatId,
      source: "function_369_direct",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

resumeAndIngestionRouter.post("/evaluate-situations", async (req: Request, res: Response) => {
  const { candidateId, answers } = req.body;
  const dbInst = await getProTalkDB();
  const candidate = dbInst
    ? await dbInst.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ?", [candidateId, String(candidateId)])
    : null;
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const project =
    dbInst && (candidate.project_id || candidate.projectId)
      ? await dbInst.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ?", [
          candidate.project_id || candidate.projectId,
          String(candidate.project_id || candidate.projectId),
        ])
      : null;

  const candPubId = await resolveCandidate6DigitPublicId(candidate.id || candidateId, dbInst);
  let situationsScore = 78;
  try {
    const prompt = `Проанализируй ролевые ответы кандидата на 3 практические ситуации по специальности "${candidate.roleName || candidate.role_name}".
Ответы кандидата:
${(answers || []).map((a: any, i: number) => `Кейс ${i + 1}: "${a.question}"\nОтвет: "${a.answer}"`).join("\n\n")}

Оцени практические навыки соискателя от 0 до 100 баллов и дай краткий анализ на русском языке (2-3 предложения).
Верни ТОЛЬКО JSON: { "situationsScore": число_от_0_до_100, "feedback": "анализ кейсов" }`;
    const text = await callProTalkLLM("situations", [{ role: "user", content: prompt }], `${candPubId}_cases`);
    const parsed = tryParseLLMJson<any>(text) || {};
    if (parsed.situationsScore !== undefined) situationsScore = Number(parsed.situationsScore);
  } catch {}

  if (!candidate.scores) {
    candidate.scores = {
      interviewScore: 70,
      resumeScore: 70,
      checklistPoints: 7,
      roleplayPoints: 7,
      overallScore: 70,
      assessmentSummary: "",
    };
  }
  candidate.scores.situationsScore = situationsScore;
  candidate.scores.roleplayPoints = Math.round(situationsScore / 10);

  const rScore = candidate.scores.resumeScore !== undefined ? candidate.scores.resumeScore : 70;
  const cScore = candidate.scores.checklistScore !== undefined ? candidate.scores.checklistScore : 80;
  const sScore = situationsScore;
  const overallScore = Math.round((rScore + cScore + sScore) / 3);

  candidate.scores.interviewScore = Math.round((cScore + sScore) / 2);
  candidate.scores.overallScore = overallScore;
  candidate.scores.assessmentSummary = `Анализ резюме: ${rScore} баллов. Теоретический чек-лист: ${cScore} баллов. Кейс-тренажер: ${situationsScore} баллов.`;
  candidate.currentStage = "scoring";

  let trainingPlan: any[] = [];
  try {
    const trainingPrompt = `Создай индивидуальный план онбординга и обучения для кандидата на вакансию "${candidate.roleName || candidate.role_name}" в "${project ? project.companyName || project.company_name : "Работодатель"}".
Оценка ИИ: ${candidate.scores.assessmentSummary}
Верни строго JSON массив из 3 блоков ("Профессиональное обучение", "Обучение продукту", "Обучение процессам и мотивации").`;
    const responseTrText = await callProTalkLLM("school", [{ role: "user", content: trainingPrompt }], `${candPubId}_RRschool`, undefined, project?.id, "school");
    const parsedPlan = tryParseLLMJson<any>(responseTrText);
    if (Array.isArray(parsedPlan)) trainingPlan = parsedPlan;
  } catch {}

  if (!trainingPlan || trainingPlan.length === 0) {
    trainingPlan = [
      { title: "Профессиональное обучение", description: `Навыки для роли ${candidate.roleName || candidate.role_name || "Специалист"}`, lessons: [{ id: "prof_v", title: "Коммуникации", content: "Базовые стандарты работы с клиентами и задачами.", isCompleted: false }] },
      { title: "Обучение продукту", description: `Регламенты ${project?.companyName || project?.company_name || "компании"}`, lessons: [{ id: "prod_v", title: "Продукт компании", content: "Ключевая ценность и преимущества продукта.", isCompleted: false }] },
      { title: "Обучение процессам и мотивации", description: "Внутренние CRM регламенты", lessons: [{ id: "proc_v", title: "Ежедневная активность и KPI", content: "Регулярная отчётность в CRM.", isCompleted: false }] },
    ];
  }

  if (trainingPlan.length >= 3) {
    const types: ("professional" | "product" | "system")[] = ["professional", "product", "system"];
    trainingPlan.forEach((block: any, idx: number) => {
      if (block.lessons && block.lessons[0]) {
        block.lessons[0].quizzes = getShuffled20Questions(
          types[idx] || "professional",
          candidate.roleName || candidate.role_name,
          project ? project.companyName || project.company_name : "Работодатель"
        );
      }
    });
  }

  candidate.trainingPlan = trainingPlan;
  if (dbInst) await saveCandidateToProTalkDB(dbInst, candidate);

  res.json({
    overallScore,
    resumeScore: rScore,
    checklistScore: cScore,
    situationsScore: sScore,
    assessmentSummary: candidate.scores.assessmentSummary,
    trainingPlan,
  });
});

resumeAndIngestionRouter.post("/evaluate-training-block", async (req: Request, res: Response) => {
  const { candidateId, blockIndex, answers } = req.body;
  const dbInst = await getProTalkDB();
  const candidate = dbInst
    ? await dbInst.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ?", [candidateId, String(candidateId)])
    : null;
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  if (!candidate.trainingPlan || !candidate.trainingPlan[blockIndex]) {
    return res.status(400).json({ error: "Training block not found in candidate training plan" });
  }
  const block = candidate.trainingPlan[blockIndex];
  if (!block.lessons || block.lessons.length === 0) {
    return res.status(400).json({ error: "Lessons not found in this training block" });
  }

  const lesson = block.lessons[0];
  let selectScore = 0;
  const selectQuestions = (answers || []).filter((q: any) => q.type === "select");
  const textQuestions = (answers || []).filter((q: any) => q.type === "text" || !q.type);

  selectQuestions.forEach((q: any) => {
    const original = (lesson.quizzes || []).find((orig: any) => orig.question === q.question);
    const correctAns = original ? original.correctAnswer : q.correctAnswer;
    if (q.userAnswer && correctAns && q.userAnswer.trim().toLowerCase() === correctAns.trim().toLowerCase()) {
      selectScore += 5;
    }
  });
  selectScore = Math.min(50, selectScore);

  let textScore = 0;
  let feedback = `Проверка раздела "${block.title}" успешно завершена!`;
  let proTalkSucceeded = false;

  if (textQuestions.length > 0) {
    try {
      const textAnswersString = textQuestions
        .map((q: any, i: number) => `Вопрос ${i + 1}: "${q.question}"\nОтвет соискателя: "${q.userAnswer || "Нет ответа"}"`)
        .join("\n\n");
      const prompt = `Проверь открытые ответы стажера на тему "${block.title}". Должность "${candidate.roleName || candidate.role_name}".
ОТВЕТЫ КАНДИДАТА:\n${textAnswersString}\nВерни ТОЛЬКО JSON: { "textScore": число_от_0_до_50, "feedback": "текст обратной связи" }`;
      const candPubId = await resolveCandidate6DigitPublicId(candidate.id || candidateId, dbInst);
      const text = await callProTalkLLM("school", [{ role: "user", content: prompt }], `${candPubId}_RRschool`);
      const parsed = tryParseLLMJson<any>(text) || {};
      if (parsed.textScore !== undefined) textScore = Math.min(50, Math.max(0, Number(parsed.textScore)));
      if (parsed.feedback) feedback = parsed.feedback;
      proTalkSucceeded = true;
    } catch {}
  }

  if (!proTalkSucceeded) {
    textQuestions.forEach((q: any) => {
      const len = (q.userAnswer || "").trim().length;
      if (len > 35) textScore += 5;
      else if (len > 15) textScore += 3;
      else if (len > 0) textScore += 1;
    });
    textScore = Math.min(50, textScore);
  }

  const overallScore = selectScore + textScore;
  const isPassed = overallScore === 100;
  lesson.isCompleted = isPassed;
  lesson.score = overallScore;
  lesson.quizFeedback = isPassed
    ? feedback
    : `Вы набрали ${overallScore} из 100 баллов. Для перехода к следующему разделу необходимо набрать 100 баллов.\n\nКураторский разбор: ${feedback}`;
  lesson.quizzes = answers;

  if (candidate.trainingPlan.every((b: any) => b.lessons && b.lessons.every((l: any) => l.isCompleted))) {
    candidate.currentStage = "certified";
  }
  if (dbInst) await saveCandidateToProTalkDB(dbInst, candidate);

  res.json({
    overallScore,
    feedback: lesson.quizFeedback,
    updatedPlan: candidate.trainingPlan,
    isCertified: candidate.currentStage === "certified",
  });
});

resumeAndIngestionRouter.post("/vacancy-consultant-chat", async (req: Request, res: Response) => {
  const { projectId, messages, userQuestion } = req.body;
  const dbInst = await getProTalkDB();
  const project = dbInst
    ? (await dbInst.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ?", [
        projectId,
        String(projectId),
        projectId,
      ])) || (await dbInst.get("SELECT * FROM projects ORDER BY created_at DESC LIMIT 1"))
    : null;

  const companyName = project?.company_name || project?.companyName || "Наша Компания";
  const roleName = project?.role_name || project?.roleName || "Специалист";
  const salaryTerms = project?.salary_terms || project?.salaryTerms || "Конкурентные условия";
  const scheduleTerms = project?.schedule_terms || project?.scheduleTerms || "Гибкий график";
  const wiki = project?.custom_wiki || project?.customWiki || "Обучение за счет компании";

  try {
    const historyText = Array.isArray(messages)
      ? messages.map((m: any) => `${m.sender === "candidate" ? "Кандидат" : "Робот-Консультант"}: ${m.text}`).join("\n")
      : "";

    const prompt = `Ты — Робот-Консультант RR. Презентуй вакансию кандидату.\nКомпания: ${companyName}\nДолжность: ${roleName}\nОплата: ${salaryTerms}\nГрафик: ${scheduleTerms}\nБаза знаний: ${wiki}\nИстория:\n${historyText}\nВопрос: "${userQuestion}"\nОтветь кратко (2–4 предложения) без капслока.`;
    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "consultant_presentation_promax" : "consultant_presentation";
    const actorRef =
      req.body?.candidate_id
        ? `${await resolveCandidate6DigitPublicId(req.body.candidate_id, dbInst)}_RRchat`
        : req.body?.demo_user_id
        ? formatDemoChatId(req.body.demo_user_id, "RRchat")
        : project?.public_id
        ? String(project.public_id)
        : undefined;
    const reply = await callProTalkLLM("chat", [{ role: "user", content: prompt }], actorRef, undefined, project?.public_id || projectId, promptKey, isProMax);
    return res.json({ reply: reply.trim() });
  } catch {}

  res.json({
    reply: `В компании ${companyName} на должности "${roleName}" предусмотрены условия: ${salaryTerms}, график: ${scheduleTerms}. Предлагаем перейти к прохождению собеседования!`,
  });
});
