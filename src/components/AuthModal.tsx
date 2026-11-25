/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth modal for employers. Three modes:
 *   • register — email + password + fullName + phone (+ ref)
 *   • login    — email + password (+ "Forgot password?" link)
 *   • forgot   — email → resetPasswordForEmail
 *
 * Google OAuth is preserved as a quick-login alternative at the top.
 * After email-signUp the SessionBootstrap layer auto-invokes signup-bootstrap
 * (which handles referral + welcome bonus), same as Google-flow.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "./RouterContext";
import { dbClient } from "@/lib/dbClient";
import { readCachedEmployerPublicIdForUser, resolveProfilePathForUser } from "@/lib/links";
import Mascot from "./Mascot";
import { X, Gift, Mail, Lock, User, Phone, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import LegalConsentBlock from "./legal/LegalConsentBlock";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  intent?: "employer" | "candidate";
  initialMode?: "register" | "login" | "forgot";
  surfaceVariant?: "glass" | "blue-gradient";
  onSuccess?: () => void;
}

type Mode = "register" | "login" | "forgot";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-]{7,20}$/;

export default function AuthModal({
  isOpen,
  onClose,
  intent = "employer",
  initialMode = "login",
  surfaceVariant = "glass",
  onSuccess,
}: AuthModalProps) {
  const { navigate } = useRouter();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [errorText, setErrorText] = useState("");
  const [infoText, setInfoText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [offerOk, setOfferOk] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode || "login");
      setErrorText("");
      setInfoText("");
      setIsSuccess(false);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const resetErrors = () => { setErrorText(""); setInfoText(""); };
  const switchMode = (m: Mode) => { resetErrors(); setMode(m); };

  const resolveProfilePath = async (): Promise<string> => {
    try {
      const empUserStr = localStorage.getItem("emp_user");
      if (empUserStr) {
        const u = JSON.parse(empUserStr);
        const pid = u.publicId || u.public_id || u.employerId;
        if (pid) return `/emp${pid.replace(/^emp-?/, "")}/profile`;
      }
    } catch { /* ignore */ }
    try {
      const { data: { user } } = await dbClient.auth.getUser();
      if (user) return await resolveProfilePathForUser(user.id);
    } catch { /* ignore */ }
    return "/setup";
  };

  const onSuccessRedirect = async () => {
    setIsSuccess(true);
    setIsLoading(false);
    try {
      sessionStorage.removeItem("employer_preloaded");
      sessionStorage.setItem("show_employer_entry_loader", "1");
    } catch {}
    if (onSuccess) {
      setTimeout(() => {
        onClose();
        onSuccess();
      }, 400);
      return;
    }
    const target = await resolveProfilePath();
    setTimeout(() => {
      onClose();
      window.location.replace(target);
    }, 600);
  };

  const handleGoogle = async () => {
    if (!offerOk) { setErrorText("Для регистрации необходимо согласие с правовыми документами платформы."); return; }
    resetErrors(); setIsLoading(true);
    try {
      try { localStorage.setItem("rr_offer_accepted", "1"); } catch { /* ignore */ }
      try { sessionStorage.setItem("show_employer_entry_loader", "1"); } catch { /* ignore */ }
      let employerRedirect = "/setup";
      try {
        const { data: { user } } = await dbClient.auth.getUser();
        const cachedPid = user ? readCachedEmployerPublicIdForUser(user.id) : null;
        if (cachedPid) employerRedirect = `/emp${cachedPid}/profile`;
      } catch { /* ignore */ }
      const { error } = await dbClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${intent === "employer" ? employerRedirect : "/main"}`,
          queryParams: { intent, offer_accepted: "1" },
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setErrorText(e.message || "Ошибка Google авторизации");
      setIsLoading(false);
    }
  };

  const validateRegister = (): string | null => {
    if (!EMAIL_RE.test(email.trim())) return "Введите корректный email";
    if (fullName.trim().length < 2) return "Введите ФИО";
    if (!PHONE_RE.test(phone.trim())) return "Введите корректный номер телефона";
    if (pw.length < 8) return "Пароль должен быть не короче 8 символов";
    if (pw !== pw2) return "Пароли не совпадают";
    if (!offerOk) return "Для регистрации необходимо согласие с правовыми документами платформы";
    return null;
  };

  const handleRegister = async () => {
    resetErrors();
    const err = validateRegister();
    if (err) { setErrorText(err); return; }
    setIsLoading(true);
    try {
      try { localStorage.setItem("rr_offer_accepted", "1"); } catch { /* ignore */ }
      // Read ref from URL/localStorage — SessionBootstrap keeps it in rr_ref.
      let ref: string | undefined;
      try {
        const u = new URL(window.location.href);
        const q = (u.searchParams.get("ref") || "").trim();
        if (q) ref = q.toLowerCase();
        if (!ref) {
          const stored = (localStorage.getItem("rr_ref") || "").trim();
          if (stored) ref = stored.toLowerCase();
        }
      } catch { /* ignore */ }

      const emailNorm = email.trim().toLowerCase();
      const res = await fetch("/api/auth/employer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailNorm,
          password: pw,
          fullName: fullName.trim(),
          phone: phone.trim(),
          ref,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {
        setErrorText("Ошибка ответа сервера");
        setIsLoading(false);
        return;
      }

      if (!res.ok || data.error) {
        setErrorText(data.error || "Не удалось зарегистрировать");
        setIsLoading(false);
        return;
      }

      if (data.token) {
        localStorage.setItem("emp_token", data.token);
        localStorage.setItem("emp_user", JSON.stringify(data.user));
      }

      await onSuccessRedirect();
    } catch (e: any) {
      setErrorText(e.message || "Не удалось зарегистрировать");
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    resetErrors();
    if (!EMAIL_RE.test(email.trim())) { setErrorText("Введите корректный email"); return; }
    if (pw.length < 1) { setErrorText("Введите пароль"); return; }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/employer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: pw,
        }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {
        setErrorText("Ошибка сервера (получен не-JSON ответ)");
        setIsLoading(false);
        return;
      }
      if (!res.ok || data.error) {
        setErrorText(data.error || "Неверный email или пароль");
        setIsLoading(false);
        return;
      }
      if (data.token) {
        localStorage.setItem("emp_token", data.token);
        localStorage.setItem("emp_user", JSON.stringify(data.user));
      }
      await onSuccessRedirect();
    } catch (e: any) {
      setErrorText(e.message || "Не удалось войти");
      setIsLoading(false);
    }
  };

  const handleForgot = async () => {
    resetErrors();
    if (!EMAIL_RE.test(email.trim())) { setErrorText("Введите корректный email"); return; }
    setIsLoading(true);
    try {
      const resp = await fetch("/api/auth/employer/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const text = await resp.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {
        throw new Error("Не удалось разобрать ответ сервера");
      }
      if (!resp.ok || data.error) {
        throw new Error(data.error || "Не удалось отправить инструкцию");
      }
      setInfoText(data.message || "Письмо с инструкцией по сбросу пароля отправлено. Проверьте почту.");
    } catch (e: any) {
      setErrorText(e.message || "Не удалось отправить письмо");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "register") return handleRegister();
    if (mode === "login") return handleLogin();
    return handleForgot();
  };

  const isBlueGradient = surfaceVariant === "blue-gradient";

  const modalNode = (
    <div className="fixed inset-0 z-[950] flex items-center justify-center p-4">
      <div
        className={
          isBlueGradient
            ? "fixed inset-0 bg-gradient-to-br from-[#0F2438]/90 via-[#17344F]/90 to-[#265582]/90 backdrop-blur-2xl transition-opacity"
            : "fixed inset-0 bg-transparent backdrop-blur-2xl transition-opacity"
        }
        onClick={onClose}
      />
      <div
        className={`${
          isBlueGradient
            ? "bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/45"
            : "bg-transparent backdrop-blur-2xl border border-white/20"
        } text-white rounded-3xl max-w-lg w-full max-h-[92dvh] overflow-y-auto p-6 md:p-8 space-y-4 shadow-2xl relative z-10 text-left animate-in fade-in zoom-in duration-200`}
      >

        <button
          onClick={onClose}
          className="absolute top-4 right-4 hover:bg-white/10 p-2 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center flex flex-col items-center gap-2 pb-2 border-b border-white/10">
          <Mascot state="greeting" size="md" />
          <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
            {intent === "employer" ? "Личный кабинет работодателя" : "Вход для кандидата"}
          </h2>
          <p className="text-sm text-slate-200">
            ИИ подбор персонала, запуск авто-собеседований и интерактивного обучения
          </p>
        </div>

        {mode === "register" && (
          <div className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-3.5 space-y-1.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[#E7C768] font-bold text-sm">
              <Gift className="w-4 h-4 text-[#E7C768]" />
              <span>Бонус при регистрации: +1000 RR на счёт</span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              Хватит на ИИ-лендинг вакансии (500 RR), систему интервью (200 RR) и обучения (300 RR).
            </p>
          </div>
        )}

        {/* Mode tabs */}
        <div className="grid grid-cols-3 gap-1 bg-transparent border border-white/20 p-1 rounded-2xl backdrop-blur-md">
          {([
            ["register", "Регистрация"],
            ["login", "Вход"],
            ["forgot", "Забыли пароль"],
          ] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`py-2.5 text-sm font-bold rounded-xl transition cursor-pointer ${
                mode === m ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] shadow" : "text-slate-200 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3.5">
          {mode === "register" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-slate-200 font-bold">ФИО</span>
                <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                  <User className="w-4 h-4 text-slate-300" />
                  <input type="text" autoComplete="name" value={fullName}
                    onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван Иванович"
                    className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
                </div>
              </label>
              <label className="block">
                <span className="text-sm text-slate-200 font-bold">Email</span>
                <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                  <Mail className="w-4 h-4 text-slate-300" />
                  <input type="email" autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                    className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
                </div>
              </label>
            </div>
          )}

          {mode !== "register" && (
            <label className="block">
              <span className="text-sm text-slate-200 font-bold">Email</span>
              <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                <Mail className="w-4 h-4 text-slate-300" />
                <input type="email" autoComplete="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
              </div>
            </label>
          )}

          {mode === "register" && (
            <label className="block">
              <span className="text-sm text-slate-200 font-bold">Телефон</span>
              <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                <Phone className="w-4 h-4 text-slate-300" />
                <input type="tel" inputMode="tel" autoComplete="tel" value={phone}
                  onChange={e => setPhone(e.target.value)} placeholder="+7 (900) 123-45-67"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
              </div>
            </label>
          )}

          {mode === "register" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-slate-200 font-bold">Пароль (мин. 8)</span>
                <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                  <Lock className="w-4 h-4 text-slate-300" />
                  <input type={showPw ? "text" : "password"} autoComplete="new-password"
                    value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"
                    className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                    className="p-1 text-slate-300 hover:text-white transition">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-sm text-slate-200 font-bold">Повторите пароль</span>
                <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                  <Lock className="w-4 h-4 text-slate-300" />
                  <input type="password" autoComplete="new-password" value={pw2}
                    onChange={e => setPw2(e.target.value)} placeholder="••••••••"
                    className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
                </div>
              </label>
            </div>
          )}

          {mode === "login" && (
            <label className="block">
              <span className="text-sm text-slate-200 font-bold">Пароль</span>
              <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                <Lock className="w-4 h-4 text-slate-300" />
                <input type={showPw ? "text" : "password"} autoComplete="current-password"
                  value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                  className="p-1 text-slate-300 hover:text-white transition">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
          )}
        </div>

        {mode === "register" && (
          <LegalConsentBlock mode="employer" checked={offerOk} onChange={setOfferOk} context="register" />
        )}

        {mode === "login" && (
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => switchMode("register")}
              className="text-slate-200 hover:text-white underline underline-offset-2"
            >
              Ещё нет аккаунта? <span className="text-[#E7C768] font-bold">Зарегистрироваться</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-[#E7C768] hover:underline underline-offset-2"
            >
              Забыли пароль?
            </button>
          </div>
        )}

        {mode === "register" && (
          <div className="text-center text-sm">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-slate-200 hover:text-white underline underline-offset-2"
            >
              Уже есть аккаунт? <span className="text-[#E7C768] font-bold">Войти в кабинет</span>
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={isLoading}
          onClick={handleSubmit}
          className="w-full bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 disabled:opacity-60 text-[#17344F] font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer shadow-md"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
            (mode === "register" ? "Создать кабинет" : mode === "login" ? "Войти" : "Отправить письмо")}
        </button>

        {errorText && (
          <div className="bg-transparent border border-[#E7C768] p-3 text-sm text-[#E7C768] rounded-xl font-semibold backdrop-blur-md">
            {errorText}
          </div>
        )}

        {infoText && (
          <div className="bg-transparent border border-white/20 p-3 text-sm text-slate-200 rounded-xl font-semibold backdrop-blur-md">
            {infoText}
          </div>
        )}

        {isSuccess && (
          <div className="bg-transparent border border-[#E7C768] p-3 text-sm text-[#E7C768] rounded-xl font-semibold flex items-center gap-2 backdrop-blur-md">
            <CheckCircle2 className="w-4 h-4" /> Готово! Открываем кабинет...
          </div>
        )}

        <p className="text-sm text-slate-300 text-center leading-relaxed">
          Безопасное соединение
        </p>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}
