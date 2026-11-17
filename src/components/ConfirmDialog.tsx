import React, { createContext, useCallback, useContext, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

// Fallback: when provider is missing, fall back to native confirm so
// callers keep working even outside the host.
const fallback: ConfirmFn = async (opts) =>
  typeof window !== "undefined" ? window.confirm(`${opts.title}${opts.description ? "\n\n" + opts.description : ""}`) : true;

export function useConfirm(): ConfirmFn {
  return useContext(Ctx) || fallback;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!state} onOpenChange={(open) => { if (!open) close(false); }}>
        <AlertDialogContent className="bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl text-white overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold">
              {state?.title}
            </AlertDialogTitle>
            {state?.description && (
              <AlertDialogDescription className="text-white/90 text-sm whitespace-pre-line">
                {state.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => close(false)}
              className="bg-transparent backdrop-blur-md border-white/25 text-white hover:border-[#E7C768] rounded-xl text-sm cursor-pointer"
            >
              {state?.cancelLabel || "Отмена"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold hover:brightness-105 rounded-xl text-sm cursor-pointer"
            >
              {state?.confirmLabel || "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}