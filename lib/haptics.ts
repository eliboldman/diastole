// A small tap for satisfying moments. On the iPhone app it goes to the native haptic engine (web
// views can't vibrate); elsewhere it uses the browser's vibration where there is one.
type Bridge = { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } };

export function haptic(style: "success" | "light" | "rigid" = "light") {
  if (typeof window === "undefined") return;
  const native = (window as unknown as Bridge).webkit?.messageHandlers?.diastole;
  if (native) return native.postMessage({ type: "haptic", style });
  navigator.vibrate?.(style === "success" ? [12, 50, 18] : style === "rigid" ? 18 : 8);
}
