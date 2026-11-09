import { Router } from 'express';
import { z } from 'zod';
import { actorFrom } from '../../lib/actor.js';
import { AuditAction, audit } from '../../lib/audit.js';
import { NotFound } from '../../lib/errors.js';
import { authorize } from '../../middleware/authorize.js';
import { StudentProfile, User, sequelize } from '../../models/index.js';
import { getCurrentUser } from '../auth/auth.service.js';

/**
 * Self-service profile. Users may only edit contact details; identity and
 * academic fields (name, matric number, programme, level) are controlled by
 * administrators so students cannot alter their own academic records.
 */
const UpdateOwnProfileBody = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number')
      .nullable()
      .optional(),
    address: z.string().trim().max(255).nullable().optional(),
  })
  .strict(); // reject attempts to smuggle in other fields

export const profileRouter = Router();

profileRouter.get('/', authorize('profile:read:own'), async (req, res) => {
  res.json({ data: await getCurrentUser(req.auth!.userId) });
});

profileRouter.patch('/', authorize('profile:update:own'), async (req, res) => {
  const actor = actorFrom(req);
  const input = UpdateOwnProfileBody.parse(req.body);

  await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(actor.id, { transaction });
    if (!user) throw NotFound('User');
    if (input.phone !== undefined) await user.update({ phone: input.phone }, { transaction });
    if (input.address !== undefined && actor.role === 'STUDENT') {
      await StudentProfile.update({ address: input.address }, { where: { userId: actor.id }, transaction });
    }
    await audit(
      { actor, action: AuditAction.PROFILE_UPDATED, entityType: 'user', entityId: actor.id, metadata: input },
      transaction,
    );
  });

  res.json({ data: await getCurrentUser(actor.id) });
});
