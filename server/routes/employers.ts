import { Router, Request, Response } from "express";
import { notifyTelegram } from "../common";
import { saveEmployerToProTalkDB, savePaymentToProTalkDB, getProTalkDB } from "../db";

export const employersRouter = Router();

employersRouter.post("/employers", async (req: Request, res: Response) => {
  const { id, name, email, telegramUsername, registeredVia, refBy } = req.body;
  const db = await getProTalkDB();

  // Check if employer already exists with this email
  let emp = db ? await db.get("SELECT * FROM employers WHERE LOWER(email) = LOWER(?) LIMIT 1", [String(email || "").trim()]) : null;

  if (emp) {
    return res.json(emp);
  }

  const empId = id || "emp-" + Math.random().toString(36).substr(2, 6);

  // Initialize new employer with 1000 RR balance
  const newEmp = {
    id: empId,
    name: name || "Работодатель",
    email: email || "",
    telegramUsername: telegramUsername || "",
    balance: 1000,
    registeredVia: registeredVia || "google",
    createdAt: new Date().toISOString(),
    limits: {
      interviews: 0,
      trainings: 0,
      landings: 0,
      interviewSystems: 0,
      trainingSystems: 0,
    }
  };

  if (db) await saveEmployerToProTalkDB(db, newEmp);

  // Referral bonus logic
  if (refBy && db) {
    const referrer = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [refBy, refBy]);
    if (referrer) {
      referrer.balance = (Number(referrer.balance) || 0) + 1000;
      await saveEmployerToProTalkDB(db, referrer);

      const refPay = {
        id: "pay-" + Math.random().toString(36).substr(2, 9),
        companyName: (referrer.name || referrer.contact_name || "Работодатель") + " (" + (referrer.email || "") + ")",
        amount: 1000,
        itemType: "referral_reward",
        itemName: `Реферальный бонус за запуск личного кабинета друга ${name}`,
        status: "completed",
        createdAt: new Date().toISOString()
      };
      await savePaymentToProTalkDB(db, refPay);

      notifyTelegram(referrer.telegram_chat_id || referrer.telegramId || "emp-demo", `🎁 Вам начислен реферальный бонус +1000 RR! Друг ${name} зарегистрировался на платформе по вашей реф-ссылке.`);
    }
  }

  res.status(201).json(newEmp);
});

employersRouter.get("/employers/:id", async (req: Request, res: Response) => {
  const db = await getProTalkDB();
  const idParam = req.params.id;
  const cleanId = idParam ? String(idParam).replace(/^emp/i, "") : "";
  if (db) {
    const row = await db.get(
      "SELECT * FROM employers WHERE CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR id = ? OR LOWER(email) = LOWER(?) LIMIT 1",
      [idParam, cleanId, idParam, cleanId, idParam]
    );
    if (row) {
      return res.json({
        id: row.id,
        public_id: row.public_id,
        name: row.name || row.contact_name || "",
        contact_name: row.contact_name || row.name || "",
        email: row.email || row.contact_email || "",
        contact_email: row.contact_email || row.email || "",
        company_name: row.company_name || "",
        phone: row.phone || row.contact_phone || "",
        contact_phone: row.contact_phone || row.phone || "",
        telegram: row.contact_telegram || row.telegram_username || "",
        telegram_username: row.telegram_username || row.contact_telegram || "",
        contact_telegram: row.contact_telegram || row.telegram_username || "",
        telegram_chat_id: row.telegram_chat_id || "",
        balance: row.balance,
        interview_credits: row.interview_credits,
        training_credits: row.training_credits,
        landing_credits: row.landing_credits,
        interview_setup_credits: row.interview_setup_credits,
        training_setup_credits: row.training_setup_credits,
        created_at: row.created_at,
        plan: row.plan || "free",
        status: row.status || "active",
        notifications_config: row.notifications_config ? (() => { try { return JSON.parse(row.notifications_config); } catch { return null; } })() : null,
      });
    }
  }

  return res.status(404).json({ error: "Employer not found" });
});

employersRouter.put("/employers/:id", async (req: Request, res: Response) => {
  const db = await getProTalkDB();
  const idParam = req.params.id;
  const cleanId = idParam ? String(idParam).replace(/^emp/i, "") : "";
  const emp = db ? await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [idParam, idParam, cleanId, cleanId]) : null;
  if (!emp) {
    return res.status(404).json({ error: "Employer not found" });
  }

  const { 
    name, title, email, phone, telegramId,
    googleName, googleEmail, googlePhoto, googleId, googleVerified,
    telegramPhoto, telegramFirstName, telegramLastName, telegramUsername
  } = req.body;

  if (name !== undefined) emp.name = name;
  if (title !== undefined) emp.title = title;
  if (email !== undefined) emp.email = email;
  if (phone !== undefined) emp.phone = phone;
  if (telegramId !== undefined) emp.telegramId = telegramId;

  if (googleName !== undefined) emp.googleName = googleName;
  if (googleEmail !== undefined) emp.googleEmail = googleEmail;
  if (googlePhoto !== undefined) emp.googlePhoto = googlePhoto;
  if (googleId !== undefined) emp.googleId = googleId;
  if (googleVerified !== undefined) emp.googleVerified = googleVerified;

  if (telegramPhoto !== undefined) emp.telegramPhoto = telegramPhoto;
  if (telegramFirstName !== undefined) emp.telegramFirstName = telegramFirstName;
  if (telegramLastName !== undefined) emp.telegramLastName = telegramLastName;
  if (telegramUsername !== undefined) emp.telegramUsername = telegramUsername;

  if (db) await saveEmployerToProTalkDB(db, emp);

  res.json({ success: true, employer: emp });
});

