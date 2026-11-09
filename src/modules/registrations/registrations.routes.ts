import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { IdParam } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import { ListRegistrationsQuery, MyRegistrationsQuery, RegisterBody } from './registrations.schemas.js';
import * as service from './registrations.service.js';

export const registrationsRouter = Router();

// Student self-service
registrationsRouter.get('/available', authorize('registration:create:own'), async (req, res) => {
  res.json({ data: await service.getAvailableCourses(actorFrom(req)) });
});

registrationsRouter.get('/mine', authorize('registration:read:own'), async (req, res) => {
  const { semesterId } = MyRegistrationsQuery.parse(req.query);
  res.json({ data: await service.getMyRegistrations(actorFrom(req), semesterId) });
});

registrationsRouter.post('/', authorize('registration:create:own'), async (req, res) => {
  const { courseIds } = RegisterBody.parse(req.body);
  res.status(201).json({ data: await service.registerCourses(actorFrom(req), courseIds) });
});

registrationsRouter.delete('/:id', authorize('registration:create:own'), async (req, res) => {
  await service.dropCourse(actorFrom(req), IdParam.parse(req.params).id);
  res.status(204).end();
});

// Staff oversight
registrationsRouter.get('/', authorize('registration:read'), async (req, res) => {
  res.json(await service.listRegistrations(actorFrom(req), ListRegistrationsQuery.parse(req.query)));
});
