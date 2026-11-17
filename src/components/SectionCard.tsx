import React from "react";
import { useInView } from "@/hooks/useInView";

type Props = {
  id?: string;
  icon?: React.ReactNode;
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms
};

/**
 * Glassy section card with gold gradient title, soft inner glow,
 * and on-scroll reveal animation. All colors/animations come from
 * the existing Tailwind tokens (#1E4468 / #E7C768 brand palette).
 */
export default function SectionCard({
  id,
  icon,
  eyebrow,
  title,
  children,
  className = "",
  delay = 0,
}: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const hasHeader = Boolean(icon || eyebrow || title);

  return (
    <section
      id={id}
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        "section-card liquid-glass-card relative overflow-hidden",
        "bg-transparent backdrop-blur-2xl",
        "border border-white/20 hover:border-[#E7C768]/60",
        "shadow-xl rounded-3xl",
        "px-[2%] sm:px-6 md:px-8 py-5 md:py-8 transition-[opacity,transform,border-color] duration-500 ease-out",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      ].join(" ")}
    >
      {hasHeader && (
        <div className="section-card-header relative flex items-center gap-3 mb-4 md:mb-5">
          {icon && (
            <div className="landing-btn-active landing-icon-container w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <span className="block text-sm font-semibold text-slate-300">
                {eyebrow}
              </span>
            )}
            {title && (
              <h2 className="text-xl md:text-2xl font-bold leading-tight bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {title}
              </h2>
            )}
          </div>
        </div>
      )}

      <div className="relative text-sm">{children}</div>
    </section>
  );
}