employersRouter.post("/employers/:id/topup", async (req: Request, res: Response) => {
  const db = await getProTalkDB();
  const idParam = req.params.id;
  const cleanId = idParam ? String(idParam).replace(/^emp/i, "") : "";
  const emp = db ? await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [idParam, idParam, cleanId, cleanId]) : null;
  if (!emp) return res.status(404).json({ error: "Employer not found" });

  const { amountRubles } = req.body;
  const amount = Number(amountRubles);
  if (isNaN(amount) || amount < 100) {
    return res.status(400).json({ error: "Минимальный платеж 100 рублей" });
  }

  const rrCredited = amount;
  emp.balance = (Number(emp.balance) || 0) + rrCredited;

  const txId = "TX-CALC-" + Math.floor(100000 + Math.random() * 900000);
  const newPayment = {
    id: txId,
    companyName: (emp.name || emp.contact_name || "Работодатель") + " (" + (emp.email || "") + ")",
    amount: amount,
    itemType: "topup",
    itemName: `Пополнение счета (+${rrCredited} RR)`,
    status: "completed",
    createdAt: new Date().toISOString()
  };

  if (db) {
    await saveEmployerToProTalkDB(db, emp);
    await savePaymentToProTalkDB(db, newPayment);
  }

  notifyTelegram(emp.telegram_chat_id || emp.telegramId || "emp-demo", `💰 Баланс успешно пополнен на ${amount} руб. Начислено: +${rrCredited} RR.`);

  res.json({ success: true, balance: emp.balance, payment: newPayment });
});

employersRouter.post("/employers/:id/purchase", async (req: Request, res: Response) => {
  const db = await getProTalkDB();
  const idParam = req.params.id;
  const cleanId = idParam ? String(idParam).replace(/^emp/i, "") : "";
  const emp = db ? await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [idParam, idParam, cleanId, cleanId]) : null;
  if (!emp) return res.status(404).json({ error: "Employer not found" });

  const { itemType } = req.body;
  let price = 0;
  let itemName = "";

  if (itemType === "interview") {
    price = 100;
    itemName = "Интервью (1 шт)";
  } else if (itemType === "training") {
    price = 100;
    itemName = "ИИ Обучение (1 шт)";
  } else if (itemType === "landing") {
    price = 500;
    itemName = "ИИ Лендинг вакансии";
  } else if (itemType === "system_interview") {
    price = 300;
    itemName = "ИИ система интервью";
  } else if (itemType === "system_training") {
    price = 200;
    itemName = "ИИ система обучения";
  } else {
    return res.status(400).json({ error: "Неверный тип услуги" });
  }

  const currentBalance = Number(emp.balance) || 0;
  if (currentBalance < price) {
    return res.status(400).json({ error: `Недостаточно средств. Требуется ${price} RR, текущий баланс: ${currentBalance} RR.` });
  }

  emp.balance = currentBalance - price;

  if (itemType === "interview") emp.interview_credits = (Number(emp.interview_credits) || 0) + 1;
  if (itemType === "training") emp.training_credits = (Number(emp.training_credits) || 0) + 1;
  if (itemType === "landing") emp.landing_credits = (Number(emp.landing_credits) || 0) + 1;
  if (itemType === "system_interview") emp.interview_setup_credits = (Number(emp.interview_setup_credits) || 0) + 1;
  if (itemType === "system_training") emp.training_setup_credits = (Number(emp.training_setup_credits) || 0) + 1;

  const txId = "TX-BUY-" + Math.floor(1000 + Math.random() * 9000);
  const newPayment = {
    id: txId,
    companyName: (emp.name || emp.contact_name || "Работодатель") + " (" + (emp.email || "") + ")",
    amount: price,
    itemType: "purchase_" + itemType,
    itemName: `Покупка: ${itemName}`,
    status: "completed",
    createdAt: new Date().toISOString()
  };

  if (db) {
    await saveEmployerToProTalkDB(db, emp);
    await savePaymentToProTalkDB(db, newPayment);
  }

  notifyTelegram(emp.telegram_chat_id || emp.telegramId || "emp-demo", `🛍️ Приобретена услуга: "${itemName}" за ${price} RR.`);

  res.json({ success: true, balance: emp.balance, payment: newPayment });
});
