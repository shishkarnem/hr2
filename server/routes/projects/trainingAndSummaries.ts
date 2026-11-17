import { Router, Request, Response } from "express";
import { get20QuestionsForCategory } from "../../common";
import { getProTalkDB } from "../../db";

const STAGE_ALIASES_MAP: Record<string, string[]> = {
  professional: ["professional", "stage1", "1"],
  stage1: ["professional", "stage1", "1"],
  "1": ["professional", "stage1", "1"],
  product: ["product", "stage2", "2"],
  stage2: ["product", "stage2", "2"],
  "2": ["product", "stage2", "2"],
  system: ["system", "stage3", "3", "systems"],
  stage3: ["system", "stage3", "3", "systems"],
  systems: ["system", "stage3", "3", "systems"],
  "3": ["system", "stage3", "3", "systems"],
};

function normalizeTestQuestions(rawQuestions: any): any[] {
  let list: any[] = [];
  if (typeof rawQuestions === "string") {
    try {
      const parsed = JSON.parse(rawQuestions);
      if (Array.isArray(parsed)) list = parsed;
    } catch {}
  } else if (Array.isArray(rawQuestions)) {
    list = rawQuestions;
  }

  return list.map((item: any, idx: number) => {
    if (!item || typeof item !== "object") {
      return {
        id: `q${idx + 1}`,
        kind: "text",
        question: String(item || ""),
        points: 5,
        options: [],
        expected_answer: null,
        explanation: "",
      };
    }

    const qText = item.question || item.q || item.title || "";
    let options: Array<{ text: string; is_correct?: boolean }> = [];
    if (Array.isArray(item.options)) {
      options = item.options.map((opt: any, optIdx: number) => {
        if (typeof opt === "string") {
          const isCorrect =
            item.correctIndex !== undefined ? optIdx === Number(item.correctIndex) : optIdx === 0;
          return { text: opt, is_correct: isCorrect };
        }
        return {
          text: opt?.text || opt?.title || "",
          is_correct: Boolean(opt?.is_correct ?? opt?.correct),
        };
      });
    }

    let kind = item.kind || "choice";
    if (kind === "choice" && (!options || options.length === 0)) {
      kind = item.expected_answer ? "paragraph" : "choice";
    }

    return {
      id: item.id || `q${idx + 1}`,
      kind,
      question: qText,
      points: Number(item.points) || 5,
      options: options.length > 0 ? options : null,
      correct: item.correct ?? (options.find((o) => o.is_correct)?.text || null),
      expected_answer: item.expected_answer || null,
      explanation: item.explanation || "",
    };
  });
}

function normalizeStageKey(s: string): string {
  const l = String(s || "").toLowerCase().trim();
  if (l === "stage1" || l === "1" || l.startsWith("prof")) return "professional";
  if (l === "stage2" || l === "2" || l.startsWith("prod")) return "product";
  if (l === "stage3" || l === "3" || l.startsWith("sys")) return "system";
  return l;
}

