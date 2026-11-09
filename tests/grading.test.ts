import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADE_SCALE,
  classOfDegree,
  computeGpa,
  computeGrade,
  gradeFor,
  validateGradeScale,
} from '../src/domain/grading.js';

describe('gradeFor', () => {
  it.each([
    [100, 'A', 5],
    [70, 'A', 5],
    [69, 'B', 4],
    [69.5, 'B', 4],
    [60, 'B', 4],
    [59.99, 'C', 3],
    [50, 'C', 3],
    [45, 'D', 2],
    [44, 'E', 1],
    [40, 'E', 1],
    [39.5, 'F', 0],
    [0, 'F', 0],
  ])('maps a total of %s to %s (%s points)', (total, grade, gradePoint) => {
    expect(gradeFor(total, DEFAULT_GRADE_SCALE)).toEqual({ grade, gradePoint });
  });

  it('rejects totals outside 0–100', () => {
    expect(() => gradeFor(-1, DEFAULT_GRADE_SCALE)).toThrow(RangeError);
    expect(() => gradeFor(100.5, DEFAULT_GRADE_SCALE)).toThrow(RangeError);
  });
});

describe('computeGrade', () => {
  it('adds CA and exam scores and grades the total', () => {
    expect(computeGrade(25, 48, DEFAULT_GRADE_SCALE)).toEqual({ totalScore: 73, grade: 'A', gradePoint: 5 });
    expect(computeGrade(12.5, 30, DEFAULT_GRADE_SCALE)).toEqual({ totalScore: 42.5, grade: 'E', gradePoint: 1 });
  });
});

describe('computeGpa (credit-unit weighted)', () => {
  it('weights grade points by course units', () => {
    // (3×5 + 2×3 + 1×0) / 6 = 21 / 6 = 3.5
    const result = computeGpa([
      { units: 3, gradePoint: 5 },
      { units: 2, gradePoint: 3 },
      { units: 1, gradePoint: 0 },
    ]);
    expect(result).toEqual({ totalUnits: 6, totalGradePoints: 21, gpa: 3.5 });
  });

  it('rounds to two decimal places', () => {
    // (3×5 + 3×4 + 3×4) / 9 = 39 / 9 = 4.333…
    expect(computeGpa([{ units: 3, gradePoint: 5 }, { units: 3, gradePoint: 4 }, { units: 3, gradePoint: 4 }]).gpa).toBe(4.33);
  });

  it('returns 0 when there are no graded courses', () => {
    expect(computeGpa([]).gpa).toBe(0);
  });
});

describe('classOfDegree', () => {
  it.each([
    [5, 'First Class'],
    [4.5, 'First Class'],
    [4.49, 'Second Class (Upper Division)'],
    [3.5, 'Second Class (Upper Division)'],
    [2.4, 'Second Class (Lower Division)'],
    [1.5, 'Third Class'],
    [1.0, 'Pass'],
    [0.99, 'Fail'],
  ])('%s → %s', (cgpa, expected) => expect(classOfDegree(cgpa)).toBe(expected));
});

describe('validateGradeScale', () => {
  it('accepts the default scale', () => {
    expect(validateGradeScale(DEFAULT_GRADE_SCALE)).toEqual([]);
  });

  it('detects gaps between bands', () => {
    const gappy = DEFAULT_GRADE_SCALE.map((b) => (b.grade === 'B' ? { ...b, minScore: 61 } : b));
    expect(validateGradeScale(gappy).join(' ')).toMatch(/contiguous/);
  });

  it('detects a scale that does not reach 100 or start at 0', () => {
    const truncated = DEFAULT_GRADE_SCALE.filter((b) => b.grade !== 'A' && b.grade !== 'F');
    const errors = validateGradeScale(truncated);
    expect(errors).toContain('The lowest band must start at 0');
    expect(errors).toContain('The highest band must end at 100');
  });

  it('detects duplicate grade letters', () => {
    const dup = DEFAULT_GRADE_SCALE.map((b) => (b.grade === 'E' ? { ...b, grade: 'D' } : b));
    expect(validateGradeScale(dup)).toContain('Each grade letter must be unique');
  });
});
