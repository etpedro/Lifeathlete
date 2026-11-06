export type LocaleSwitchStatus = "idle" | "working" | "error";

export type LocaleSwitchDeps = {
  /** Stores the new locale (profiles.locale). */
  save: () => Promise<void>;
  /** Switches the URL locale (router.replace(pathname, { locale })). */
  navigate: () => void;
};

/**
 * Language switch on Perfil: save first, switch the URL only when saved (otherwise the
 * stored locale would send the user straight back). Choosing the current locale is a no-op.
 */
export async function runLocaleSwitch(
  next: string,
  current: string,
  deps: LocaleSwitchDeps,
): Promise<"done" | "error" | "unchanged"> {
  if (next === current) return "unchanged";
  try {
    await deps.save();
  } catch {
    return "error";
  }
  deps.navigate();
  return "done";
}
