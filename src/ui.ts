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

let hapticSwitch: HTMLLabelElement | null = null;
/**
 * A short buzz under the finger. Android has navigator.vibrate; iPhones don't, but Safari (iOS 18+)
 * gives a tick when a switch-style checkbox is toggled, so a hidden one is toggled instead.
 */
export function haptic() {
  if (navigator.vibrate?.(10)) return;
  try {
    if (!hapticSwitch) {
      hapticSwitch = document.createElement('label');
      hapticSwitch.ariaHidden = 'true';
      hapticSwitch.style.cssText =
        'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      hapticSwitch.append(input);
      document.body.append(hapticSwitch);
    }
    hapticSwitch.click();
  } catch {
    /* no haptics here */
  }
}
