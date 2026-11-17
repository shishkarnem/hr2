/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Password reset page supporting candidate and employer recovery with Liquid Glass design.
 */

import { useEffect, useState } from "react";
import { useRouter } from "@/components/RouterContext";
import { Lock, Loader2, CheckCircle2, Eye, EyeOff, X } from "lucide-react";
import Mascot from "@/components/Mascot";

export default function ResetPasswordPage() {
  const { navigate } = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [isCandidate, setIsCandidate] = useState(false);
  const [tokenParam, setTokenParam] = useState("");
  const [candParam, setCandParam] = useState("");
  const [comParam, setComParam] = useState("");
  const [vacParam, setVacParam] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const token = params.get("token") || "";
    const cand = params.get("cand") || "";
    const com = params.get("com") || "";
    const vac = params.get("vac") || "";

    setTokenParam(token);
    setCandParam(cand);
    setComParam(com);
    setVacParam(vac);

    if (type === "candidate" || cand) {
      setIsCandidate(true);
    }
  }, []);

  const submit = async () => {
    setErr("");
    if (pw.length < 8) {
      setErr("Пароль должен быть не короче 8 символов");
      return;
    }
    if (pw !== pw2) {
      setErr("Пароли не совпадают");
      return;
    }
    setBusy(true);

    try {
      if (isCandidate) {
        // PostgreSQL BD ProTalk Candidate reset password endpoint
        const resp = await fetch("/api/auth/candidate/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenParam, password: pw }),
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.message || data.error || "Не удалось обновить пароль соискателя");
        }

        const resolvedCandId = data.publicId || candParam || "200733";
        const cleanCand = String(resolvedCandId).replace(/^cand/i, "").replace(/^candidate/i, "");
        const cleanCom = String(data.companyPublicId || comParam || "300047").replace(/^com/i, "");
        const cleanVac = String(data.projectPublicId || vacParam || "400007").replace(/^vac/i, "");

        localStorage.setItem("cand_session_id", `cand${cleanCand}`);

        setOk(true);
        const targetUrl = `/com${cleanCom}/vac${cleanVac}/cand${cleanCand}/profile`;
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 1200);
      } else {
        // Employer update password endpoint
        const params = new URLSearchParams(window.location.search);
        const email = params.get("email") || "";

        const resp = await fetch("/api/auth/employer/update-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenParam, email, password: pw }),
        });

        const data = await resp.json();
        if (!resp.ok || data.error) {
          throw new Error(data.error || "Не удалось обновить пароль");
        }

        if (data.token) {
          localStorage.setItem("emp_token", data.token);
        }
        if (data.user) {
          localStorage.setItem("emp_user", JSON.stringify(data.user));
        }

        const pid = data.publicId || data.user?.publicId || data.user?.public_id;
        const targetUrl = pid ? `/emp${pid}/profile` : "/setup";

        setOk(true);
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 1200);
      }
    } catch (e: any) {
      setErr(e?.message || "Не удалось обновить пароль");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4 text-white">
      <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl max-w-md w-full p-6 md:p-8 space-y-5 shadow-2xl relative text-left">
        <button
          onClick={() => navigate("/")}
          className="absolute top-4 right-4 hover:bg-white/10 p-2 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
          title="Закрыть"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center flex flex-col items-center gap-2 pb-2 border-b border-white/15">
          <Mascot state="greeting" size="md" />
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
            Задайте новый пароль
          </h1>
          <p className="text-sm text-slate-300">
            {isCandidate
              ? "Создайте новый пароль для доступа в личный кабинет соискателя"
              : "Придумайте пароль длиной не менее 8 символов"}
          </p>
        </div>

        {ok ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-transparent border border-[#E7C768] flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-[#E7C768]" />
            </div>
            <p className="text-white font-bold text-sm">
              Пароль успешно обновлён. Открываем личный кабинет...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm text-slate-300 font-semibold block mb-1">
                Новый пароль
              </span>
              <div className="flex items-center gap-2 bg-transparent backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2.5 transition focus-within:border-[#E7C768]">
                <Lock className="w-4 h-4 text-[#E7C768] shrink-0" />
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Минимум 8 символов"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                  className="p-1 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="text-sm text-slate-300 font-semibold block mb-1">
                Повторите новый пароль
              </span>
              <div className="flex items-center gap-2 bg-transparent backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2.5 transition focus-within:border-[#E7C768]">
                <Lock className="w-4 h-4 text-[#E7C768] shrink-0" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="Повторите пароль"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400"
                />
              </div>
            </label>

            {err && (
              <div className="bg-transparent backdrop-blur-md border border-[#E7C768] p-3 text-sm text-[#E7C768] rounded-2xl font-medium">
                {err}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] hover:brightness-105 disabled:opacity-60 text-[#17344F] font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer shadow-lg"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin text-[#17344F]" /> : "Обновить пароль"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
