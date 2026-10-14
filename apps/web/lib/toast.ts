/** Tiny global toast: any component calls toast("…"); the app shell renders it. */
export function toast(message: string, kind: "info" | "error" = "info") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("aios:toast", { detail: { message, kind } }));
}
