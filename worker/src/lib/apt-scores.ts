import type { AptComplexRow, BattleScores } from "../types";

type AptScoreLike = Pick<AptComplexRow, "s_transport" | "s_walk" | "s_value" | "s_childcare" | "s_safety">;

// Apartment rows may still carry copied s_* cache columns from collect time.
// Repository queries resolve fresh district_scores first and fall back only when
// a district row is missing, so every read path shares the same latest source.
export function readAptScores(row: AptScoreLike): BattleScores {
  return {
    transport: row.s_transport ?? 0,
    walk: row.s_walk ?? 0,
    value: row.s_value ?? 0,
    childcare: row.s_childcare ?? 0,
    safety: row.s_safety ?? 0,
  };
}
