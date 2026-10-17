"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { api, token } from "@/lib/api";
import { Lang, translate } from "@/lib/i18n";

type Theme = "light" | "dark";
type Ctx = { lang: Lang; theme: Theme; setLang: (l: Lang) => void; setTheme: (t: Theme) => void; t: (s: string) => string };
const PrefsCtx = createContext<Ctx>({ lang: "en", theme: "light", setLang() {}, setTheme() {}, t: (s) => s });
export const usePrefs = () => useContext(PrefsCtx);

const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

function paint(lang: Lang, theme: Theme) {
  const d = document.documentElement;
  d.lang = lang; d.dir = lang === "ar" ? "rtl" : "ltr";
  if (theme === "dark") d.setAttribute("data-theme", "dark"); else d.removeAttribute("data-theme");
}

/** Language (en/ar, with RTL) and light/dark theme. Stored in the browser and, when signed in, on the account. */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const d = document.documentElement;
    const l: Lang = d.lang === "ar" ? "ar" : "en", th: Theme = d.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setLangState(l); setThemeState(th);
    // First visit on this browser: pick up the account's saved choice.
    if (token() && !read("aios_lang") && !read("aios_theme")) {
      api("/me/prefs/ui").then((r) => {
        const v = r?.value; if (!v) return;
        const nl: Lang = v.lang === "ar" ? "ar" : "en", nt: Theme = v.theme === "dark" ? "dark" : "light";
        setLangState(nl); setThemeState(nt); paint(nl, nt); store("aios_lang", nl); store("aios_theme", nt);
      }).catch(() => {});
    }
  }, []);

  const sync = useCallback((l: Lang, th: Theme) => { if (token()) api("/me/prefs/ui", { method: "PUT", body: JSON.stringify({ value: { lang: l, theme: th } }) }).catch(() => {}); }, []);
  const setLang = useCallback((l: Lang) => { setLangState(l); store("aios_lang", l); paint(l, theme); sync(l, theme); }, [theme, sync]);
  const setTheme = useCallback((th: Theme) => { setThemeState(th); store("aios_theme", th); paint(lang, th); sync(lang, th); }, [lang, sync]);
  const value = useMemo<Ctx>(() => ({ lang, theme, setLang, setTheme, t: (s) => translate(lang, s) }), [lang, theme, setLang, setTheme]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

/** The two small switches shown at the top right of the homepage and the signed-in app. */
export function PrefsControls({ className = "" }: { className?: string }) {
  const { lang, theme, setLang, setTheme, t } = usePrefs();
  const btn = "flex h-9 min-w-9 items-center justify-center rounded-full border border-line bg-surface px-2 text-xs font-bold text-ink transition hover:bg-paper";
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button type="button" className={btn} onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={t(lang === "ar" ? "Switch to English" : "Switch to Arabic")} title={t("Language")}>{lang === "ar" ? "EN" : "ع"}</button>
      <button type="button" className={btn} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={t(theme === "dark" ? "Switch to light mode" : "Switch to dark mode")} aria-pressed={theme === "dark"}>
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
