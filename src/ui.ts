import { create } from 'zustand';

interface Toast {
  id: number;
  text: string;
}

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let seq = 0;
export function toast(text: string, ms = 4000) {
  const id = ++seq;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
