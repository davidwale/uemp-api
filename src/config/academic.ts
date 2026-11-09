/**
 * Academic policy constants.
 *
 * The grading scale itself lives in the `grade_scales` table (editable by the
 * Super Admin). These are structural rules that change rarely and are
 * therefore kept in code, where they are version-controlled and reviewable.
 */
export const ACADEMIC_POLICY = {
  /** Maximum obtainable continuous-assessment score. */
  CA_MAX_SCORE: 30,
  /** Maximum obtainable examination score. CA + exam = 100. */
  EXAM_MAX_SCORE: 70,
  /** Upper bound on credit units a student may carry in one semester. */
  MAX_UNITS_PER_SEMESTER: 24,
  /** Allowed academic levels (100L … 700L). Bounded per-programme by its duration. */
  LEVELS: [100, 200, 300, 400, 500, 600, 700] as const,
} as const;
