import { Op } from 'sequelize';
import { env } from '../../config/env.js';
import type { Actor } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { AppError, BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password.js';
import { generateSessionToken, hashToken } from '../../lib/tokens.js';
import {
  Department,
  Faculty,
  LecturerProfile,
  Program,
  Session,
  StudentProfile,
  User,
  sequelize,
} from '../../models/index.js';
import { permissionsFor } from '../../rbac/permissions.js';
import { getCurrentSemester } from '../calendar/calendar.service.js';

interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const INVALID_CREDENTIALS = 'Invalid email or password';

export async function login(email: string, password: string, client: ClientInfo) {
  const user = await User.findOne({ where: { email } });

  // Always run bcrypt, even for unknown emails, so response timing doesn't reveal which accounts exist.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    await audit({
      actor: null,
      action: AuditAction.LOGIN_FAILED,
      entityType: 'user',
      entityId: user?.id ?? null,
      metadata: { email },
      ip: client.ip,
    });
    throw Unauthorized(INVALID_CREDENTIALS);
  }

  // Status is only revealed once the password is proven correct.
  if (user.status !== 'ACTIVE') {
    throw new AppError(
      403,
      'ACCOUNT_DISABLED',
      user.status === 'SUSPENDED'
        ? 'Your account has been suspended. Contact the administrator.'
        : 'Your account is inactive. Contact the administrator.',
    );
  }

  const token = generateSessionToken();
  const now = new Date();

  await sequelize.transaction(async (transaction) => {
    // Housekeeping: drop this user's dead sessions.
    await Session.destroy({
      where: { userId: user.id, [Op.or]: [{ expiresAt: { [Op.lt]: now } }, { revokedAt: { [Op.ne]: null } }] },
      transaction,
    });
    await Session.create(
      {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + env.SESSION_TTL_HOURS * 3_600_000),
        lastSeenAt: now,
        ipAddress: client.ip,
        userAgent: client.userAgent?.slice(0, 512) ?? null,
        revokedAt: null,
      },
      { transaction },
    );
    await user.update({ lastLoginAt: now }, { transaction });
    await audit(
      {
        actor: { id: user.id, role: user.role, departmentId: user.departmentId ?? null, ip: client.ip },
        action: AuditAction.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        departmentId: user.departmentId ?? null,
      },
      transaction,
    );
  });

  return { token, user: await getCurrentUser(user.id) };
}

export async function logout(sessionId: string, actor: Actor) {
  await Session.update({ revokedAt: new Date() }, { where: { id: sessionId } });
  await audit({ actor, action: AuditAction.LOGOUT, entityType: 'user', entityId: actor.id });
}

export async function changePassword(actor: Actor, sessionId: string, currentPassword: string, newPassword: string) {
  const user = await User.findByPk(actor.id);
  if (!user) throw NotFound('User');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw BadRequest('Current password is incorrect');
  }

  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash: await hashPassword(newPassword) }, { transaction });
    // Sign out every other device.
    await Session.update(
      { revokedAt: new Date() },
      { where: { userId: user.id, id: { [Op.ne]: sessionId }, revokedAt: null }, transaction },
    );
    await audit({ actor, action: AuditAction.PASSWORD_CHANGED, entityType: 'user', entityId: user.id }, transaction);
  });
}

/** The shape returned by GET /auth/me — everything the client needs to render the shell. */
export async function getCurrentUser(userId: string) {
  const user = await User.findByPk(userId, {
    include: [
      { model: Department, as: 'department', include: [{ model: Faculty, as: 'faculty' }] },
      { model: StudentProfile, as: 'studentProfile', include: [{ model: Program, as: 'program' }] },
      { model: LecturerProfile, as: 'lecturerProfile' },
    ],
  });
  if (!user) throw NotFound('User');

  const currentSemester = await getCurrentSemester();

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    department: user.department
      ? {
          id: user.department.id,
          name: user.department.name,
          code: user.department.code,
          faculty: user.department.faculty
            ? { id: user.department.faculty.id, name: user.department.faculty.name, code: user.department.faculty.code }
            : null,
        }
      : null,
    studentProfile: user.studentProfile
      ? {
          matricNumber: user.studentProfile.matricNumber,
          level: user.studentProfile.level,
          entryYear: user.studentProfile.entryYear,
          gender: user.studentProfile.gender,
          dateOfBirth: user.studentProfile.dateOfBirth,
          address: user.studentProfile.address,
          program: user.studentProfile.program
            ? {
                id: user.studentProfile.program.id,
                name: user.studentProfile.program.name,
                code: user.studentProfile.program.code,
                degree: user.studentProfile.program.degree,
              }
            : null,
        }
      : null,
    lecturerProfile: user.lecturerProfile
      ? {
          staffNumber: user.lecturerProfile.staffNumber,
          title: user.lecturerProfile.title,
          rank: user.lecturerProfile.rank,
        }
      : null,
    permissions: permissionsFor(user.role),
    currentSemester,
  };
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
