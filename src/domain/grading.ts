/**
 * Grading & GPA — pure functions with no I/O, so they can be unit-tested
 * exhaustively and reused anywhere (services, reports, seeders).
 *
 * GPA uses the standard credit-unit-weighted formula:
 *
 *            Σ (course units × grade point)
 *   GPA  =  ────────────────────────────────
 *                   Σ course units
 *
 * CGPA applies the same formula across every approved result to date.
 * Results are rounded to 2 decimal places only at presentation time.
 */

export interface GradeBand {
  grade: string;
  minScore: number;
  maxScore: number;
  gradePoint: number;
  remark: string;
}

export interface GradedCourse {
  units: number;
  gradePoint: number;
}

export interface ComputedGrade {
  totalScore: number;
  grade: string;
  gradePoint: number;
}

/** Default scale (Nigerian NUC 5-point scale). Seeded into `grade_scales` and editable by Super Admin. */
export const DEFAULT_GRADE_SCALE: readonly GradeBand[] = [
  { grade: 'A', minScore: 70, maxScore: 100, gradePoint: 5, remark: 'Excellent' },
  { grade: 'B', minScore: 60, maxScore: 69, gradePoint: 4, remark: 'Very Good' },
  { grade: 'C', minScore: 50, maxScore: 59, gradePoint: 3, remark: 'Good' },
  { grade: 'D', minScore: 45, maxScore: 49, gradePoint: 2, remark: 'Fair' },
  { grade: 'E', minScore: 40, maxScore: 44, gradePoint: 1, remark: 'Pass' },
  { grade: 'F', minScore: 0, maxScore: 39, gradePoint: 0, remark: 'Fail' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Maps a total score to its grade band. Totals are compared against the band's
 * lower bound so fractional totals (e.g. 69.5) fall into the correct band
 * without gaps between integer-bounded ranges.
 */
export function gradeFor(totalScore: number, scale: readonly GradeBand[]): Omit<ComputedGrade, 'totalScore'> {
  if (totalScore < 0 || totalScore > 100) {
    throw new RangeError(`Total score must be between 0 and 100, received ${totalScore}`);
  }
  const band = [...scale].sort((a, b) => b.minScore - a.minScore).find((b) => totalScore >= b.minScore);
  if (!band) throw new Error(`Grading scale has no band covering a score of ${totalScore}`);
  return { grade: band.grade, gradePoint: band.gradePoint };
}

export function computeGrade(caScore: number, examScore: number, scale: readonly GradeBand[]): ComputedGrade {
  const totalScore = round2(caScore + examScore);
  return { totalScore, ...gradeFor(totalScore, scale) };
}

export interface GpaSummary {
  totalUnits: number;
  totalGradePoints: number;
  gpa: number;
}

export function computeGpa(courses: readonly GradedCourse[]): GpaSummary {
  const totalUnits = courses.reduce((sum, c) => sum + c.units, 0);
  const totalGradePoints = courses.reduce((sum, c) => sum + c.units * c.gradePoint, 0);
  return {
    totalUnits,
    totalGradePoints,
    gpa: totalUnits === 0 ? 0 : round2(totalGradePoints / totalUnits),
  };
}

/** Degree classification on a 5-point scale. */
export function classOfDegree(cgpa: number): string {
  if (cgpa >= 4.5) return 'First Class';
  if (cgpa >= 3.5) return 'Second Class (Upper Division)';
  if (cgpa >= 2.4) return 'Second Class (Lower Division)';
  if (cgpa >= 1.5) return 'Third Class';
  if (cgpa >= 1.0) return 'Pass';
  return 'Fail';
}

/**
 * Validates that a grading scale fully and unambiguously covers 0–100
 * on integer boundaries: no gaps, no overlaps, unique grades.
 */
export function validateGradeScale(scale: readonly GradeBand[]): string[] {
  const errors: string[] = [];
  if (scale.length === 0) return ['Grading scale must have at least one band'];

  const grades = new Set(scale.map((b) => b.grade.toUpperCase()));
  if (grades.size !== scale.length) errors.push('Each grade letter must be unique');

  const sorted = [...scale].sort((a, b) => a.minScore - b.minScore);
  if (sorted[0]!.minScore !== 0) errors.push('The lowest band must start at 0');
  if (sorted[sorted.length - 1]!.maxScore !== 100) errors.push('The highest band must end at 100');

  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i]!;
    if (band.minScore > band.maxScore) errors.push(`Band ${band.grade}: min score exceeds max score`);
    const next = sorted[i + 1];
    if (next && next.minScore !== band.maxScore + 1) {
      errors.push(`Bands ${band.grade} and ${next.grade} must be contiguous (gap or overlap at ${band.maxScore})`);
    }
  }
  return errors;
}
