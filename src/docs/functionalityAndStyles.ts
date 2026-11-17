/**
 * Архитектура функциональности и Стандарты CSS стилей проекта «Робот Рекрутер (RR)»
 * =================================================================================
 * Данный файл фиксирует в кодовой базе полную функциональную модель платформы,
 * принципы работы с базой данных BD ProTalk (PostgreSQL), логирование нейросети (60 промптов),
 * а также свод строгих правил верстки в стиле Apple Liquid Glass.
 */

export interface SystemArchitectureSpec {
  name: string;
  version: string;
  database: DatabaseSpec;
  aiEngine: AIEngineSpec;
  styling: DesignSystemSpec;
}

export interface DatabaseSpec {
  engine: "PostgreSQL 16 (BD ProTalk Cloud)";
  dbFile: "hr3";
  walMode: true;
  checkpointStrategy: "Direct cloud query & replication to db.pro-talk.ru";
  coreTables: string[];
}

export interface AIEngineSpec {
  botSystem: {
    primaryBotId: number;
    primaryBotAlias: string;
    proMaxBotId: number;
    proMaxBotToken: string;
    proMaxPrefix: string;
  };
  totalPromptsCount: number;
  regularPromptsCount: number;
  proMaxPromptsCount: number;
  costFormulaRubPerToken: number; // 0.00003 RUB (10M tokens = 300 RUB)
  loggingTable: "logs";
  requiredLogFields: string[];
  mandatoryLoggedSources: string[];
}

export interface DesignSystemSpec {
  designLanguage: "Apple Liquid Glass";
  minimumFontSizePx: number; // 14px
  forbiddenColors: string[];
  containerBackdropRule: string;
  bordersRule: string;
  typographyRule: string;
  caseRule: string;
  mobileTabsRule: string;
  mobileLayoutRule: string;
  modalStandardComponent: string;
}

export const PROJECT_SPECIFICATION: SystemArchitectureSpec = {
  name: "Робот Рекрутер (RR) — AI Recruitment & Onboarding Platform",
  version: "2.4.0",
  database: {
    engine: "PostgreSQL 16 (BD ProTalk Cloud)",
    dbFile: "hr3",
    walMode: true,
    checkpointStrategy: "Direct cloud query & replication to db.pro-talk.ru",
    coreTables: [
      "protalk_bots",
      "protalk_prompts",
      "logs",
      "employers",
      "wallets",
      "transactions",
      "payments_robokassa",
      "companies",
      "projects",
      "candidates",
      "candidate_scores",
      "candidate_stage_progress",
      "candidate_training_attempts",
      "candidate_situations_answers_v2",
      "candidate_checklist_answers_v2",
      "interview_systems",
      "interview_blocks",
      "training_stage_tests",
      "training_blocks",
      "file_storage",
      "file_folders",
      "notifications",
      "reviews",
      "faq_items",
      "rate_limits",
      "system_crons",
      "system_triggers"
    ]
  },
  aiEngine: {
    botSystem: {
      primaryBotId: 66337,
      primaryBotAlias: "hr_rr",
      proMaxBotId: 67370,
      proMaxBotToken: "XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY",
      proMaxPrefix: "{id}_RR..."
    },
    totalPromptsCount: 60,
    regularPromptsCount: 30,
    proMaxPromptsCount: 30,
    costFormulaRubPerToken: 0.00003,
    loggingTable: "logs",
    requiredLogFields: [
      "channel_id",
      "user_social_id",
      "user_message",
      "bot_reply",
      "channel_name",
      "bot_id",
      "llm",
      "api_key",
      "tokens_total",
      "tokens_in_source",
      "tokens_out_source",
      "tokens_user",
      "tokens_used_usd",
      "cost_rub",
      "function_error",
      "function_call_params",
      "server_name",
      "rejection_reason",
      "textContent",
      "ai_reply",
      "created_at"
    ],
    mandatoryLoggedSources: [
      "1. ИИ-чат на главной странице (маршрут /api/employer-assist, промпты hr_assistant / hr_assistant_promax)",
      "2. Демо интервью (резюме demo_resume_screening, чеклист demo_checklist_evaluation, ситуации demo_situations_evaluation, распознавание файла резюме document_ingestion)",
      "3. Распознавание документов везде (/api/ai-ingest-document, Функция 369, /api/parse-company-file, /api/parse-vacancy-file, /api/parse-training-file)",
      "4. Создание и редактор компании (company_generation, company_ingestion, landing_theme_generation, /api/enhance-single-field, /api/enhance-all-fields, автозаполнение)",
      "5. Создание и редактор вакансии (vacancy_generation, vacancy_field_enhance, vacancy_full_enhance, vacancy_distribute_text, генератор HH шаблонов hh_templates_generation для всех 3 полей hh_post_text, hh_invite_text, hh_autoresume_text, предпоказы)",
      "6. Создание Системы интервью и Системы обучения на всех этапах (interview_resume_criteria_generate, interview_checklist_generate, interview_situations_generate, training_stage_material_generate, training_stage_test_generate, training_material_enhance)",
      "7. ИИ-чат на лендинге вакансии (vacancy-consultant-chat -> consultant_presentation), проведение интервью в ЛК соискателя (candidate_evaluation, checklist_evaluation, situation_analysis, overall_candidate_evaluation), проведение обучения и аттестации (training_stage_quiz_grade, training_summary_evaluation)"
    ]
  },
  styling: {
    designLanguage: "Apple Liquid Glass",
    minimumFontSizePx: 14,
    forbiddenColors: [
      "Зеленый (#00FF00, green-*, emerald-*, lime-*) в контейнерах, блоках, кнопках или текстах",
      "Красный (#FF0000, red-*, rose-*) в контейнерах, блоках или текстах",
      "Цветные непрозрачные заливки или фоновые затемнения/осветления"
    ],
    containerBackdropRule:
      "В стандартной теме запрещено затемнение и осветление фона никакими цветами в контейнерах — всегда либо прозрачно (bg-transparent), либо размытие фона (backdrop-blur-md, backdrop-blur-xl) с чистой нейтральной полупрозрачностью.",
    bordersRule:
      "Граница контейнеров и карточек — либо золотой градиент (border-[#E7C768]/30..40), либо белый полупрозрачный (border-white/10..20). Стиль Liquid Glass Apple во всех контейнерах и компонентах.",
    typographyRule:
      "Всегда текст либо золотой градиент (заголовки: bg-gradient-to-r from-[#E7C768] to-[#C9A84C] bg-clip-text text-transparent), либо белый/светлый (text-white, text-white/90, text-white/70). Минимальный размер шрифта — 14px (text-sm). Текст меньше 14px строго запрещен.",
    caseRule:
      "Никогда не использовать капслок (uppercase) в интерфейсном тексте. Весь текст оформляется в естественном предложном регистре.",
    mobileTabsRule:
      "В мобильной версии строго избегать горизонтальных прокруток табов, заменяя их на вертикальные списки или выпадающие меню (select / dropdown) с кнопками в нашем стиле Liquid Glass.",
    mobileLayoutRule:
      "Соблюдать по ширине верстку компонентов внутри по ширине в мобильных версиях (max-w-full, break-words, overflow-x-hidden), чтобы все блоки, плашки и текст корректно вмещались и переносились.",
    modalStandardComponent:
      "Диалоговое окно AI Ассистента (src/components/EmployerAIAssistant.tsx) является эталоном стиля цветов, шрифтов, размытия и фона для всех модальных окон."
  }
};
