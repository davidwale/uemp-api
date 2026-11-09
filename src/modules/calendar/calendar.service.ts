import type { Transaction } from 'sequelize';
import type { z } from 'zod';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { BusinessRule, NotFound } from '../../lib/errors.js';
import { AcademicSession, Semester, sequelize } from '../../models/index.js';
import type {
  CreateSemesterBody,
  CreateSessionBody,
  UpdateSemesterBody,
  UpdateSessionBody,
} from './calendar.schemas.js';

export const semesterLabel = (sessionName: string, type: string) =>
  `${sessionName} ${type === 'FIRST' ? 'First' : 'Second'} Semester`;

export function serializeSemester(semester: Semester) {
  return {
    id: semester.id,
    type: semester.type,
    startDate: semester.startDate,
    endDate: semester.endDate,
    isCurrent: semester.isCurrent,
    registrationOpen: semester.registrationOpen,
    session: semester.session ? { id: semester.session.id, name: semester.session.name } : null,
    label: semester.session ? semesterLabel(semester.session.name, semester.type) : semester.type,
  };
}

export type SerializedSemester = ReturnType<typeof serializeSemester>;

export async function getCurrentSemester(transaction?: Transaction): Promise<SerializedSemester | null> {
  const semester = await Semester.findOne({
    where: { isCurrent: true },
    include: [{ model: AcademicSession, as: 'session' }],
    transaction,
  });
  return semester ? serializeSemester(semester) : null;
}

export async function requireCurrentSemester(transaction?: Transaction): Promise<SerializedSemester> {
  const semester = await getCurrentSemester(transaction);
  if (!semester) throw BusinessRule('No academic semester is currently active');
  return semester;
}

export async function findSemester(id: string) {
  const semester = await Semester.findByPk(id, { include: [{ model: AcademicSession, as: 'session' }] });
  if (!semester) throw NotFound('Semester');
  return semester;
}

export async function listSessions() {
  const sessions = await AcademicSession.findAll({
    include: [{ model: Semester, as: 'semesters' }],
    order: [
      ['startDate', 'DESC'],
      [{ model: Semester, as: 'semesters' }, 'type', 'ASC'],
    ],
  });
  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    isCurrent: s.isCurrent,
    semesters: (s.semesters ?? []).map((sem) => serializeSemester(Object.assign(sem, { session: s }))),
  }));
}

/** Flat list of all semesters, newest first — used by filters across the app. */
export async function listSemesters() {
  const semesters = await Semester.findAll({
    include: [{ model: AcademicSession, as: 'session' }],
    order: [
      [{ model: AcademicSession, as: 'session' }, 'startDate', 'DESC'],
      ['type', 'DESC'],
    ],
  });
  return semesters.map(serializeSemester);
}

export async function createSession(actor: Actor, input: z.infer<typeof CreateSessionBody>) {
  return sequelize.transaction(async (transaction) => {
    const session = await AcademicSession.create(input, { transaction });
    await audit(
      { actor, action: AuditAction.SESSION_CREATED, entityType: 'academic_session', entityId: session.id, metadata: input },
      transaction,
    );
    return session;
  });
}

export async function updateSession(actor: Actor, id: string, input: z.infer<typeof UpdateSessionBody>) {
  const session = await AcademicSession.findByPk(id);
  if (!session) throw NotFound('Academic session');
  return sequelize.transaction(async (transaction) => {
    await session.update(input, { transaction });
    await audit(
      { actor, action: AuditAction.SESSION_UPDATED, entityType: 'academic_session', entityId: id, metadata: input },
      transaction,
    );
    return session;
  });
}

function assertWithinSession(session: AcademicSession, startDate: string, endDate: string) {
  if (startDate < session.startDate || endDate > session.endDate) {
    throw BusinessRule(`Semester dates must fall within the ${session.name} session (${session.startDate} – ${session.endDate})`);
  }
}

export async function createSemester(actor: Actor, input: z.infer<typeof CreateSemesterBody>) {
  const session = await AcademicSession.findByPk(input.sessionId);
  if (!session) throw NotFound('Academic session');
  assertWithinSession(session, input.startDate, input.endDate);

  return sequelize.transaction(async (transaction) => {
    const semester = await Semester.create(input, { transaction });
    await audit(
      { actor, action: AuditAction.SEMESTER_CREATED, entityType: 'semester', entityId: semester.id, metadata: input },
      transaction,
    );
    return serializeSemester(Object.assign(semester, { session }));
  });
}

export async function updateSemester(actor: Actor, id: string, input: z.infer<typeof UpdateSemesterBody>) {
  const semester = await findSemester(id);
  assertWithinSession(semester.session!, input.startDate ?? semester.startDate, input.endDate ?? semester.endDate);
  if (input.registrationOpen && !semester.isCurrent) {
    throw BusinessRule('Registration can only be opened for the current semester');
  }
  return sequelize.transaction(async (transaction) => {
    await semester.update(input, { transaction });
    await audit(
      { actor, action: AuditAction.SEMESTER_UPDATED, entityType: 'semester', entityId: id, metadata: input },
      transaction,
    );
    return serializeSemester(semester);
  });
}

/**
 * Makes a semester (and its session) the current one. The previous current
 * semester is closed for registration. Partial unique indexes in the database
 * guarantee there can never be two current semesters, even under concurrency.
 */
export async function activateSemester(actor: Actor, id: string) {
  const semester = await findSemester(id);
  return sequelize.transaction(async (transaction) => {
    await Semester.update({ isCurrent: false, registrationOpen: false }, { where: { isCurrent: true }, transaction });
    await AcademicSession.update({ isCurrent: false }, { where: { isCurrent: true }, transaction });
    await semester.update({ isCurrent: true }, { transaction });
    await AcademicSession.update({ isCurrent: true }, { where: { id: semester.sessionId }, transaction });
    await audit(
      {
        actor,
        action: AuditAction.SEMESTER_ACTIVATED,
        entityType: 'semester',
        entityId: id,
        metadata: { label: semesterLabel(semester.session!.name, semester.type) },
      },
      transaction,
    );
    return serializeSemester(semester);
  });
}
