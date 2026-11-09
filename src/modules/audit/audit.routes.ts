import { Router } from 'express';
import { Op, type WhereOptions } from 'sequelize';
import { z } from 'zod';
import { actorFrom } from '../../lib/actor.js';
import { PaginationQuery, paginated, toLimitOffset } from '../../lib/pagination.js';
import { isoDate, optionalUuid } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import { AuditLog, User } from '../../models/index.js';
import { scopedDepartmentId } from '../../rbac/scope.js';

const AuditQuery = PaginationQuery.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: optionalUuid,
  actorId: optionalUuid,
  departmentId: optionalUuid,
  from: isoDate.optional(),
  to: isoDate.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const auditRouter = Router();

/** Super Admin: university-wide. Department Admin: their department's trail only. */
auditRouter.get('/', authorize('audit:read'), async (req, res) => {
  const actor = actorFrom(req);
  const q = AuditQuery.parse(req.query);
  const departmentId = scopedDepartmentId(actor, q.departmentId);

  const where: WhereOptions = {};
  if (departmentId) Object.assign(where, { departmentId });
  if (q.action) Object.assign(where, { action: { [Op.startsWith]: q.action } });
  if (q.entityType) Object.assign(where, { entityType: q.entityType });
  if (q.entityId) Object.assign(where, { entityId: q.entityId });
  if (q.actorId) Object.assign(where, { actorId: q.actorId });
  if (q.from || q.to) {
    Object.assign(where, {
      createdAt: {
        ...(q.from ? { [Op.gte]: new Date(`${q.from}T00:00:00Z`) } : {}),
        ...(q.to ? { [Op.lte]: new Date(`${q.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    order: [['createdAt', 'DESC']],
    ...toLimitOffset(q),
  });

  res.json(
    paginated(
      rows.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        actor: l.actor ? { id: l.actor.id, fullName: l.actor.fullName, email: l.actor.email } : null,
        actorRole: l.actorRole,
        metadata: l.metadata,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
      })),
      count,
      q,
    ),
  );
});
