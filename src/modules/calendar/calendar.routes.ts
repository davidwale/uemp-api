import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { IdParam } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import {
  CreateSemesterBody,
  CreateSessionBody,
  UpdateSemesterBody,
  UpdateSessionBody,
} from './calendar.schemas.js';
import * as service from './calendar.service.js';

export const calendarRouter = Router();

calendarRouter.get('/current', authorize('calendar:read'), async (_req, res) => {
  res.json({ data: await service.getCurrentSemester() });
});

calendarRouter.get('/sessions', authorize('calendar:read'), async (_req, res) => {
  res.json({ data: await service.listSessions() });
});

calendarRouter.get('/semesters', authorize('calendar:read'), async (_req, res) => {
  res.json({ data: await service.listSemesters() });
});

calendarRouter.post('/sessions', authorize('calendar:manage'), async (req, res) => {
  res.status(201).json({ data: await service.createSession(actorFrom(req), CreateSessionBody.parse(req.body)) });
});

calendarRouter.patch('/sessions/:id', authorize('calendar:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateSession(actorFrom(req), id, UpdateSessionBody.parse(req.body)) });
});

calendarRouter.post('/semesters', authorize('calendar:manage'), async (req, res) => {
  res.status(201).json({ data: await service.createSemester(actorFrom(req), CreateSemesterBody.parse(req.body)) });
});

calendarRouter.patch('/semesters/:id', authorize('calendar:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateSemester(actorFrom(req), id, UpdateSemesterBody.parse(req.body)) });
});

calendarRouter.post('/semesters/:id/activate', authorize('calendar:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.activateSemester(actorFrom(req), id) });
});
