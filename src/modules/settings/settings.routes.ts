import { Router } from 'express';
import { z } from 'zod';
import { actorFrom } from '../../lib/actor.js';
import { authorize } from '../../middleware/authorize.js';
import * as service from './settings.service.js';

const GradeScaleBody = z.object({
  bands: z
    .array(
      z.object({
        grade: z.string().trim().min(1).max(2),
        minScore: z.coerce.number().int().min(0).max(100),
        maxScore: z.coerce.number().int().min(0).max(100),
        gradePoint: z.coerce.number().int().min(0).max(10),
        remark: z.string().trim().min(1).max(30),
      }),
    )
    .min(2)
    .max(12),
});

export const settingsRouter = Router();

// Any authenticated user may read the academic settings (students see the grading key on their results).
settingsRouter.get('/academic', async (_req, res) => {
  res.json({ data: await service.getAcademicSettings() });
});

settingsRouter.put('/grade-scale', authorize('settings:manage'), async (req, res) => {
  const { bands } = GradeScaleBody.parse(req.body);
  res.json({ data: await service.replaceGradeScale(actorFrom(req), bands) });
});

settingsRouter.get('/permissions', authorize('settings:manage'), (_req, res) => {
  res.json({ data: service.getPermissionMatrix() });
});
