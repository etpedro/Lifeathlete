/** Notices of the Today screen (the view maps each kind to localized copy). */
export type TodayNotice =
  | { kind: "save" }
  | { kind: "load" }
  /** The day could not be loaded and never loaded before: the habits are shown blank (logged values unknown) so taps still queue. */
  | { kind: "fallback" }
  /** The day could not be reloaded: its last loaded (real) values are shown; new taps queue. */
  | { kind: "fallbackStale" }
  /** A tap arrived just after midnight: the view moved to the new day and the tap was not saved. */
  | { kind: "rolledOver" }
  | { kind: "outsideWindow" }
  | { kind: "dropped"; count: number };

/** Informational notices are announced politely; failures that need the user's attention are alerts. */
export function noticeRole(notice: TodayNotice): "status" | "alert" {
  return notice.kind === "fallback" || notice.kind === "fallbackStale" || notice.kind === "rolledOver" ? "status" : "alert";
}
