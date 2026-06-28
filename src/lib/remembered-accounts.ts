/**
 * Opt-in client-side persistence for remembered PSN accounts.
 *
 * The npsso lives in an httpOnly cookie while a session is alive, so it cannot
 * be read by JS to offer a "Continue as <onlineId>" quick-select once that
 * cookie is gone. To survive sign-out/expiry we persist the account here, but
 * ONLY when the user explicitly opts in: the npsso is password-grade (#83), so
 * this is the single at-rest copy and never written without consent.
 *
 * Modeled on `transactions-store`: a typed `localStorage` store plus a
 * `useSyncExternalStore` hook so onboarding re-renders when an account lands or
 * is forgotten.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";

const STORAGE_KEY = "psn-playtime:remembered-accounts";

/** Fired on the same tab after a write (the `storage` event only fires cross-tab). */
const CHANGED_EVENT = "psn-playtime:remembered-accounts-changed";

const rememberedAccountSchema = z.object({
  onlineId: z.string().min(1),
  avatarUrl: z.string().optional(),
  /** Password-grade npsso token. Only persisted with explicit opt-in. */
  npsso: z.string().min(1),
});

export type RememberedAccount = z.infer<typeof rememberedAccountSchema>;

const storeSchema = z.array(rememberedAccountSchema);

/** Stable empty reference so `useSyncExternalStore` snapshots don't churn. */
const EMPTY: readonly RememberedAccount[] = Object.freeze([]);

// Cache the parsed snapshot keyed on the raw string so `getSnapshot` returns a
// stable reference between renders (required by `useSyncExternalStore`).
let cachedRaw: string | null = null;
let cachedValue: readonly RememberedAccount[] = EMPTY;

function parse(raw: string): readonly RememberedAccount[] {
  try {
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Read the remembered accounts, most-recent first. Empty when none/corrupt/unavailable. */
export function loadRememberedAccounts(): readonly RememberedAccount[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = raw === null ? EMPTY : parse(raw);
  return cachedValue;
}

function write(accounts: RememberedAccount[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Persist (or refresh) a remembered account, moving it to the front so the most
 * recently used account is shown first. De-dupes by `onlineId`.
 */
export function rememberAccount(account: RememberedAccount): void {
  if (typeof window === "undefined") return;
  const others = loadRememberedAccounts().filter((a) => a.onlineId !== account.onlineId);
  write([account, ...others]);
}

/** Remove a remembered account and notify same-tab subscribers. */
export function forgetAccount(onlineId: string): void {
  if (typeof window === "undefined") return;
  const remaining = loadRememberedAccounts().filter((a) => a.onlineId !== onlineId);
  write(remaining);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Subscribe to the remembered accounts. Returns an empty list on the server and
 * until the first client read, so SSR and the initial client render agree.
 */
export function useRememberedAccounts(): readonly RememberedAccount[] {
  return useSyncExternalStore(subscribe, loadRememberedAccounts, () => EMPTY);
}
