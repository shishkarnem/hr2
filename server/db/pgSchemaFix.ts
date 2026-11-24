import { executeProTalkQuery, queryAllPg } from "./protalkDb";

/**
 * Ensures PostgreSQL BD ProTalk (hr3) has complete schemas for all tables,
 * zero duplicate bloat, proper UNIQUE indexes for ON CONFLICT upserts,
 * and synchronized identity/serial sequences.
 */
export async function ensurePgSchemaAndHygiene(): Promise<{
  alteredTables: string[];
  deduped: Record<string, number>;
  sequencesReset: string[];
}> {
  const alteredTables: string[] = [];
  const deduped: Record<string, number> = {};
  const sequencesReset: string[] = [];

  // 1. Add missing columns to skeleton tables & ensure crm_dialog_templates exists
  const ddlStatements: Array<{ name: string; sql: string }> = [
    {
      name: "company_members",
      sql: `ALTER TABLE IF EXISTS company_members
        ADD COLUMN IF NOT EXISTS company_id TEXT,
        ADD COLUMN IF NOT EXISTS employer_id TEXT,
        ADD COLUMN IF NOT EXISTS owner_employer_id TEXT,
        ADD COLUMN IF NOT EXISTS role TEXT,
        ADD COLUMN IF NOT EXISTS permissions_json TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS created_at TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TEXT;`,
    },
    {
      name: "candidate_sessions",
      sql: `ALTER TABLE IF EXISTS candidate_sessions
        ADD COLUMN IF NOT EXISTS candidate_id TEXT,
        ADD COLUMN IF NOT EXISTS token TEXT,
        ADD COLUMN IF NOT EXISTS expires_at TEXT,
        ADD COLUMN IF NOT EXISTS created_at TEXT;`,
    },
    {
      name: "interviews",
      sql: `ALTER TABLE IF EXISTS interviews
        ADD COLUMN IF NOT EXISTS candidate_id TEXT,
        ADD COLUMN IF NOT EXISTS project_id TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS summary TEXT,
        ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS created_at TEXT;`,
    },
    {
      name: "ai_jobs",
      sql: `ALTER TABLE IF EXISTS ai_jobs
        ADD COLUMN IF NOT EXISTS job_type TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS payload_json TEXT,
        ADD COLUMN IF NOT EXISTS result_json TEXT,
        ADD COLUMN IF NOT EXISTS error TEXT,
        ADD COLUMN IF NOT EXISTS created_at TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TEXT;`,
    },
    {
      name: "payments",
      sql: `ALTER TABLE IF EXISTS payments
        ADD COLUMN IF NOT EXISTS employer_id TEXT,
        ADD COLUMN IF NOT EXISTS company_name TEXT,
        ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS item_type TEXT,
        ADD COLUMN IF NOT EXISTS item_name TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS data_json TEXT,
        ADD COLUMN IF NOT EXISTS created_at TEXT;`,
    },
    {
      name: "landing_theme_presets",
      sql: `ALTER TABLE IF EXISTS landing_theme_presets
        ADD COLUMN IF NOT EXISTS employer_id TEXT,
        ADD COLUMN IF NOT EXISTS name TEXT,
        ADD COLUMN IF NOT EXISTS theme_json TEXT,
        ADD COLUMN IF NOT EXISTS created_at TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TEXT;`,
    },
    {
      name: "mailing_logs",
      sql: `ALTER TABLE IF EXISTS mailing_logs
        ADD COLUMN IF NOT EXISTS recipient_id TEXT,
        ADD COLUMN IF NOT EXISTS type TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS meta_json TEXT,
        ADD COLUMN IF NOT EXISTS timestamp BIGINT,
        ADD COLUMN IF NOT EXISTS created_at TEXT;`,
    },
    {
      name: "crm_constructor_settings",
      sql: `ALTER TABLE IF EXISTS crm_constructor_settings
        ADD COLUMN IF NOT EXISTS employer_id TEXT,
        ADD COLUMN IF NOT EXISTS settings_json TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TEXT;`,
    },
    {
      name: "crm_dialog_templates",
      sql: `CREATE TABLE IF NOT EXISTS crm_dialog_templates (
        id TEXT PRIMARY KEY,
        employer_id TEXT,
        templates_json TEXT,
        updated_at TEXT
      );`,
    },
    {
      name: "training_blocks_cols",
      sql: `ALTER TABLE IF EXISTS training_blocks
        ADD COLUMN IF NOT EXISTS block_key TEXT,
        ADD COLUMN IF NOT EXISTS content TEXT,
        ADD COLUMN IF NOT EXISTS materials_md TEXT,
        ADD COLUMN IF NOT EXISTS materials_links TEXT,
        ADD COLUMN IF NOT EXISTS materials_files TEXT,
        ADD COLUMN IF NOT EXISTS total_score BIGINT,
        ADD COLUMN IF NOT EXISTS ai_generated_at TEXT;`,
    },
    {
      name: "training_stage_tests_cols",
      sql: `ALTER TABLE IF EXISTS training_stage_tests
        ADD COLUMN IF NOT EXISTS questions TEXT,
        ADD COLUMN IF NOT EXISTS passing_score BIGINT,
        ADD COLUMN IF NOT EXISTS pass_score BIGINT,
        ADD COLUMN IF NOT EXISTS questions_json TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT;`,
    },
    {
      name: "projects_alias_cols",
      sql: `ALTER TABLE IF EXISTS projects
        ADD COLUMN IF NOT EXISTS training_prof_text TEXT,
        ADD COLUMN IF NOT EXISTS training_professional_text TEXT,
        ADD COLUMN IF NOT EXISTS training_system_text TEXT,
        ADD COLUMN IF NOT EXISTS training_systems_text TEXT,
        ADD COLUMN IF NOT EXISTS training_intro_text TEXT,
        ADD COLUMN IF NOT EXISTS training_product_text TEXT,
        ADD COLUMN IF NOT EXISTS training_wiki_text TEXT,
        ADD COLUMN IF NOT EXISTS training_regulations_text TEXT,
        ADD COLUMN IF NOT EXISTS max_interviews BIGINT,
        ADD COLUMN IF NOT EXISTS interview_limit BIGINT,
        ADD COLUMN IF NOT EXISTS max_trainings BIGINT,
        ADD COLUMN IF NOT EXISTS training_limit BIGINT,
        ADD COLUMN IF NOT EXISTS role_slug TEXT,
        ADD COLUMN IF NOT EXISTS responsible_employer_id TEXT,
        ADD COLUMN IF NOT EXISTS responsible_employer_ids TEXT;`,
    },
    {
      name: "employers_alias_cols",
      sql: `ALTER TABLE IF EXISTS employers
        ADD COLUMN IF NOT EXISTS contact_name TEXT,
        ADD COLUMN IF NOT EXISTS contact_email TEXT,
        ADD COLUMN IF NOT EXISTS contact_phone TEXT,
        ADD COLUMN IF NOT EXISTS contact_telegram TEXT,
        ADD COLUMN IF NOT EXISTS telegram_username TEXT,
        ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
        ADD COLUMN IF NOT EXISTS notifications_config TEXT;`,
    },
    {
      name: "employers_telegram_chat_id_text",
      sql: `DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'employers'
            AND column_name = 'telegram_chat_id'
            AND data_type <> 'text'
        ) THEN
          ALTER TABLE employers ALTER COLUMN telegram_chat_id TYPE TEXT USING telegram_chat_id::TEXT;
        END IF;
      END $$;`,
    },
    {
      name: "file_storage_alias_cols",
      sql: `ALTER TABLE IF EXISTS file_storage
        ADD COLUMN IF NOT EXISTS name TEXT,
        ADD COLUMN IF NOT EXISTS filename TEXT,
        ADD COLUMN IF NOT EXISTS original_url TEXT,
        ADD COLUMN IF NOT EXISTS url TEXT,
        ADD COLUMN IF NOT EXISTS file_size BIGINT,
        ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
        ADD COLUMN IF NOT EXISTS preserve_alpha BOOLEAN DEFAULT FALSE;`,
    },
    {
      name: "companies_alias_cols",
      sql: `ALTER TABLE IF EXISTS companies
        ADD COLUMN IF NOT EXISTS owner_employer_id TEXT,
        ADD COLUMN IF NOT EXISTS employer_id TEXT,
        ADD COLUMN IF NOT EXISTS description_text TEXT,
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS sites TEXT,
        ADD COLUMN IF NOT EXISTS website TEXT,
        ADD COLUMN IF NOT EXISTS legacy_slug TEXT,
        ADD COLUMN IF NOT EXISTS allslug TEXT;`,
    },
    {
      name: "system_settings",
      sql: `CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    },
    {
      name: "candidates_notifications_col",
      sql: `ALTER TABLE IF EXISTS candidates
        ADD COLUMN IF NOT EXISTS notifications_config TEXT;`,
    },
    {
      name: "push_subscriptions",
      sql: `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_public_id TEXT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        device_label TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    },
    {
      name: "telegram_notification_dedup",
      sql: `CREATE TABLE IF NOT EXISTS telegram_notification_dedup (
        dedup_key TEXT PRIMARY KEY,
        project_id TEXT,
        event_key TEXT,
        chat_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    },
    {
      name: "employer_decision_templates",
      sql: `CREATE TABLE IF NOT EXISTS employer_decision_templates (
        id TEXT PRIMARY KEY,
        employer_id TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    },
    {
      name: "employer_decision_template_state",
      sql: `CREATE TABLE IF NOT EXISTS employer_decision_template_state (
        employer_id TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        last_template_id TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (employer_id, decision_type)
      );`,
    },
    {
      name: "idx_employer_decision_templates_emp_type",
      sql: `CREATE INDEX IF NOT EXISTS idx_emp_dec_tpl_emp_type ON employer_decision_templates (employer_id, decision_type);`,
    },
  ];

  for (const item of ddlStatements) {
    try {
      await executeProTalkQuery(item.sql);
      alteredTables.push(item.name);
    } catch (err: any) {
      console.warn(`[PG Schema Fix] DDL notice (${item.name}):`, err?.message);
    }
  }

  try {
    await executeProTalkQuery(
      `UPDATE projects SET responsible_employer_id = employer_id WHERE (responsible_employer_id IS NULL OR TRIM(responsible_employer_id) = '') AND employer_id IS NOT NULL AND TRIM(employer_id) != '';`
    );
    await executeProTalkQuery(
      `UPDATE projects SET responsible_employer_ids = json_build_array(COALESCE(NULLIF(TRIM(responsible_employer_id), ''), TRIM(employer_id)))::TEXT
       WHERE (responsible_employer_ids IS NULL OR TRIM(responsible_employer_ids) = '' OR TRIM(responsible_employer_ids) = '[]')
         AND COALESCE(NULLIF(TRIM(responsible_employer_id), ''), TRIM(employer_id)) IS NOT NULL
         AND COALESCE(NULLIF(TRIM(responsible_employer_id), ''), TRIM(employer_id)) != '';`
    );
  } catch (err: any) {
    console.warn("[PG Schema Fix] Backfill responsible_employer_id notice:", err?.message);
  }

  // 2. Deduplicate rows & create UNIQUE indexes so ON CONFLICT works natively in PG
  const dedupeTasks: Array<{ table: string; sql: string; indexSql: string }> = [
    {
      table: "transaction_telegram_notifications",
      sql: `DELETE FROM transaction_telegram_notifications a
            USING transaction_telegram_notifications b
            WHERE a.id < b.id AND a.transaction_id = b.transaction_id;`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_tg_notif_tx_id ON transaction_telegram_notifications (transaction_id);`,
    },
    {
      table: "candidate_scores",
      sql: `DELETE FROM candidate_scores a
            USING candidate_scores b
            WHERE a.ctid < b.ctid AND a.candidate_id = b.candidate_id;`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_scores_cid ON candidate_scores (candidate_id);`,
    },
    {
      table: "candidate_checklist_answers_v2",
      sql: `DELETE FROM candidate_checklist_answers_v2 a
            USING candidate_checklist_answers_v2 b
            WHERE a.ctid < b.ctid AND a.candidate_id = b.candidate_id AND COALESCE(a.project_id, '') = COALESCE(b.project_id, '');`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_cand_chk_v2_cid_pid ON candidate_checklist_answers_v2 (candidate_id, project_id);`,
    },
    {
      table: "candidate_situations_answers_v2",
      sql: `DELETE FROM candidate_situations_answers_v2 a
            USING candidate_situations_answers_v2 b
            WHERE a.ctid < b.ctid AND a.candidate_id = b.candidate_id AND COALESCE(a.project_id, '') = COALESCE(b.project_id, '');`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_cand_sit_v2_cid_pid ON candidate_situations_answers_v2 (candidate_id, project_id);`,
    },
    {
      table: "candidate_stage_progress",
      sql: `DELETE FROM candidate_stage_progress a
            USING candidate_stage_progress b
            WHERE (COALESCE(a.best_score, 0) < COALESCE(b.best_score, 0)
               OR (COALESCE(a.best_score, 0) = COALESCE(b.best_score, 0) AND a.ctid < b.ctid))
              AND a.candidate_id = b.candidate_id AND a.stage = b.stage;`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_cand_stage_prog_cid_stg ON candidate_stage_progress (candidate_id, stage);`,
    },
    {
      table: "notification_reads",
      sql: `DELETE FROM notification_reads a
            USING notification_reads b
            WHERE a.ctid < b.ctid AND a.item_id = b.item_id AND a.user_id = b.user_id;`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_reads_item_user ON notification_reads (item_id, user_id);`,
    },
    {
      table: "training_stage_tests",
      sql: `DELETE FROM training_stage_tests a
            USING training_stage_tests b
            WHERE a.ctid < b.ctid AND a.project_id = b.project_id AND a.stage = b.stage;`,
      indexSql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_training_stage_tests_proj_stg ON training_stage_tests (project_id, stage);`,
    },
    {
      table: "employer_tour_state",
      sql: `DELETE FROM employer_tour_state a
            USING employer_tour_state b
            WHERE a.ctid < b.ctid AND COALESCE(a.user_id, '') = COALESCE(b.user_id, '') AND a.section = b.section;`,
      indexSql: `CREATE INDEX IF NOT EXISTS idx_employer_tour_user_sec ON employer_tour_state (user_id, section);`,
    },
    {
      table: "training_blocks",
      sql: `DELETE FROM training_blocks WHERE id IS NULL;`,
      indexSql: `CREATE INDEX IF NOT EXISTS idx_training_blocks_proj_stg ON training_blocks (project_id, stage);`,
    },
    {
      table: "interview_blocks",
      sql: `DELETE FROM interview_blocks WHERE id IS NULL;`,
      indexSql: `CREATE INDEX IF NOT EXISTS idx_interview_blocks_proj_kind ON interview_blocks (project_id, kind);`,
    },
  ];

  for (const task of dedupeTasks) {
    try {
      const delRes = await executeProTalkQuery(task.sql);
      deduped[task.table] = delRes.rowCount || 0;
      await executeProTalkQuery(task.indexSql);
    } catch (err: any) {
      console.warn(`[PG Schema Fix] Dedupe/index notice (${task.table}):`, err?.message);
    }
  }

  // 2b. Install idempotent BEFORE INSERT OR UPDATE PostgreSQL triggers mirroring dual/legacy columns
  await ensureColumnSyncTriggersPg();

  // 2c. Reclaim bloated heap/index pages in transaction_telegram_notifications if > 512 KB
  await compactTransactionTelegramNotificationsPg(false);

  // 3. Ensure system_settings unique key & app_version
  try {
    await executeProTalkQuery(`
      DELETE FROM system_settings a USING system_settings b WHERE a.ctid < b.ctid AND a.key = b.key;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_system_settings_key ON system_settings (key);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_protalk_prompts_key ON protalk_prompts (prompt_key);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_limits_key ON rate_limits (key);
    `);
  } catch {}

  // 4. Synchronize identity / serial sequences across numeric-id PG tables
  const seqTables = [
    "file_storage",
    "file_folders",
    "logs",
    "transaction_telegram_notifications",
    "candidate_checklist_answers_v2",
    "candidate_scores",
    "candidate_situations_answers_v2",
    "candidate_stage_progress",
  ];
  for (const tbl of seqTables) {
    try {
      await executeProTalkQuery(
        `DO $$
         DECLARE
           max_id BIGINT;
           seq_name TEXT;
         BEGIN
           SELECT COALESCE(MAX(id), 0) INTO max_id FROM "${tbl}";
           seq_name := pg_get_serial_sequence('"${tbl}"', 'id');
           IF seq_name IS NOT NULL THEN
             PERFORM setval(seq_name, GREATEST(max_id, 1), true);
           ELSE
             BEGIN
               EXECUTE 'ALTER TABLE "${tbl}" ALTER COLUMN id RESTART WITH ' || (max_id + 1);
             EXCEPTION WHEN others THEN
               NULL;
             END;
           END IF;
         END $$;`
      );
      sequencesReset.push(tbl);
    } catch (err: any) {
      console.warn(`[PG Schema Fix] Sequence reset notice (${tbl}):`, err?.message);
    }
  }

  // 5. Fix corrupted UTF-8 company names / role names and keep candidate role_name synced with live project role_name
  try {
    await executeProTalkQuery(
      `UPDATE companies SET name = 'ООО РобоРекрут Инжиниринг' WHERE public_id = '300004' AND name = 'ООО РобоРекру Инжиниринг';`
    );
    await executeProTalkQuery(
      `UPDATE projects SET company_name = 'РентРОП' WHERE company_public_id = '300047' AND (company_name LIKE '%\uFFFD%' OR company_name != 'РентРОП');`
    );
    await executeProTalkQuery(
      `UPDATE projects SET role_name = TRIM(role_name) WHERE role_name IS NOT NULL AND role_name != TRIM(role_name);`
    );
    await executeProTalkQuery(
      `UPDATE candidates c
       SET role_name = TRIM(p.role_name),
           updated_at = NOW()
       FROM projects p
       WHERE (c.project_id = p.id OR c.project_id = CAST(p.public_id AS TEXT))
         AND p.role_name IS NOT NULL
         AND TRIM(p.role_name) != ''
         AND COALESCE(c.role_name, '') != TRIM(p.role_name);`
    );
  } catch {}

  // 6. Seed/upgrade structured training_summary_evaluation prompts in protalk_prompts
  try {
    const baseSysPrompt = `Ты — куратор корпоративного обучения и оценки персонала платформы «Робот Рекрутер».
На основании переданных кратких саммари и баллов по всем пройденным этапам собеседования (Резюме, Чек-лист, Ситуации, Общая оценка) и всем этапам обучения (Профессия, Продукт, Система) сформируй итоговое экспертное заключение.
Опирайся строго на предоставленные факты и саммари этапов без домыслов и без капслока.
Верни строго валидный JSON без пояснительного текста вокруг:
{
  "score": 0..100,
  "data_completeness": 0..100,
  "verdict": "Краткий вердикт (например: Готов к работе)",
  "summary": "Развернутый связный итоговый вывод по интервью и обучению (4-6 предложений)",
  "completed_stages": ["Список пройденных этапов"],
  "missing_stages": [],
  "mastered_topics": ["Ключевые усвоенные компетенции и темы"],
  "weak_topics": ["Зоны внимания или темы для усиления"],
  "risks": [{"title": "Название риска", "evidence": "Основание из саммари этапов", "severity": "low|medium|high"}],
  "red_flags": [{"title": "Критичный момент при наличии", "evidence": "Основание"}],
  "revision_plan": ["Конкретный шаг адаптации или закрепления 1"],
  "readiness": "Оценка практической готовности к работе на должности",
  "recommendation": "Четкая рекомендация для руководителя по выводу и адаптации"
}`;
    const baseUserTpl = `Кандидат: {{candidate_name}}
Должность: {{role_name}}
Компания: {{company_name}}

Саммари этапов интервью:
{{interview_summaries}}

Саммари этапов обучения:
{{training_summaries}}

Сформируй итоговый отчет строго в указанном JSON-формате без капслока.`;

    const promaxSysPrompt = `Ты — главный эксперт-куратор ProMax по оценке и корпоративному обучению персонала.
На основании саммари всех этапов интервью (Резюме, Чек-лист, Ситуации, Общая оценка) и всех этапов обучения (Профессия, Продукт, Система) сформируй глубокое итоговое заключение для руководителя.
Используй только факты из саммари этапов, без капслока и воды.
Верни строго валидный JSON:
{
  "score": 0..100,
  "data_completeness": 0..100,
  "verdict": "Экспертный вердикт",
  "summary": "Глубокий аналитический итог по кандидату за все этапы интервью и обучения (5-7 предложений)",
  "completed_stages": ["Список пройденных этапов"],
  "missing_stages": [],
  "mastered_topics": ["Подтвержденные сильные компетенции"],
  "weak_topics": ["Темы, требующие наставничества на старте"],
  "risks": [{"title": "Риск", "evidence": "Факт из саммари", "severity": "low|medium|high"}],
  "red_flags": [{"title": "Особое внимание при наличии", "evidence": "Факт"}],
  "revision_plan": ["Шаг плана ввода в должность 1"],
  "readiness": "Готовность к самостоятельному выполнению KPI",
  "recommendation": "Итоговая управленческая рекомендация по найму и адаптации"
}`;

    await executeProTalkQuery(
      `INSERT INTO protalk_prompts (id, prompt_key, prompt_name, bot_id, system_prompt, user_prompt_template, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
       ON CONFLICT (prompt_key) DO UPDATE SET
         system_prompt = EXCLUDED.system_prompt,
         user_prompt_template = EXCLUDED.user_prompt_template,
         updated_at = NOW()
       WHERE COALESCE(protalk_prompts.system_prompt, '') NOT LIKE '%completed_stages%';`,
      ["p-train-sum-1", "training_summary_evaluation", "Итоговое резюме по прохождению обучения кандидатом", "pt-13", baseSysPrompt, baseUserTpl]
    );
    await executeProTalkQuery(
      `INSERT INTO protalk_prompts (id, prompt_key, prompt_name, bot_id, system_prompt, user_prompt_template, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
       ON CONFLICT (prompt_key) DO UPDATE SET
         system_prompt = EXCLUDED.system_prompt,
         user_prompt_template = EXCLUDED.user_prompt_template,
         updated_at = NOW()
       WHERE COALESCE(protalk_prompts.system_prompt, '') NOT LIKE '%completed_stages%';`,
      ["p-train-sum-2", "training_summary_evaluation_promax", "ProMax Итоговое резюме по прохождению обучения кандидатом", "pt-promax-13", promaxSysPrompt, baseUserTpl]
    );
  } catch (pErr: any) {
    console.warn("[PG Schema Fix] training_summary_evaluation prompt seed notice:", pErr?.message);
  }

  const checkTables = await queryAllPg<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  console.log(
    `[PG Schema Fix] Completed on ${checkTables.length} PG tables. Altered: ${alteredTables.length}, Sequences synced: ${sequencesReset.length}, Deduped:`,
    deduped
  );

  return { alteredTables, deduped, sequencesReset };
}

export async function ensureColumnSyncTriggersPg(): Promise<string[]> {
  const installed: string[] = [];
  const triggerDdls: Array<{ name: string; sql: string }> = [
    {
      name: "trg_sync_projects_aliases",
      sql: `
        CREATE OR REPLACE FUNCTION fn_sync_projects_aliases() RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            NEW.training_professional_text := COALESCE(NULLIF(NEW.training_professional_text, ''), NEW.training_prof_text);
            NEW.training_prof_text := COALESCE(NULLIF(NEW.training_prof_text, ''), NEW.training_professional_text);
            NEW.training_systems_text := COALESCE(NULLIF(NEW.training_systems_text, ''), NEW.training_system_text);
            NEW.training_system_text := COALESCE(NULLIF(NEW.training_system_text, ''), NEW.training_systems_text);
            NEW.interview_limit := COALESCE(NEW.interview_limit, NEW.max_interviews);
            NEW.max_interviews := COALESCE(NEW.max_interviews, NEW.interview_limit);
            NEW.training_limit := COALESCE(NEW.training_limit, NEW.max_trainings);
            NEW.max_trainings := COALESCE(NEW.max_trainings, NEW.training_limit);
            NEW.role_slug := COALESCE(NULLIF(NEW.role_slug, ''), NEW.slug);
          ELSE
            IF NEW.training_professional_text IS DISTINCT FROM OLD.training_professional_text AND NEW.training_prof_text IS NOT DISTINCT FROM OLD.training_prof_text THEN
              NEW.training_prof_text := NEW.training_professional_text;
            ELSIF NEW.training_prof_text IS DISTINCT FROM OLD.training_prof_text AND NEW.training_professional_text IS NOT DISTINCT FROM OLD.training_professional_text THEN
              NEW.training_professional_text := NEW.training_prof_text;
            END IF;

            IF NEW.training_systems_text IS DISTINCT FROM OLD.training_systems_text AND NEW.training_system_text IS NOT DISTINCT FROM OLD.training_system_text THEN
              NEW.training_system_text := NEW.training_systems_text;
            ELSIF NEW.training_system_text IS DISTINCT FROM OLD.training_system_text AND NEW.training_systems_text IS NOT DISTINCT FROM OLD.training_systems_text THEN
              NEW.training_systems_text := NEW.training_system_text;
            END IF;

            IF NEW.interview_limit IS DISTINCT FROM OLD.interview_limit AND NEW.max_interviews IS NOT DISTINCT FROM OLD.max_interviews THEN
              NEW.max_interviews := NEW.interview_limit;
            ELSIF NEW.max_interviews IS DISTINCT FROM OLD.max_interviews AND NEW.interview_limit IS NOT DISTINCT FROM OLD.interview_limit THEN
              NEW.interview_limit := NEW.max_interviews;
            END IF;

            IF NEW.training_limit IS DISTINCT FROM OLD.training_limit AND NEW.max_trainings IS NOT DISTINCT FROM OLD.max_trainings THEN
              NEW.max_trainings := NEW.training_limit;
            ELSIF NEW.max_trainings IS DISTINCT FROM OLD.max_trainings AND NEW.training_limit IS NOT DISTINCT FROM OLD.training_limit THEN
              NEW.training_limit := NEW.max_trainings;
            END IF;

            IF NEW.slug IS DISTINCT FROM OLD.slug AND (NEW.role_slug IS NULL OR NEW.role_slug = '') THEN
              NEW.role_slug := NEW.slug;
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_sync_projects_aliases ON projects;
        CREATE TRIGGER trg_sync_projects_aliases BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fn_sync_projects_aliases();
      `,
    },
    {
      name: "trg_sync_training_blocks_aliases",
      sql: `
        CREATE OR REPLACE FUNCTION fn_sync_training_blocks_aliases() RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            NEW.materials_md := COALESCE(NULLIF(NEW.materials_md, ''), NEW.content);
            NEW.content := COALESCE(NULLIF(NEW.content, ''), NEW.materials_md);
            NEW.block_key := COALESCE(NULLIF(NEW.block_key, ''), NEW.stage);
            NEW.stage := COALESCE(NULLIF(NEW.stage, ''), NEW.block_key);
          ELSE
            IF NEW.materials_md IS DISTINCT FROM OLD.materials_md AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
              NEW.content := NEW.materials_md;
            ELSIF NEW.content IS DISTINCT FROM OLD.content AND NEW.materials_md IS NOT DISTINCT FROM OLD.materials_md THEN
              NEW.materials_md := NEW.content;
            END IF;
            IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.block_key IS NOT DISTINCT FROM OLD.block_key THEN
              NEW.block_key := NEW.stage;
            ELSIF NEW.block_key IS DISTINCT FROM OLD.block_key AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
              NEW.stage := NEW.block_key;
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_sync_training_blocks_aliases ON training_blocks;
        CREATE TRIGGER trg_sync_training_blocks_aliases BEFORE INSERT OR UPDATE ON training_blocks FOR EACH ROW EXECUTE FUNCTION fn_sync_training_blocks_aliases();
      `,
    },
    {
      name: "trg_sync_training_stage_tests_aliases",
      sql: `
        CREATE OR REPLACE FUNCTION fn_sync_training_stage_tests_aliases() RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            NEW.questions_json := COALESCE(NULLIF(NEW.questions_json, ''), NEW.questions);
            NEW.questions := COALESCE(NULLIF(NEW.questions, ''), NEW.questions_json);
            NEW.pass_score := COALESCE(NEW.pass_score, NEW.passing_score);
            NEW.passing_score := COALESCE(NEW.passing_score, NEW.pass_score);
          ELSE
            IF NEW.questions_json IS DISTINCT FROM OLD.questions_json AND NEW.questions IS NOT DISTINCT FROM OLD.questions THEN
              NEW.questions := NEW.questions_json;
            ELSIF NEW.questions IS DISTINCT FROM OLD.questions AND NEW.questions_json IS NOT DISTINCT FROM OLD.questions_json THEN
              NEW.questions_json := NEW.questions;
            END IF;
            IF NEW.pass_score IS DISTINCT FROM OLD.pass_score AND NEW.passing_score IS NOT DISTINCT FROM OLD.passing_score THEN
              NEW.passing_score := NEW.pass_score;
            ELSIF NEW.passing_score IS DISTINCT FROM OLD.passing_score AND NEW.pass_score IS NOT DISTINCT FROM OLD.pass_score THEN
              NEW.pass_score := NEW.passing_score;
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_sync_training_stage_tests_aliases ON training_stage_tests;
        CREATE TRIGGER trg_sync_training_stage_tests_aliases BEFORE INSERT OR UPDATE ON training_stage_tests FOR EACH ROW EXECUTE FUNCTION fn_sync_training_stage_tests_aliases();
      `,
    },
    {
      name: "trg_sync_employers_aliases",
      sql: `
        CREATE OR REPLACE FUNCTION fn_sync_employers_aliases() RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            NEW.name := COALESCE(NULLIF(NEW.name, ''), NEW.contact_name);
            NEW.contact_name := COALESCE(NULLIF(NEW.contact_name, ''), NEW.name);
            NEW.email := COALESCE(NULLIF(NEW.email, ''), NEW.contact_email);
            NEW.contact_email := COALESCE(NULLIF(NEW.contact_email, ''), NEW.email);
            NEW.phone := COALESCE(NULLIF(NEW.phone, ''), NEW.contact_phone);
            NEW.contact_phone := COALESCE(NULLIF(NEW.contact_phone, ''), NEW.phone);
            NEW.telegram_username := COALESCE(NULLIF(NEW.telegram_username, ''), NEW.contact_telegram);
            NEW.contact_telegram := COALESCE(NULLIF(NEW.contact_telegram, ''), NEW.telegram_username);
          ELSE
            IF NEW.name IS DISTINCT FROM OLD.name AND NEW.contact_name IS NOT DISTINCT FROM OLD.contact_name THEN NEW.contact_name := NEW.name;
            ELSIF NEW.contact_name IS DISTINCT FROM OLD.contact_name AND NEW.name IS NOT DISTINCT FROM OLD.name THEN NEW.name := NEW.contact_name; END IF;
            IF NEW.email IS DISTINCT FROM OLD.email AND NEW.contact_email IS NOT DISTINCT FROM OLD.contact_email THEN NEW.contact_email := NEW.email;
            ELSIF NEW.contact_email IS DISTINCT FROM OLD.contact_email AND NEW.email IS NOT DISTINCT FROM OLD.email THEN NEW.email := NEW.contact_email; END IF;
            IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.contact_phone IS NOT DISTINCT FROM OLD.contact_phone THEN NEW.contact_phone := NEW.phone;
            ELSIF NEW.contact_phone IS DISTINCT FROM OLD.contact_phone AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN NEW.phone := NEW.contact_phone; END IF;
            IF NEW.telegram_username IS DISTINCT FROM OLD.telegram_username AND NEW.contact_telegram IS NOT DISTINCT FROM OLD.contact_telegram THEN NEW.contact_telegram := NEW.telegram_username;
            ELSIF NEW.contact_telegram IS DISTINCT FROM OLD.contact_telegram AND NEW.telegram_username IS NOT DISTINCT FROM OLD.telegram_username THEN NEW.telegram_username := NEW.contact_telegram; END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_sync_employers_aliases ON employers;
        CREATE TRIGGER trg_sync_employers_aliases BEFORE INSERT OR UPDATE ON employers FOR EACH ROW EXECUTE FUNCTION fn_sync_employers_aliases();
      `,
    },
    {
      name: "trg_sync_file_storage_aliases",
      sql: `
        CREATE OR REPLACE FUNCTION fn_sync_file_storage_aliases() RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            NEW.name := COALESCE(NULLIF(NEW.name, ''), NEW.filename);
            NEW.filename := COALESCE(NULLIF(NEW.filename, ''), NEW.name);
            NEW.original_url := COALESCE(NULLIF(NEW.original_url, ''), NEW.url);
            NEW.url := COALESCE(NULLIF(NEW.url, ''), NEW.original_url);
            NEW.file_size := COALESCE(NEW.file_size, NEW.size_bytes);
            NEW.size_bytes := COALESCE(NEW.size_bytes, NEW.file_size);
          ELSE
            IF NEW.name IS DISTINCT FROM OLD.name AND NEW.filename IS NOT DISTINCT FROM OLD.filename THEN NEW.filename := NEW.name;
            ELSIF NEW.filename IS DISTINCT FROM OLD.filename AND NEW.name IS NOT DISTINCT FROM OLD.name THEN NEW.name := NEW.filename; END IF;
            IF NEW.original_url IS DISTINCT FROM OLD.original_url AND NEW.url IS NOT DISTINCT FROM OLD.url THEN NEW.url := NEW.original_url;
            ELSIF NEW.url IS DISTINCT FROM OLD.url AND NEW.original_url IS NOT DISTINCT FROM OLD.original_url THEN NEW.original_url := NEW.url; END IF;
            IF NEW.file_size IS DISTINCT FROM OLD.file_size AND NEW.size_bytes IS NOT DISTINCT FROM OLD.size_bytes THEN NEW.size_bytes := NEW.file_size;
            ELSIF NEW.size_bytes IS DISTINCT FROM OLD.size_bytes AND NEW.file_size IS NOT DISTINCT FROM OLD.file_size THEN NEW.file_size := NEW.size_bytes; END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS trg_sync_file_storage_aliases ON file_storage;
        CREATE TRIGGER trg_sync_file_storage_aliases BEFORE INSERT OR UPDATE ON file_storage FOR EACH ROW EXECUTE FUNCTION fn_sync_file_storage_aliases();
      `,
    },
  ];

  for (const t of triggerDdls) {
    try {
      await executeProTalkQuery(t.sql);
      installed.push(t.name);
    } catch (err: any) {
      console.warn(`[PG Triggers] Failed installing ${t.name}:`, err?.message);
    }
  }
  return installed;
}

export async function compactTransactionTelegramNotificationsPg(force = false): Promise<{
  beforeBytes: number;
  afterBytes: number;
  rowCount: number;
  method: string;
}> {
  const stats = await queryAllPg<{ bytes: string | number; cnt: string | number }>(
    `SELECT pg_total_relation_size('transaction_telegram_notifications') AS bytes,
            (SELECT COUNT(*) FROM transaction_telegram_notifications) AS cnt;`
  ).catch(() => []);
  const beforeBytes = Number(stats?.[0]?.bytes || 0);
  const rowCount = Number(stats?.[0]?.cnt || 0);

  if (!force && beforeBytes <= 512 * 1024) {
    return { beforeBytes, afterBytes: beforeBytes, rowCount, method: "skipped_already_compact" };
  }

  let method = "vacuum_full";
  try {
    await executeProTalkQuery(`VACUUM FULL transaction_telegram_notifications;`);
  } catch (vacErr: any) {
    method = "truncate_reinsert";
    console.warn("[PG Compact] VACUUM FULL unavailable, using safe atomic copy + TRUNCATE:", vacErr?.message);
    const snapshot = await queryAllPg<any>(
      `SELECT DISTINCT ON (transaction_id) id, transaction_id, chat_id, status, response_data, sent_at
       FROM transaction_telegram_notifications
       WHERE transaction_id IS NOT NULL
       ORDER BY transaction_id, id DESC;`
    );
    if (snapshot.length > 0 || rowCount === 0) {
      await executeProTalkQuery(`TRUNCATE TABLE transaction_telegram_notifications RESTART IDENTITY;`);
      const BATCH = 50;
      for (let i = 0; i < snapshot.length; i += BATCH) {
        const chunk = snapshot.slice(i, i + BATCH);
        const valuesSql = chunk
          .map((r) => {
            const esc = (v: any) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
            return `(${Number(r.id)}, ${esc(r.transaction_id)}, ${esc(r.chat_id)}, ${esc(r.status)}, ${esc(r.response_data)}, ${r.sent_at ? esc(r.sent_at) : "NOW()"})`;
          })
          .join(",\n");
        await executeProTalkQuery(
          `INSERT INTO transaction_telegram_notifications (id, transaction_id, chat_id, status, response_data, sent_at)
           OVERRIDING SYSTEM VALUE VALUES ${valuesSql}
           ON CONFLICT (transaction_id) DO NOTHING;`
        );
      }
      await executeProTalkQuery(
        `SELECT setval(pg_get_serial_sequence('transaction_telegram_notifications', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM transaction_telegram_notifications), 1), 1), true);`
      ).catch(() => {});
    }
  }

  const afterStats = await queryAllPg<{ bytes: string | number; cnt: string | number }>(
    `SELECT pg_total_relation_size('transaction_telegram_notifications') AS bytes,
            (SELECT COUNT(*) FROM transaction_telegram_notifications) AS cnt;`
  ).catch(() => []);

  return {
    beforeBytes,
    afterBytes: Number(afterStats?.[0]?.bytes || 0),
    rowCount: Number(afterStats?.[0]?.cnt || 0),
    method,
  };
}

// Allow running directly via `npx tsx server/db/pgSchemaFix.ts`
const isMain = process.argv[1] && process.argv[1].endsWith("pgSchemaFix.ts");
if (isMain) {
  ensurePgSchemaAndHygiene()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[PG Schema Fix] Fatal error:", err);
      process.exit(1);
    });
}
