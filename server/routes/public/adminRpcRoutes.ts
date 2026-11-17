import { Router, Request, Response } from "express";
import {
  getProTalkDB,
  savePaymentToProTalkDB,
  deleteCandidateFromProTalkDB,
  deleteProjectFromProTalkDB,
} from "../../db";
import { notifyLimitChangesToTelegram, notifyProfileChangesToTelegram } from "../../telegram";
import { queryAllPg } from "../../db/protalkDb";

export const adminRpcRouter = Router();

async function getPgColumnsMeta(tableName: string): Promise<Array<{ name: string; type: string }>> {
  const rows = await queryAllPg<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [tableName]
  );
  return rows.map((r) => ({ name: r.column_name, type: r.data_type }));
}

function coerceRpcValue(v: any, pgType: string): any {
  const dt = (pgType || "").toLowerCase();
  const isNum = ["bigint", "integer", "smallint", "numeric", "double precision", "real"].includes(dt);
  const isBool = dt === "boolean";
  const isDate = ["timestamp with time zone", "timestamp without time zone", "date"].includes(dt);

  if (v === null || v === undefined) return null;
  if (isBool) return v === true || v === 1 || v === "1" || v === "true";
  if (isNum) {
    if (v === "" || isNaN(Number(v))) return null;
    return Number(v);
  }
  if (isDate) {
    return String(v).trim() === "" ? null : String(v).trim();
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

adminRpcRouter.delete("/admin/tables/:table/:id", async (req: Request, res: Response) => {
  try {
    const { table, id } = req.params;
    const allowedTables = [
      "job_titles",
      "posts",
      "comments",
      "reviews",
      "projects",
      "companies",
      "employers",
      "candidates",
      "candidate_scores",
      "candidate_stage_progress",
      "candidate_training_attempts",
      "candidate_situations_answers_v2",
      "candidate_sessions",
      "candidate_checklist_answers_v2",
      "candidate_answers",
      "transactions",
      "wallets",
      "mailings",
      "user_roles",
      "logs",
      "protalk_bots",
      "protalk_prompts",
    ];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const dbInstance = await getProTalkDB();
    const cols = await getPgColumnsMeta(table);
    const hasPublicId = cols.some((c) => c.name === "public_id");
    if (hasPublicId) {
      await dbInstance.run(
        `DELETE FROM "${table}" WHERE CAST(id AS TEXT) = ? OR CAST(public_id AS TEXT) = ?`,
        [String(id), String(id)]
      );
    } else {
      await dbInstance.run(`DELETE FROM "${table}" WHERE CAST(id AS TEXT) = ?`, [String(id)]);
    }
    return res.json({ ok: true, deletedTable: table, deletedId: id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.put(
  ["/admin/tables/:table/:id", "/admin/table/:table/:id", "/tables/:table/:id", "/table/:table/:id"],
  async (req: Request, res: Response) => {
    try {
      const { table, id } = req.params;
      if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        return res.status(400).json({ error: "Invalid table name" });
      }
      const patch = { ...(req.body || {}) };
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
        return res.json({ success: true, message: "No fields to update" });
      }

      const dbInstance = await getProTalkDB();
      const cols = await getPgColumnsMeta(table);
      const colMap = new Map(cols.map((c) => [c.name, c.type]));
      const hasPublicId = colMap.has("public_id");

      const existing = hasPublicId
        ? await dbInstance.get(
            `SELECT * FROM "${table}" WHERE CAST(id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
            [String(id), String(id)]
          )
        : await dbInstance.get(`SELECT * FROM "${table}" WHERE CAST(id AS TEXT) = ? LIMIT 1`, [String(id)]);

      if (!existing) {
        return res.status(404).json({ error: `Record ${id} not found in ${table}` });
      }

      if (table === "employers") {
        const balanceFields = [
          "balance",
          "balance_start",
          "balance_pay",
          "balance_referral",
          "balance_admin",
          "balance_limits",
        ];
        for (const bf of balanceFields) delete patch[bf];
      }

      const validKeys = Object.keys(patch).filter((k) => colMap.has(k) && k !== "id");
      if (validKeys.length === 0) {
        return res.json({ success: true, message: "No valid columns to update", data: existing });
      }

      const sets = validKeys.map((k) => `"${k}" = ?`).join(", ");
      const vals = validKeys.map((k) => coerceRpcValue(patch[k], colMap.get(k) || "text"));
      vals.push(existing.id);

      await dbInstance.run(`UPDATE "${table}" SET ${sets} WHERE id = ?`, vals);
      const updated = await dbInstance.get(`SELECT * FROM "${table}" WHERE id = ?`, [existing.id]);

      if (table === "employers" && (updated || existing)) {
        const changedFields: Array<{ field: string; label?: string; from: any; to: any }> = [];
        for (const k of validKeys) {
          const oldVal = existing ? existing[k] : null;
          const newVal = patch[k];
          const isBlank = (val: any) =>
            val === null || val === undefined || (typeof val === "string" && val.trim() === "");
          if (isBlank(oldVal) && isBlank(newVal)) continue;
          if (oldVal !== newVal) {
            changedFields.push({ field: k, from: oldVal, to: newVal });
          }
        }
        if (changedFields.length > 0) {
          await notifyProfileChangesToTelegram(
            dbInstance,
            updated || existing,
            changedFields,
            req.body?._note || "Корректировка администратором"
          ).catch((e: any) => console.error("[Telegram] Notify error:", e.message));
        }
      }

      return res.json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);

adminRpcRouter.post(
  ["/rpc/admin_wallet_adjust", "/admin/rpc/admin_wallet_adjust"],
  async (req: Request, res: Response) => {
    try {
      const { _employer, _delta, _note, _type } = req.body || {};
      if (!_employer) return res.status(400).json({ error: "Missing _employer" });
      const deltaNum = Number(_delta);
      if (isNaN(deltaNum)) return res.status(400).json({ error: "Invalid _delta" });

      const dbInstance = await getProTalkDB();
      const emp = await dbInstance.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [String(_employer), String(_employer), String(_employer)]
      );
      if (!emp) return res.status(404).json({ error: `Employer ${_employer} not found` });

      let wallet = await dbInstance.get("SELECT id FROM wallets WHERE employer_id = ? LIMIT 1", [emp.id]);
      if (!wallet) {
        const wId = `wall-${Date.now()}`;
        await dbInstance.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [
          wId,
          emp.id,
          Number(emp.balance || 0),
        ]);
        wallet = { id: wId };
      }

      const txType = _type || "admin";
      const typeBalance = ["start", "pay", "referral", "admin", "limits"].includes(txType) ? txType : "admin";
      const txId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const txNote = _note || "Корректировка администратором";

      await dbInstance.run(
        `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'employers', ?, NOW())`,
        [
          txId,
          wallet.id,
          deltaNum,
          txType,
          typeBalance,
          `Корректировка баланса (${txType}): ${deltaNum >= 0 ? "+" : ""}${deltaNum} RR`,
          txNote,
          emp.id,
        ]
      );

      const colName =
        typeBalance === "start"
          ? "balance_start"
          : typeBalance === "pay"
          ? "balance_pay"
          : typeBalance === "referral"
          ? "balance_referral"
          : typeBalance === "limits"
          ? "balance_limits"
          : "balance_admin";

      await dbInstance.run(
        `UPDATE employers SET balance = COALESCE(balance, 0) + ?, ${colName} = COALESCE(${colName}, 0) + ?, updated_at = NOW() WHERE id = ?`,
        [deltaNum, deltaNum, emp.id]
      );

      await dbInstance.run(
        "UPDATE wallets SET units_balance = COALESCE(units_balance, 0) + ?, updated_at = NOW() WHERE id = ?",
        [deltaNum, wallet.id]
      );

      const updatedEmp = await dbInstance.get("SELECT * FROM employers WHERE id = ? LIMIT 1", [emp.id]);
      return res.json({ success: true, data: updatedEmp, newBalance: updatedEmp?.balance ?? 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);

const LIMIT_FIELD_LABELS: Record<string, string> = {
  landing_credits: "Вакансии (лендинги)",
  vacancies: "Вакансии (лендинги)",
  interview_setup_credits: "Системы найма",
  interview_systems: "Системы найма",
  training_setup_credits: "Системы обучения",
  training_systems: "Системы обучения",
  interview_credits: "Интервью",
  interviews: "Интервью",
  training_credits: "Обучения",
  trainings: "Обучения",
};

adminRpcRouter.post(
  ["/rpc/admin_employer_set_limit", "/admin/rpc/admin_employer_set_limit"],
  async (req: Request, res: Response) => {
    try {
      const { _employer, _field, _value, _note } = req.body || {};
      if (!_employer || !_field) return res.status(400).json({ error: "Missing _employer or _field" });
      if (!/^[a-zA-Z0-9_]+$/.test(String(_field))) {
        return res.status(400).json({ error: "Invalid _field name" });
      }
      const valNum = Math.max(0, Number(_value) || 0);
      const dbInstance = await getProTalkDB();
      const emp = await dbInstance.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [String(_employer), String(_employer), String(_employer)]
      );
      if (!emp) return res.status(404).json({ error: `Employer ${_employer} not found` });

      const curVal = Number(emp[_field] || 0);
      const delta = valNum - curVal;
      const label = LIMIT_FIELD_LABELS[_field] || _field;

      await dbInstance.run(`UPDATE employers SET "${_field}" = ?, updated_at = NOW() WHERE id = ?`, [
        valNum,
        emp.id,
      ]);

      let wallet = await dbInstance.get("SELECT id FROM wallets WHERE employer_id = ? LIMIT 1", [emp.id]);
      if (!wallet) {
        const wId = `wall-${Date.now()}`;
        await dbInstance.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [
          wId,
          emp.id,
          Number(emp.balance || 0),
        ]);
        wallet = { id: wId };
      }

      const txId = `tx-lim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await dbInstance.run(
        `INSERT INTO transactions (id, wallet_id, amount_rr, amount_limits, type_limits, type, type_balance, description, note, ref_table, ref_id, created_at)
         VALUES (?, ?, 0, ?, ?, 'limit_adjustment', 'limits', ?, ?, 'employers', ?, NOW())`,
        [
          txId,
          wallet.id,
          delta,
          _field,
          `Изменение лимита (${label}): ${curVal} → ${valNum} (${delta >= 0 ? "+" : ""}${delta})`,
          _note || "Корректировка лимита администратором",
          emp.id,
        ]
      );

      const updatedEmp = await dbInstance.get("SELECT * FROM employers WHERE id = ? LIMIT 1", [emp.id]);
      const changes = [{ field: _field, label, from: curVal, to: valNum, delta }];
      await notifyLimitChangesToTelegram(dbInstance, updatedEmp, changes, _note);

      return res.json({ success: true, data: updatedEmp, field: _field, value: valNum, delta, changes });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);

adminRpcRouter.post(
  ["/rpc/admin_employer_set_limits", "/admin/rpc/admin_employer_set_limits"],
  async (req: Request, res: Response) => {
    try {
      const { _employer, _limits, _deltas, _note } = req.body || {};
      if (!_employer || (!_limits && !_deltas)) {
        return res.status(400).json({ error: "Missing _employer or _limits/_deltas object" });
      }
      const dbInstance = await getProTalkDB();
      const emp = await dbInstance.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [String(_employer), String(_employer), String(_employer)]
      );
      if (!emp) return res.status(404).json({ error: `Employer ${_employer} not found` });

      let wallet = await dbInstance.get("SELECT id FROM wallets WHERE employer_id = ? LIMIT 1", [emp.id]);
      if (!wallet) {
        const wId = `wall-${Date.now()}`;
        await dbInstance.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [
          wId,
          emp.id,
          Number(emp.balance || 0),
        ]);
        wallet = { id: wId };
      }

      const changes: Array<{ field: string; label: string; from: number; to: number; delta: number }> = [];
      const fieldsToProcess: Record<string, number> = {};

      if (_deltas && typeof _deltas === "object") {
        for (const [f, d] of Object.entries(_deltas)) {
          if (!/^[a-zA-Z0-9_]+$/.test(f)) continue;
          const deltaNum = Number(d) || 0;
          if (deltaNum !== 0) {
            const curVal = Number(emp[f] || 0);
            fieldsToProcess[f] = Math.max(0, curVal + deltaNum);
          }
        }
      } else if (_limits && typeof _limits === "object") {
        for (const [f, v] of Object.entries(_limits)) {
          if (!/^[a-zA-Z0-9_]+$/.test(f)) continue;
          fieldsToProcess[f] = Math.max(0, Number(v) || 0);
        }
      }

      for (const [f, targetVal] of Object.entries(fieldsToProcess)) {
        const valNum = Math.max(0, Number(targetVal) || 0);
        const curVal = Number(emp[f] || 0);
        if (valNum !== curVal) {
          await dbInstance.run(`UPDATE employers SET "${f}" = ?, updated_at = NOW() WHERE id = ?`, [
            valNum,
            emp.id,
          ]);
          const delta = valNum - curVal;
          const label = LIMIT_FIELD_LABELS[f] || f;
          const txId = `tx-lim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await dbInstance.run(
            `INSERT INTO transactions (id, wallet_id, amount_rr, amount_limits, type_limits, type, type_balance, description, note, ref_table, ref_id, created_at)
             VALUES (?, ?, 0, ?, ?, 'limit_adjustment', 'limits', ?, ?, 'employers', ?, NOW())`,
            [
              txId,
              wallet.id,
              delta,
              f,
              `Изменение лимита (${label}): ${curVal} → ${valNum} (${delta >= 0 ? "+" : ""}${delta})`,
              _note || "Пакетная корректировка лимитов администратором",
              emp.id,
            ]
          );
          changes.push({ field: f, label, from: curVal, to: valNum, delta });
        }
      }

      const updatedEmp = await dbInstance.get("SELECT * FROM employers WHERE id = ? LIMIT 1", [emp.id]);
      if (changes.length > 0) {
        await notifyLimitChangesToTelegram(dbInstance, updatedEmp, changes, _note);
      }

      return res.json({ success: true, data: updatedEmp, changes });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);

adminRpcRouter.get("/admin/protalk-bots", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rows = await db.all("SELECT * FROM protalk_bots ORDER BY created_at ASC NULLS LAST");
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.post("/admin/protalk-bots", async (req: Request, res: Response) => {
  try {
    const {
      id,
      system_name,
      bot_id,
      bot_name,
      model_type,
      model_alias,
      bot_token,
      api_url,
      temperature,
      is_active,
      user_prefix,
    } = req.body || {};
    const botId = id || `pt-${Date.now()}`;
    const resolvedBotNum = Number(bot_id) || 66337;
    const rawToken = String(
      bot_token ||
        (resolvedBotNum === 67370 ? "XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY" : "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs")
    )
      .replace(new RegExp(`^${resolvedBotNum}_`), "")
      .trim();
    const db = await getProTalkDB();
    await db.run(
      `INSERT INTO protalk_bots (id, system_name, bot_id, bot_name, model_type, model_alias, bot_token, api_url, temperature, is_active, user_prefix, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET
         system_name = EXCLUDED.system_name,
         bot_id = EXCLUDED.bot_id,
         bot_name = EXCLUDED.bot_name,
         model_type = EXCLUDED.model_type,
         model_alias = EXCLUDED.model_alias,
         bot_token = EXCLUDED.bot_token,
         api_url = EXCLUDED.api_url,
         temperature = EXCLUDED.temperature,
         is_active = EXCLUDED.is_active,
         user_prefix = EXCLUDED.user_prefix,
         updated_at = NOW()`,
      [
        botId,
        system_name || model_type || "chat",
        resolvedBotNum,
        bot_name || "ProTalk Bot",
        model_type || "chat",
        model_alias || "hr_rr",
        rawToken,
        api_url || "https://ai.pro-talk.ru/v1/chat/completions",
        temperature !== undefined ? Number(temperature) : 0.1,
        is_active !== undefined ? Number(is_active) : 1,
        user_prefix || "{id}_RRchat",
      ]
    );
    return res.json({ success: true, id: botId, message: "Бот ProTalk успешно сохранен в базе данных" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.get("/admin/protalk-prompts", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rows = await db.all(
      `SELECT p.*, b.bot_name, b.bot_id as protalk_bot_num, b.model_alias, b.user_prefix
       FROM protalk_prompts p
       LEFT JOIN protalk_bots b ON p.bot_id = b.id
       ORDER BY p.created_at ASC NULLS LAST`
    );
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.post("/admin/protalk-prompts", async (req: Request, res: Response) => {
  try {
    const {
      id,
      prompt_key,
      prompt_name,
      bot_id,
      system_prompt,
      user_prompt_template,
      function_id,
      description,
      is_active,
    } = req.body || {};
    if (!prompt_key || !system_prompt) {
      return res
        .status(400)
        .json({ error: "Ключ (prompt_key) и текст промпта (system_prompt) обязательны" });
    }
    const promptId = id || `p-${Date.now()}`;
    const db = await getProTalkDB();
    await db.run(
      `INSERT INTO protalk_prompts (id, prompt_key, prompt_name, bot_id, system_prompt, user_prompt_template, function_id, description, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET
         prompt_key = EXCLUDED.prompt_key,
         prompt_name = EXCLUDED.prompt_name,
         bot_id = EXCLUDED.bot_id,
         system_prompt = EXCLUDED.system_prompt,
         user_prompt_template = EXCLUDED.user_prompt_template,
         function_id = EXCLUDED.function_id,
         description = EXCLUDED.description,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()`,
      [
        promptId,
        prompt_key.trim(),
        prompt_name || prompt_key,
        bot_id || "pt-1",
        system_prompt,
        user_prompt_template || system_prompt || "",
        function_id !== undefined && function_id !== null && function_id !== "" ? Number(function_id) : null,
        description || "",
        is_active !== undefined ? Number(is_active) : 1,
      ]
    );
    return res.json({ success: true, id: promptId, message: "Промпт ProTalk успешно сохранен в базе данных" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.get("/admin/payments", async (_req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const rows = (await dbInstance.all("SELECT * FROM payments ORDER BY created_at DESC NULLS LAST LIMIT 200")) || [];
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.post("/admin/pay-mock", async (req: Request, res: Response) => {
  const { companyName, amount, itemType, itemName } = req.body || {};
  const dbInstance = await getProTalkDB();
  const newPayment = {
    id: "pay-" + Math.random().toString(36).substring(2, 11),
    companyName: companyName || "Случайный Работодатель",
    amount: Number(amount) || 100,
    itemType: itemType || "interview",
    itemName: itemName || "1 ИИ-интервью соискателя",
    status: "completed",
    createdAt: new Date().toISOString(),
  };
  await savePaymentToProTalkDB(dbInstance, newPayment);
  return res.json(newPayment);
});

adminRpcRouter.delete("/admin/candidates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbInstance = await getProTalkDB();
    const existing = await dbInstance.get(
      "SELECT id FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [id, String(id)]
    );
    if (!existing) return res.status(404).json({ error: "Candidate not found" });
    await deleteCandidateFromProTalkDB(dbInstance, existing.id);
    return res.json({ success: true, message: "Соискатель удалён" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminRpcRouter.delete("/admin/projects/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbInstance = await getProTalkDB();
    const existing = await dbInstance.get(
      "SELECT id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [id, String(id)]
    );
    if (!existing) return res.status(404).json({ error: "Project not found" });
    await deleteProjectFromProTalkDB(dbInstance, existing.id);
    return res.json({ success: true, message: "Проект и связанные кандидаты удалены" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
