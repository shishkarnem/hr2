import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw, Trash2, Copy, Check } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Global ErrorBoundary Caught Exception]", error, errorInfo);
    if (error?.message?.includes("Failed to fetch dynamically imported module")) {
      const reloadKey = "dyn_import_auto_reload";
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 15000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
        return;
      }
    }
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = () => {
    try {
      sessionStorage.clear();
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  private handleCopyError = () => {
    const text = `Error: ${this.state.error?.message}\nStack:\n${this.state.error?.stack}\nComponentStack:\n${this.state.errorInfo?.componentStack}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-transparent text-white flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="p-3 bg-transparent backdrop-blur-md border border-[#E7C768]/40 text-[#E7C768] rounded-2xl">
                <AlertOctagon className="w-7 h-7 text-[#E7C768]" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  Произошла ошибка при загрузке интерфейса
                </h1>
                <p className="text-sm text-white/80">
                  Приложение столкнулось с непредвиденным сбоем клиентского кода.
                </p>
              </div>
            </div>

            <div className="bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-4 font-mono text-sm text-white/90 overflow-x-auto max-h-60 space-y-2">
              <div className="font-bold text-[#F4EE8E]">{this.state.error?.toString()}</div>
              {this.state.error?.stack && (
                <pre className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                  {this.state.error.stack}
                </pre>
              )}
              {this.state.errorInfo?.componentStack && (
                <details className="mt-2 text-white/60">
                  <summary className="cursor-pointer text-white/80 hover:text-white text-sm">Стек компонентов React</summary>
                  <pre className="mt-2 text-sm whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                </details>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm shadow-lg hover:brightness-110 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Обновить страницу
              </button>

              <button
                onClick={this.handleClearCacheAndReload}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-transparent backdrop-blur-md hover:border-[#E7C768] text-white font-medium text-sm border border-white/20 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-[#E7C768]" />
                Сбросить кэш сессии и обновить
              </button>

              <button
                onClick={this.handleCopyError}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-transparent backdrop-blur-md hover:border-[#E7C768] text-white font-medium text-sm border border-white/20 transition ml-auto cursor-pointer"
              >
                {this.state.copied ? <Check className="w-4 h-4 text-[#E7C768]" /> : <Copy className="w-4 h-4" />}
                {this.state.copied ? "Скопировано" : "Скопировать детали ошибки"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
