"use client";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "./api";

export type Me = { user: { id: string; email: string; name?: string }; tenant: { id: string; name: string }; plan: string; planName: string; byokOnly: boolean; limits: Record<string, number>; aiKeys: number; aiReady: boolean; role: string };
export const useMe = () => useSWR<Me>("/me", fetcher, { revalidateOnFocus: false });

/** Tab state kept in the URL hash (#studio) so tabs are linkable and survive static export. */
export function useHashTab<T extends string>(valid: readonly T[], fallback: T): [T, (t: T) => void] {
  const [tab, setTab] = useState<T>(fallback);
  useEffect(() => {
    const read = () => { const h = window.location.hash.slice(1) as T; if (valid.includes(h)) setTab(h); };
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = useCallback((t: T) => { setTab(t); history.replaceState(null, "", `#${t}`); }, []);
  return [tab, set];
}