export function registerProjectTrainingAndSummaryRoutes(projectsRouter: Router) {
  projectsRouter.get("/get-questions", (req: Request, res: Response) => {
    const { category, roleName, companyName } = req.query;
    const questions = get20QuestionsForCategory(
      String(category || "train_sys"),
      String(roleName || "Менеджер"),
      String(companyName || "Компания")
    );
    return res.json(questions);
  });

  projectsRouter.get("/training-blocks", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const { project_id, stage } = req.query;
      let sql = "SELECT * FROM training_blocks WHERE 1=1";
      const params: any[] = [];

      let resolvedProject: any = null;
      if (project_id) {
        const pStr = String(project_id);
        const cleanPid = pStr.replace(/^vac/i, "");
        resolvedProject = await db.get(
          "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
          [pStr, pStr, cleanPid, pStr]
        );
        if (resolvedProject) {
          sql += " AND (project_id = ? OR project_id = ?)";
          params.push(resolvedProject.id, String(resolvedProject.public_id || resolvedProject.id));
        } else {
          sql += " AND project_id = ?";
          params.push(pStr);
        }
      }
      if (stage) {
        sql += " AND stage = ?";
        params.push(String(stage));
      }
      sql += " ORDER BY updated_at DESC, order_index ASC, created_at DESC";
      let rows = (await db.all(sql, params)) || [];

      if (rows.length === 0 && resolvedProject && stage) {
        const stg = String(stage);
        const stageText =
          stg === "professional"
            ? resolvedProject.training_professional_text || resolvedProject.training_prof_text || ""
            : stg === "product"
            ? resolvedProject.training_product_text || ""
            : resolvedProject.training_systems_text ||
              resolvedProject.training_system_text ||
              resolvedProject.training_wiki_text ||
              "";

        if (stageText && stageText.trim()) {
          const autoBlockId = "tb-" + Math.random().toString(36).substring(2, 9);
          const stageTitle =
            stg === "professional"
              ? "1. Профессиональное обучение"
              : stg === "product"
              ? "2. Продуктовое обучение"
              : "3. Системное обучение";
          const now = new Date().toISOString();
          try {
            await db.run(
              `INSERT INTO training_blocks (
                id, project_id, stage, title, block_key, materials_md, content, subpages_json, pass_score, order_index, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 70, 0, ?, ?)
              ON CONFLICT (project_id, stage) DO UPDATE SET
                materials_md = EXCLUDED.materials_md,
                content = EXCLUDED.content,
                updated_at = EXCLUDED.updated_at`,
              [autoBlockId, resolvedProject.id, stg, stageTitle, stg, stageText, stageText, null, now, now]
            );
            const seeded = await db.get(
              "SELECT * FROM training_blocks WHERE project_id = ? AND stage = ? LIMIT 1",
              [resolvedProject.id, stg]
            );
            if (seeded) rows = [seeded];
          } catch (seedErr) {
            console.warn("[training-blocks] auto-seed notice:", seedErr);
          }
        }
      }

      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  projectsRouter.post("/training-blocks", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const {
        id,
        project_id,
        stage,
        title,
        block_key,
        materials_md,
        content,
        subpages_json,
        pass_score,
        order_index,
      } = req.body;

      let pId = project_id;
      let proj: any = null;
      if (project_id) {
        proj = await db.get(
          "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [project_id, String(project_id)]
        );
        if (proj) pId = proj.id;
      }

      const blockId = id || "tb-" + Math.random().toString(36).substring(2, 9);
      const existing = await db.get(
        "SELECT id FROM training_blocks WHERE id = ? OR ((project_id = ? OR project_id = ?) AND stage = ?) LIMIT 1",
        [blockId, pId, String(proj?.public_id || pId || ""), stage]
      );
      const finalId = existing ? existing.id : blockId;
      const now = new Date().toISOString();
      const finalSubpagesJson =
        typeof subpages_json === "string"
          ? subpages_json
          : subpages_json
          ? JSON.stringify(subpages_json)
          : null;
      const textContent = materials_md || content || "";
      const effPassScore = Number(pass_score ?? 70) || 70;
      const effBlockKey = block_key || stage || null;

      if (existing) {
        await db.run(
          `UPDATE training_blocks
           SET project_id = ?, stage = ?, title = ?, block_key = COALESCE(?, block_key),
               materials_md = ?, content = ?, subpages_json = ?, pass_score = ?, order_index = ?, updated_at = ?
           WHERE id = ?`,
          [
            pId || null,
            stage || null,
            title || "",
            effBlockKey,
            textContent,
            textContent,
            finalSubpagesJson,
            effPassScore,
            Number(order_index) || 0,
            now,
            finalId,
          ]
        );
      } else {
        await db.run(
          `INSERT INTO training_blocks (
            id, project_id, stage, title, block_key, materials_md, content, subpages_json, pass_score, order_index, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (project_id, stage) DO UPDATE SET
            title = EXCLUDED.title,
            block_key = COALESCE(EXCLUDED.block_key, training_blocks.block_key),
            materials_md = EXCLUDED.materials_md,
            content = EXCLUDED.content,
            subpages_json = EXCLUDED.subpages_json,
            pass_score = EXCLUDED.pass_score,
            order_index = EXCLUDED.order_index,
            updated_at = EXCLUDED.updated_at`,
          [
            finalId,
            pId || null,
            stage || null,
            title || "",
            effBlockKey,
            textContent,
            textContent,
            finalSubpagesJson,
            effPassScore,
            Number(order_index) || 0,
            now,
            now,
          ]
        );
      }

      if (proj && stage) {
        const stageCols: Record<string, string[]> = {
          professional: ["training_prof_text", "training_professional_text"],
          product: ["training_product_text"],
          system: ["training_system_text", "training_systems_text", "training_wiki_text"],
        };
        const cols = stageCols[stage] || [];
        for (const col of cols) {
          try {
            await db.run(`UPDATE projects SET ${col} = ?, updated_at = ? WHERE id = ?`, [
              textContent,
              now,
              proj.id,
            ]);
          } catch {}
        }
      }

      const saved =
        (await db.get("SELECT * FROM training_blocks WHERE id = ? LIMIT 1", [finalId])) ||
        (await db.get("SELECT * FROM training_blocks WHERE project_id = ? AND stage = ? LIMIT 1", [pId, stage]));
      return res.json(saved);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  projectsRouter.get("/training-tests", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const { project_id, stage } = req.query;
      if (!project_id || !stage) return res.json(null);

      const pStr = String(project_id);
      const cleanPid = pStr.replace(/^vac/i, "");
      const proj = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
        [pStr, pStr, cleanPid, pStr]
      );

      const canonicalPid = proj ? proj.id : pStr;
      const publicPid = proj ? String(proj.public_id || proj.id) : pStr;
      const stageStr = String(stage).toLowerCase().trim();
      const stageAliases = STAGE_ALIASES_MAP[stageStr] || [stageStr];
      const placeholders = stageAliases.map(() => "?").join(", ");

      const test = await db.get(
        `SELECT * FROM training_stage_tests
         WHERE (project_id = ? OR project_id = ?)
           AND stage IN (${placeholders})
         ORDER BY (CASE WHEN (questions IS NOT NULL AND LENGTH(questions) > 300) OR (questions_json IS NOT NULL AND LENGTH(questions_json) > 300) THEN 100 ELSE 1 END) DESC, updated_at DESC
         LIMIT 1`,
        [canonicalPid, publicPid, ...stageAliases]
      );

      if (test) {
        const rawQs = test.questions || test.questions_json || [];
        test.questions = normalizeTestQuestions(rawQs);
        test.questions_json = JSON.stringify(test.questions);
      }

      return res.json(test || null);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  projectsRouter.post("/training-tests", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const { id, project_id, stage, questions, pass_score, total_score, shuffle_questions } = req.body;
      if (!project_id || !stage) return res.status(400).json({ error: "missing_fields" });

      const pStr = String(project_id);
      const cleanPid = pStr.replace(/^vac/i, "");
      const proj = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
        [pStr, pStr, cleanPid, pStr]
      );
      const canonicalPid = proj ? proj.id : pStr;
      const stageStr = String(stage).toLowerCase().trim();
      const stageAliases = STAGE_ALIASES_MAP[stageStr] || [stageStr];
      const stagePlaceholders = stageAliases.map(() => "?").join(", ");

      const existing = await db.get(
        `SELECT id FROM training_stage_tests WHERE (id = ? OR (project_id = ? AND stage IN (${stagePlaceholders}))) ORDER BY updated_at DESC LIMIT 1`,
        [id || "", canonicalPid, ...stageAliases]
      );

      const finalId = existing ? existing.id : id || "tst-" + Math.random().toString(36).substring(2, 9);
      const now = new Date().toISOString();
      const normalizedQs = normalizeTestQuestions(questions);
      const questionsJson = JSON.stringify(normalizedQs);
      const pass = Number(pass_score ?? 70) || 70;
      const total =
        Number(total_score) || normalizedQs.reduce((s: number, q: any) => s + (q.points || 5), 0) || 100;
      const shuffle = shuffle_questions !== false ? 1 : 0;

      if (existing) {
        await db.run(
          `UPDATE training_stage_tests SET project_id = ?, stage = ?, questions = ?, questions_json = ?, pass_score = ?, passing_score = ?, total_score = ?, shuffle_questions = ?, status = 'completed', updated_at = ? WHERE id = ?`,
          [canonicalPid, stage, questionsJson, questionsJson, pass, pass, total, shuffle, now, finalId]
        );
      } else {
        await db.run(
          `INSERT INTO training_stage_tests (id, project_id, stage, questions, questions_json, pass_score, passing_score, total_score, shuffle_questions, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
           ON CONFLICT (project_id, stage) DO UPDATE SET
             questions = EXCLUDED.questions,
             questions_json = EXCLUDED.questions_json,
             pass_score = EXCLUDED.pass_score,
             passing_score = EXCLUDED.passing_score,
             total_score = EXCLUDED.total_score,
             shuffle_questions = EXCLUDED.shuffle_questions,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at`,
          [finalId, canonicalPid, stage, questionsJson, questionsJson, pass, pass, total, shuffle, now, now]
        );
      }

      const saved =
        (await db.get("SELECT * FROM training_stage_tests WHERE id = ? LIMIT 1", [finalId])) ||
        (await db.get("SELECT * FROM training_stage_tests WHERE project_id = ? AND stage = ? LIMIT 1", [
          canonicalPid,
          stage,
        ]));
      if (saved) {
        saved.questions = normalizeTestQuestions(saved.questions || saved.questions_json);
      }
      return res.json(saved);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  projectsRouter.get("/interviews/summary", async (req: Request, res: Response) => {
    try {
      const rawIds = String(req.query.projectIds || req.query.ids || "");
      const ids = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return res.json({ data: [] });

      const db = await getProTalkDB();
      const ph = ids.map(() => "?").join(",");
      const systems = (await db.all(`SELECT project_id FROM interview_systems WHERE project_id IN (${ph})`, ids)) || [];
      const blocks =
        (await db.all(
          `SELECT project_id, kind, (CASE WHEN payload IS NOT NULL AND length(trim(payload)) > 10 THEN 1 ELSE 0 END) as has_payload FROM interview_blocks WHERE project_id IN (${ph})`,
          ids
        )) || [];

      const map: Record<string, { project_id: string; blocks: { resume: boolean; checklist: boolean; situations: boolean } }> = {};
      for (const s of systems) {
        if (s.project_id) {
          map[s.project_id] = {
            project_id: s.project_id,
            blocks: { resume: false, checklist: false, situations: false },
          };
        }
      }
      for (const b of blocks) {
        const s = (map[b.project_id] ||= {
          project_id: b.project_id,
          blocks: { resume: false, checklist: false, situations: false },
        });
        if (Number(b.has_payload) > 0) {
          if (b.kind === "resume") s.blocks.resume = true;
          if (b.kind === "checklist") s.blocks.checklist = true;
          if (b.kind === "situations") s.blocks.situations = true;
        }
      }
      return res.json({ data: Object.values(map) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  projectsRouter.get("/training/summary", async (req: Request, res: Response) => {
    try {
      const rawIds = String(req.query.projectIds || req.query.ids || "");
      const ids = rawIds.split(",").map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return res.json({ data: [] });

      const db = await getProTalkDB();
      const ph = ids.map(() => "?").join(",");
      const blocks =
        (await db.all(
          `SELECT project_id, stage,
            (CASE WHEN (materials_md IS NOT NULL AND length(trim(materials_md)) > 0)
                    OR (subpages_json IS NOT NULL AND trim(subpages_json) != '[]' AND length(trim(subpages_json)) > 0)
                  THEN 1 ELSE 0 END) as has_material
           FROM training_blocks WHERE project_id IN (${ph})`,
          ids
        )) || [];

      const tests =
        (await db.all(
          `SELECT project_id, stage, status, questions, questions_json
           FROM training_stage_tests WHERE project_id IN (${ph})`,
          ids
        )) || [];

      const map: Record<string, { project_id: string; stages: Record<string, { material: boolean; test: boolean }> }> = {};

      for (const b of blocks) {
        if (!Number(b.has_material)) continue;
        const pid = b.project_id;
        const stage = normalizeStageKey(b.stage);
        const s = (map[pid] ||= { project_id: pid, stages: {} });
        s.stages[stage] = { ...(s.stages[stage] || { material: false, test: false }), material: true };
      }

      for (const t of tests) {
        let qArr: any[] = [];
        const rawQ = t.questions_json || t.questions;
        if (rawQ) {
          try {
            const parsed = typeof rawQ === "string" ? JSON.parse(rawQ) : rawQ;
            if (Array.isArray(parsed)) qArr = parsed;
          } catch {}
        }
        if (qArr.length < 2) continue;
        const pid = t.project_id;
        const stage = normalizeStageKey(t.stage);
        const s = (map[pid] ||= { project_id: pid, stages: {} });
        s.stages[stage] = { ...(s.stages[stage] || { material: false, test: false }), test: true };
      }

      return res.json({ data: Object.values(map) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
