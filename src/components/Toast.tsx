"use client";

import { create } from "zustand";
import { useEffect, type ReactNode } from "react";
import { CheckCircle, XCircle, Info } from "lucide-react";

// ----- Store -----
type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

let toastCounter = 0;

interface ToastState {
  toasts: ToastItem[];
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast(message, type) {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, createdAt: Date.now() }] }));
  },
  removeToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// ----- Convenience export -----
export const toast = {
  success: (message: string) => useToastStore.getState().addToast(message, "success"),
  error: (message: string) => useToastStore.getState().addToast(message, "error"),
  info: (message: string) => useToastStore.getState().addToast(message, "info"),
};

// ----- ToastCard -----
function ToastCard({ item }: { item: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(item.id), 4000);
    return () => clearTimeout(timer);
  }, [item.id, removeToast]);

  const borderColor =
    item.type === "success" ? "border-l-green-500" :
    item.type === "error" ? "border-l-red-500" : "border-l-blue-500";

  const Icon =
    item.type === "success" ? CheckCircle :
    item.type === "error" ? XCircle : Info;

  return (
    <div
      className={`flex items-center gap-3 w-80 bg-zinc-800 border border-zinc-700 ${borderColor} border-l-4 rounded-lg shadow-lg p-4 animate-slide-in`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-sm text-zinc-200">{item.message}</span>
      <button
        onClick={() => removeToast(item.id)}
        className="text-zinc-500 hover:text-zinc-300 shrink-0"
      >
        <XCircle className="w-4 h-4" />
      </button>
    </div>
  );
}

// ----- ToastContainer -----
export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in { animation: slideIn 0.25s ease-out; }
      `}</style>
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </div>
    </>
  );
}
