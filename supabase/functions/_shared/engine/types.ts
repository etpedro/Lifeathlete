// Pure types for the gamification engine. No runtime imports (Node and Deno safe).
export type Completion = {
  habitId: string;
  pillarId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** 0..n, 1 = goal met. */
  progress: number;
};
