/**
 * Email + password auth modal for candidates.
 * Always scoped to a specific vacancy (project) and its company.
 * On success stores a candidate session and calls onSuccess(publicId).
 */
import { useState } from "react";
import { X, Mail, Lock, Loader, CheckCircle, Phone, User, Eye, EyeOff } from "lucide-react";
import { saveCandidateSession } from "@/lib/candidateSession";
import { hexToRgba, LandingThemeConfig } from "./LandingStyleEditor";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  companyId?: string | null;
  roleName?: string;
  companyName?: string;
  onSuccess: (publicId: string, info?: { candidatePub?: string; projectPub?: string; companyPub?: string }) => void;
  themeConfig?: LandingThemeConfig | null;
};

type Tab = "signup" | "login" | "forgot";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-]{7,20}$/;

export default function CandidateAuthModal({
  isOpen, onClose, projectId, companyId, roleName, companyName, onSuccess, themeConfig,
}: Props) {
  const [tab, setTab] = useState<Tab>("signup");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [canSwitchToSignup, setCanSwitchToSignup] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  if (!isOpen) return null;

  const containerBorderRadius = themeConfig?.containerBorderRadius ?? 24;
  const containerBorderColor = themeConfig?.containerBorderColor || "#ffffff";
  const containerBorderOpacity = themeConfig?.containerBorderOpacity ?? 20;
  const containerBorderWidth = themeConfig?.containerBorderWidth ?? 1;
  const containerBgColor = themeConfig?.containerBgColor || "#17344F";
  const containerBgOpacity = themeConfig?.containerBgOpacity ?? 40;
  const containerBackdropBlur = themeConfig?.glassBlurPx ?? 24;

  const bodyTextColor = themeConfig?.bodyTextColor || "#FFFFFF";
  const fontFamily = themeConfig?.fontFamily;
  const headingsSolidColor = themeConfig?.headingsSolidColor || "#E7C768";
  const headingsColorMode = themeConfig?.headingsColorMode || "gradient-gold";

  const btnActiveBgColor = themeConfig?.btnActiveBgColor || "#E7C768";
  const btnActiveOpacity = themeConfig?.btnActiveOpacity ?? 100;
  const btnActiveTextColor = themeConfig?.btnActiveTextColor || "#17344F";
  const btnInactiveBgColor = themeConfig?.btnInactiveBgColor || "#000000";
  const btnInactiveOpacity = themeConfig?.btnInactiveOpacity ?? 25;
  const btnInactiveTextColor = themeConfig?.btnInactiveTextColor || "#CBD5E1";
  const btnBorderColor = themeConfig?.btnBorderColor || "#ffffff";
  const btnBorderOpacity = themeConfig?.btnBorderOpacity ?? 20;
  const btnBorderWidth = themeConfig?.btnBorderWidth ?? 1;
  const btnBorderRadius = themeConfig?.btnBorderRadius ?? 16;
  const accentColor = themeConfig?.btnActiveBgColor || themeConfig?.headingsSolidColor || "#E7C768";

  const errorText = (code: string) => ({
    bad_email: "Введите корректный email",
    bad_password: "Пароль должен быть не короче 8 символов",
    bad_full_name: "Введите ФИО",
    bad_phone: "Введите корректный номер телефона",
    email_taken: "Этот email уже зарегистрирован на эту вакансию — войдите",
    bad_credentials: "Неверный email или пароль",
    wrong_password: "Этот email уже используется с другим паролем",
    no_project: "Вакансия не найдена",
  }[code] || "Не удалось выполнить запрос");

  const submitForgot = async () => {
    setErr("");
    if (!EMAIL_RE.test(email.trim())) { setErr("Введите корректный email"); return; }
    setBusy(true);
    try {
      const resp = await fetch("/api/auth/candidate/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          projectId,
          companyId: companyId || null,
        }),
      });
      const res = await resp.json();
      if (!resp.ok || !res?.ok) {
        setErr(res?.message || "Не удалось отправить запрос на сброс пароля.");
        setBusy(false);
        return;
      }
      setForgotSent(true);
      setBusy(false);
    } catch {
      setErr("Не удалось связаться с сервером. Пожалуйста, попробуйте позже.");
      setBusy(false);
    }
  };

  const submit = async () => {
    if (tab === "forgot") {
      await submitForgot();
      return;
    }
    setErr("");
    setCanSwitchToSignup(false);
    if (!EMAIL_RE.test(email.trim())) { setErr("Введите корректный email"); return; }
    if (tab === "signup" && fullName.trim().length < 2) { setErr("Введите ФИО"); return; }
    if (pw.length < 8) { setErr("Пароль должен быть не короче 8 символов"); return; }
    if (tab === "signup" && pw !== pw2) { setErr("Пароли не совпадают"); return; }
    if (tab === "signup" && !PHONE_RE.test(phone.trim())) { setErr("Введите корректный номер телефона"); return; }

    setBusy(true);
    try {
      const endpoint = tab === "signup" ? "/api/auth/candidate/signup" : "/api/auth/candidate/login";
      const payload: any = tab === "signup"
        ? { _email: email.trim(), _password: pw, _project: projectId, _company: companyId || null, _phone: phone.trim(), _full_name: fullName.trim() }
        : { _email: email.trim(), _password: pw, _project: projectId, _company: companyId || null };

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const res = await resp.json();
      if (!resp.ok || !res?.ok) {
        if (res?.error === "not_applied_yet") {
          setCanSwitchToSignup(true);
        }
        setErr(res?.message || errorText(res?.error || ""));
        setBusy(false);
        return;
      }

      saveCandidateSession({
        token: res.token,
        candidate_id: res.candidate_id,
        public_id: res.public_id,
        project_id: res.project_id ?? projectId,
        company_id: res.company_id ?? companyId ?? null,
        email: email.trim().toLowerCase(),
        full_name: res.full_name || fullName.trim() || null,
      });
      setOk(true);
      setTimeout(() => {
        setOk(false);
        setBusy(false);
        onSuccess(res.public_id || res.candidate_id, {
          candidatePub: res.public_id,
          projectPub: res.project_public_id,
          companyPub: res.company_public_id,
        });
      }, 700);
    } catch {
      setErr("Не удалось войти. Проверьте e-mail и пароль или попробуйте позже.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-transparent overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`
        .candidate-modal-content::-webkit-scrollbar {
          width: 6px !important;
        }
        .candidate-modal-content::-webkit-scrollbar-track {
          background: transparent !important;
        }
        .candidate-modal-content::-webkit-scrollbar-thumb {
          background: ${accentColor} !important;
          border-radius: 9999px !important;
        }
        .candidate-modal-content::-webkit-scrollbar-thumb:hover {
          background: ${accentColor} !important;
          filter: brightness(1.2) !important;
        }
        .candidate-auth-modal .landing-btn-active,
        .candidate-auth-modal .landing-btn-active * {
          color: ${btnActiveTextColor} !important;
          -webkit-text-fill-color: ${btnActiveTextColor} !important;
        }
      `}</style>

      <div
        className="candidate-auth-modal relative w-full max-w-md max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden"
        style={{
          borderRadius: `${containerBorderRadius}px`,
          borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
          borderWidth: `${containerBorderWidth}px`,
          borderStyle: "solid",
          backgroundColor: "transparent",
          backdropFilter: `blur(${Math.max(20, containerBackdropBlur)}px)`,
          WebkitBackdropFilter: `blur(${Math.max(20, containerBackdropBlur)}px)`,
          color: bodyTextColor,
          fontFamily: fontFamily || undefined,
        }}
      >
        {/* Header */}
        <div
          className="p-4 sm:p-5 border-b flex items-start justify-between gap-3 shrink-0 bg-transparent"
          style={{ borderColor: hexToRgba(containerBorderColor, Math.max(10, containerBorderOpacity - 5)) }}
        >
          <div className="min-w-0 flex-1 text-left">
            <h3
              className={`text-lg sm:text-xl font-bold leading-tight ${
                headingsColorMode === "solid"
                  ? ""
                  : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
              }`}
              style={headingsColorMode === "solid" ? { color: headingsSolidColor } : undefined}
            >
              {tab === "forgot" ? "Восстановление пароля" : "Кабинет кандидата"}
            </h3>
            <p className="text-sm mt-1 truncate" style={{ color: bodyTextColor, opacity: 0.8 }}>
              {roleName ? <>Вакансия: <b style={{ opacity: 1 }}>{roleName}</b></> : null}
              {companyName ? <> · {companyName}</> : null}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer shrink-0"
            style={{ color: bodyTextColor }}
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          className="candidate-modal-content flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-left"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: `${accentColor} transparent`,
          }}
        >
          {ok ? (
            <div className="py-8 text-center space-y-3">
              <div
                className="w-14 h-14 mx-auto rounded-full bg-transparent flex items-center justify-center border"
                style={{ borderColor: accentColor }}
              >
                <CheckCircle className="w-7 h-7" style={{ color: accentColor }} />
              </div>
              <p className="font-bold text-base" style={{ color: accentColor }}>
                Готово! Открываем кабинет...
              </p>
            </div>
          ) : tab === "forgot" ? (
            <div className="space-y-4">
              {forgotSent ? (
                <div
                  className="p-4 rounded-xl text-left space-y-2"
                  style={{
                    backgroundColor: "transparent",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: accentColor,
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: accentColor }}>
                    Ссылка отправлена!
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: bodyTextColor }}>
                    Мы отправили ссылку для сброса пароля на адрес <strong>{email}</strong>. Пожалуйста, проверьте ваш почтовый ящик.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed" style={{ color: bodyTextColor, opacity: 0.9 }}>
                    Укажите ваш e-mail, использованный при регистрации. Мы отправим письмо со ссылкой для создания нового пароля.
                  </p>
                  <label className="block text-left">
                    <span className="text-sm font-bold block mb-1" style={{ color: bodyTextColor }}>
                      Email
                    </span>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 transition"
                      style={{
                        borderRadius: `${Math.max(8, containerBorderRadius - 8)}px`,
                        borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
                        borderWidth: `${containerBorderWidth}px`,
                        borderStyle: "solid",
                        backgroundColor: "transparent",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <Mail className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="bg-transparent outline-none w-full text-sm placeholder:opacity-50"
                        style={{ color: bodyTextColor }}
                      />
                    </div>
                  </label>
                </>
              )}

              {err && (
                <div
                  className="text-sm rounded-xl px-3 py-2 text-left"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: accentColor,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    color: accentColor,
                  }}
                >
                  {err}
                </div>
              )}

              {!forgotSent && (
                <button
                  onClick={submitForgot}
                  disabled={busy}
                  type="button"
                  style={{
                    backgroundColor: hexToRgba(btnActiveBgColor, btnActiveOpacity),
                    color: btnActiveTextColor,
                    borderRadius: btnBorderRadius === 999 ? "9999px" : `${btnBorderRadius}px`,
                    borderColor: hexToRgba(btnBorderColor, btnBorderOpacity),
                    borderWidth: `${btnBorderWidth}px`,
                    borderStyle: "solid",
                  }}
                  className="landing-btn-active w-full font-bold text-sm sm:text-base py-3 disabled:opacity-60 flex items-center justify-center gap-2 transition cursor-pointer shadow-md hover:brightness-105 active:scale-[0.98]"
                >
                  {busy ? <Loader className="w-4 h-4 animate-spin" /> : null}
                  <span style={{ color: btnActiveTextColor }}>
                    Отправить ссылку для сброса
                  </span>
                </button>
              )}

              <button
                onClick={() => { setTab("login"); setForgotSent(false); setErr(""); }}
                type="button"
                className="w-full text-sm font-medium text-center py-2 transition hover:underline cursor-pointer"
                style={{ color: accentColor }}
              >
                Вернуться ко входу
              </button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div
                className="grid grid-cols-2 gap-1 p-1 backdrop-blur-md"
                style={{
                  borderRadius: btnBorderRadius === 999 ? "9999px" : `${btnBorderRadius}px`,
                  borderColor: hexToRgba(btnBorderColor, btnBorderOpacity),
                  borderWidth: `${btnBorderWidth}px`,
                  borderStyle: "solid",
                  backgroundColor: hexToRgba(btnInactiveBgColor, btnInactiveOpacity),
                }}
              >
                {(["signup", "login"] as const).map((t) => {
                  const isActive = tab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTab(t); setErr(""); }}
                      style={{
                        backgroundColor: isActive
                          ? hexToRgba(btnActiveBgColor, btnActiveOpacity)
                          : "transparent",
                        color: isActive ? btnActiveTextColor : btnInactiveTextColor,
                        borderRadius: btnBorderRadius === 999 ? "9999px" : `${Math.max(6, btnBorderRadius - 4)}px`,
                        borderColor: isActive ? hexToRgba(btnBorderColor, btnBorderOpacity) : "transparent",
                        borderWidth: `${btnBorderWidth}px`,
                        borderStyle: "solid",
                      }}
                      className={`py-2 text-sm font-bold transition cursor-pointer shadow-sm text-center ${isActive ? "landing-btn-active" : "landing-btn-inactive"}`}
                    >
                      <span style={{ color: isActive ? btnActiveTextColor : btnInactiveTextColor }}>
                        {t === "signup" ? "Регистрация" : "Вход"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                {tab === "signup" && (
                  <label className="block text-left">
                    <span className="text-sm font-bold block mb-1" style={{ color: bodyTextColor }}>
                      ФИО
                    </span>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 transition"
                      style={{
                        borderRadius: `${Math.max(8, containerBorderRadius - 8)}px`,
                        borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
                        borderWidth: `${containerBorderWidth}px`,
                        borderStyle: "solid",
                        backgroundColor: "transparent",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <User className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                      <input
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Иванов Иван Иванович"
                        className="bg-transparent outline-none w-full text-sm placeholder:opacity-50"
                        style={{ color: bodyTextColor }}
                      />
                    </div>
                  </label>
                )}

                <label className="block text-left">
                  <span className="text-sm font-bold block mb-1" style={{ color: bodyTextColor }}>
                    Email
                  </span>
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 transition"
                    style={{
                      borderRadius: `${Math.max(8, containerBorderRadius - 8)}px`,
                      borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
                      borderWidth: `${containerBorderWidth}px`,
                      borderStyle: "solid",
                      backgroundColor: "transparent",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <Mail className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="bg-transparent outline-none w-full text-sm placeholder:opacity-50"
                      style={{ color: bodyTextColor }}
                    />
                  </div>
                </label>

                <label className="block text-left">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold block" style={{ color: bodyTextColor }}>
                      Пароль {tab === "signup" ? "(мин. 8 символов)" : ""}
                    </span>
                    {tab === "login" && (
                      <button
                        type="button"
                        onClick={() => { setTab("forgot"); setErr(""); setForgotSent(false); }}
                        className="text-sm transition hover:underline cursor-pointer"
                        style={{ color: accentColor }}
                      >
                        Забыли пароль?
                      </button>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 transition"
                    style={{
                      borderRadius: `${Math.max(8, containerBorderRadius - 8)}px`,
                      borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
                      borderWidth: `${containerBorderWidth}px`,
                      borderStyle: "solid",
                      backgroundColor: "transparent",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <Lock className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                    <input
                      type={showPw ? "text" : "password"}
                      autoComplete={tab === "signup" ? "new-password" : "current-password"}
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="••••••••"
                      className="bg-transparent outline-none w-full text-sm placeholder:opacity-50"
                      style={{ color: bodyTextColor }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                      className="p-1 hover:opacity-100 opacity-70 transition cursor-pointer"
                      style={{ color: bodyTextColor }}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>

                {tab === "signup" && (
                  <label className="block text-left">
                    <span className="text-sm font-bold block mb-1" style={{ color: bodyTextColor }}>
                      Повторите пароль
                    </span>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 transition"
                      style={{
                        borderRadius: `${Math.max(8, containerBorderRadius - 8)}px`,
                        borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
                        borderWidth: `${containerBorderWidth}px`,
                        borderStyle: "solid",
                        backgroundColor: "transparent",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <Lock className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                      <input
                        type={showPw2 ? "text" : "password"}
                        autoComplete="new-password"
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        placeholder="••••••••"
                        className="bg-transparent outline-none w-full text-sm placeholder:opacity-50"
                        style={{ color: bodyTextColor }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw2((v) => !v)}
                        aria-label={showPw2 ? "Скрыть пароль" : "Показать пароль"}
                        className="p-1 hover:opacity-100 opacity-70 transition cursor-pointer"
                        style={{ color: bodyTextColor }}
                      >
                        {showPw2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </label>
                )}

                {tab === "signup" && (
                  <label className="block text-left">
                    <span className="text-sm font-bold block mb-1" style={{ color: bodyTextColor }}>
                      Телефон
                    </span>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 transition"
                      style={{
                        borderRadius: `${Math.max(8, containerBorderRadius - 8)}px`,
                        borderColor: hexToRgba(containerBorderColor, containerBorderOpacity),
                        borderWidth: `${containerBorderWidth}px`,
                        borderStyle: "solid",
                        backgroundColor: "transparent",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <Phone className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+7 (900) 123-45-67"
                        className="bg-transparent outline-none w-full text-sm placeholder:opacity-50"
                        style={{ color: bodyTextColor }}
                      />
                    </div>
                  </label>
                )}
              </div>

              {err && (
                <div
                  className="text-sm rounded-xl px-3.5 py-3 text-left space-y-2 backdrop-blur-md"
                  style={{
                    backgroundColor: "transparent",
                    borderColor: accentColor,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    color: "#FFFFFF",
                  }}
                >
                  <p style={{ color: accentColor }}>{err}</p>
                  {canSwitchToSignup && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab("signup");
                        setErr("");
                        setCanSwitchToSignup(false);
                      }}
                      className="w-full py-2 px-3 rounded-xl border border-white/30 text-white hover:border-[#E7C768] hover:text-[#E7C768] transition cursor-pointer text-sm font-semibold mt-1"
                    >
                      Перейти к регистрации на эту вакансию
                    </button>
                  )}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={submit}
                disabled={busy}
                type="button"
                style={{
                  backgroundColor: hexToRgba(btnActiveBgColor, btnActiveOpacity),
                  color: btnActiveTextColor,
                  borderRadius: btnBorderRadius === 999 ? "9999px" : `${btnBorderRadius}px`,
                  borderColor: hexToRgba(btnBorderColor, btnBorderOpacity),
                  borderWidth: `${btnBorderWidth}px`,
                  borderStyle: "solid",
                }}
                className="landing-btn-active w-full font-bold text-sm sm:text-base py-3 disabled:opacity-60 flex items-center justify-center gap-2 transition cursor-pointer shadow-md hover:brightness-105 active:scale-[0.98]"
              >
                {busy ? <Loader className="w-4 h-4 animate-spin" /> : null}
                <span style={{ color: btnActiveTextColor }}>
                  {tab === "signup" ? "Создать кабинет" : "Войти"}
                </span>
              </button>

              <p className="text-sm text-center opacity-70" style={{ color: bodyTextColor }}>
                Подтверждение email не требуется. Пароль хранится в зашифрованном виде.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
