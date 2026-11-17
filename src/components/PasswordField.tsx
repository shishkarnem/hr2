import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  inputStyle?: React.CSSProperties;
  style?: React.CSSProperties;
};

/**
 * Reusable password input with show/hide toggle. Styled in Apple Liquid Glass
 * mode, transparent background, backdrop-blur, text >= 14px.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  className,
  inputStyle,
  style,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className={`space-y-1.5 ${className || ""}`} style={style}>
      {label && <label className="text-sm font-bold text-white/80 block">{label}</label>}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white p-3 pr-10 border focus:outline-none backdrop-blur-md transition"
          style={{
            borderColor: "rgba(255, 255, 255, 0.20)",
            borderRadius: "12px",
            ...inputStyle,
          }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white transition cursor-pointer"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}