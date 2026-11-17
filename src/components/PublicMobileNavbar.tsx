import React from "react";
import { useRouter } from "@/components/RouterContext";
import { Home, BookOpen, Sparkles, Briefcase, GraduationCap } from "lucide-react";

export default function PublicMobileNavbar() {
  const { path, navigate } = useRouter();

  const isCurrent = (target: string) => {
    if (target === "/" || target === "/main") {
      return path === "/" || path === "/main" || path === "";
    }
    if (target === "/blog") {
      return path.startsWith("/blog");
    }
    if (target === "/demo") {
      return path.startsWith("/demo");
    }
    if (target === "/vacancies") {
      return path.startsWith("/vacancies");
    }
    if (target === "/academy") {
      return path.startsWith("/academy");
    }
    return false;
  };

  const navItems = [
    { label: "Главная", path: "/main", icon: Home },
    { label: "Блог", path: "/blog", icon: BookOpen },
    { label: "Демо", path: "/demo", icon: Sparkles },
    { label: "Вакансии", path: "/vacancies", icon: Briefcase },
    { label: "Академия", path: "/academy", icon: GraduationCap },
  ];

  return (
    <nav
      aria-label="Мобильная навигация"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-auto bg-transparent border-none border-0 shadow-none px-2 py-1.5"
      style={{
        backgroundColor: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        border: "none",
      }}
    >
      <div className="flex items-center justify-around w-full max-w-lg mx-auto bg-transparent">
        {navItems.map((item) => {
          const active = isCurrent(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center py-1 px-1.5 transition-transform active:scale-95 cursor-pointer bg-transparent border-0"
              style={{ background: "transparent" }}
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  active ? "text-[#E7C768]" : "text-white/70 hover:text-white"
                }`}
              />
              <span
                className={`text-[14px] mt-0.5 font-medium transition-colors ${
                  active
                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
