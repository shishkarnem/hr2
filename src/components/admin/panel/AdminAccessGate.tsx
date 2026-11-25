import React, { useState } from "react";
import { ShieldCheck, LogIn, UserPlus, ArrowLeft, LogOut } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { dbClient, getAuthHeaders } from "@/lib/dbClient";
import { GLASS_CARD_CLASS, GOLD_BUTTON_CLASS, GOLD_TEXT_CLASS } from "./adminConfig";

export interface VerifiedAdminUser {
  id: string;
  publicId?: string | number;
  public_id?: string | number;
  name?: string;
  email?: string;
  role?: string;
}

interface AdminAccessGateProps {
  authenticated: boolean;
  currentUser: VerifiedAdminUser | null;
  onAuthenticated: () => void;
  onNavigateHome: () => void;
  onNavigateProfile: () => void;
}

export function AdminAccessGate({
  authenticated,
  currentUser,
  onAuthenticated,
  onNavigateHome,
  onNavigateProfile,
}: AdminAccessGateProps) {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const handleSwitchAccount = async () => {
    try {
      await fetch("/api/auth/employer/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      }).catch(() => {});
    } catch {}
    await dbClient.auth.signOut();
    try {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("current_employer_id");
    } catch {}
    setAuthMode("login");
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2438] via-[#17344F] to-[#265582] text-white flex items-center justify-center px-4 py-8">
      {!authModalOpen && (
        <div className="max-w-md w-full p-6 sm:p-8 text-center space-y-6 rounded-3xl border border-[#E7C768]/45 bg-gradient-to-br from-[#17344F]/95 via-[#1E4468]/95 to-[#265582]/95 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-transparent border border-[#E7C768]/50 mx-auto flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-[#E7C768]" />
        </div>

        <div className="space-y-2.5">
          <h1 className={`text-2xl font-bold ${GOLD_TEXT_CLASS}`}>
            {authenticated ? "Доступ ограничен" : "Панель администратора"}
          </h1>
          {authenticated ? (
            <p className="text-sm text-white/90 leading-relaxed break-words">
              Вы вошли как <span className="font-semibold text-[#F4EE8E]">{currentUser?.email || currentUser?.name || "пользователь"}</span>{" "}
              с ролью <span className="font-semibold text-[#E7C768]">{currentUser?.role || "employer"}</span>.
              Раздел доступен только зарегистрированным пользователям с ролью администратора или супер-администратора в базе данных.
            </p>
          ) : (
            <p className="text-sm text-white/90 leading-relaxed">
              Для входа в панель администратора необходимо зарегистрироваться или войти в аккаунт с ролью администратора или супер-администратора в базе данных.
            </p>
          )}
        </div>

        {!authenticated ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthModalOpen(true);
              }}
              className={`w-full py-3 px-4 rounded-2xl text-sm flex items-center justify-center gap-2 ${GOLD_BUTTON_CLASS}`}
            >
              <LogIn className="w-4 h-4 text-[#17344F]" />
              <span>Войти в аккаунт</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthModalOpen(true);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-transparent border border-white/25 hover:border-[#E7C768] text-white text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#E7C768]" />
              <span>Зарегистрироваться</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={onNavigateProfile}
              className={`w-full py-3 px-4 rounded-2xl text-sm flex items-center justify-center gap-2 ${GOLD_BUTTON_CLASS}`}
            >
              <ArrowLeft className="w-4 h-4 text-[#17344F]" />
              <span>Вернуться в личный кабинет</span>
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full py-3 px-4 rounded-2xl bg-transparent border border-white/25 hover:border-[#E7C768] text-white text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#E7C768]" />
              <span>Войти под другим аккаунтом</span>
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-white/15">
          <button
            type="button"
            onClick={onNavigateHome}
            className="text-sm text-[#E7C768] hover:underline cursor-pointer"
          >
            На главную страницу
          </button>
        </div>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        intent="employer"
        initialMode={authMode}
        surfaceVariant="blue-gradient"
        onSuccess={() => {
          setAuthModalOpen(false);
          onAuthenticated();
        }}
      />
    </div>
  );
}
