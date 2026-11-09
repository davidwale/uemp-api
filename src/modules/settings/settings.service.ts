import type { Transaction } from 'sequelize';
import { ACADEMIC_POLICY } from '../../config/academic.js';
import type { GradeBand } from '../../domain/grading.js';
import { validateGradeScale } from '../../domain/grading.js';
import { ROLES } from '../../domain/enums.js';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { BusinessRule } from '../../lib/errors.js';
import { GradeScale, sequelize } from '../../models/index.js';
import { PERMISSIONS } from '../../rbac/permissions.js';

export async function getGradeScale(transaction?: Transaction): Promise<GradeBand[]> {
  const bands = await GradeScale.findAll({ order: [['minScore', 'DESC']], transaction });
  return bands.map(({ grade, minScore, maxScore, gradePoint, remark }) => ({
    grade,
    minScore,
    maxScore,
    gradePoint,
    remark,
  }));
}

/**
 * Replaces the grading scale. Only affects results graded from now on:
 * approved results keep the grade they were approved with (grades are
 * stored on each result entry at approval time, not recomputed on read).
 */
export async function replaceGradeScale(actor: Actor, bands: GradeBand[]) {
  const normalised = bands.map((b) => ({ ...b, grade: b.grade.trim().toUpperCase() }));
  const errors = validateGradeScale(normalised);
  if (errors.length) throw BusinessRule('The grading scale is invalid', errors);

  return sequelize.transaction(async (transaction) => {
    const before = await getGradeScale(transaction);
    await GradeScale.destroy({ where: {}, transaction });
    await GradeScale.bulkCreate(normalised, { transaction });
    await audit(
      {
        actor,
        action: AuditAction.GRADE_SCALE_UPDATED,
        entityType: 'grade_scale',
        metadata: { before, after: normalised },
      },
      transaction,
    );
    return getGradeScale(transaction);
  });
}

export async function getAcademicSettings() {
  return {
    gradeScale: await getGradeScale(),
    caMaxScore: ACADEMIC_POLICY.CA_MAX_SCORE,
    examMaxScore: ACADEMIC_POLICY.EXAM_MAX_SCORE,
    maxUnitsPerSemester: ACADEMIC_POLICY.MAX_UNITS_PER_SEMESTER,
  };
}

/** The live RBAC matrix, exposed read-only so administrators can audit who can do what. */
export function getPermissionMatrix() {
  return {
    roles: ROLES,
    permissions: Object.entries(PERMISSIONS).map(([permission, roles]) => ({ permission, roles })),
  };
}
