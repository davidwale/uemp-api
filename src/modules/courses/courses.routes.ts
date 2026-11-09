import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { IdParam } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import {
  AllocationBody,
  CourseBody,
  ListAllocationsQuery,
  ListCoursesQuery,
  UpdateCourseBody,
} from './courses.schemas.js';
import * as service from './courses.service.js';

export const coursesRouter = Router();

coursesRouter.get('/', authorize('course:read'), async (req, res) => {
  res.json(await service.listCourses(actorFrom(req), ListCoursesQuery.parse(req.query)));
});
coursesRouter.get('/:id', authorize('course:read'), async (req, res) => {
  res.json({ data: await service.getCourse(actorFrom(req), IdParam.parse(req.params).id) });
});
coursesRouter.post('/', authorize('course:manage'), async (req, res) => {
  res.status(201).json({ data: await service.createCourse(actorFrom(req), CourseBody.parse(req.body)) });
});
coursesRouter.patch('/:id', authorize('course:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateCourse(actorFrom(req), id, UpdateCourseBody.parse(req.body)) });
});
coursesRouter.delete('/:id', authorize('course:manage'), async (req, res) => {
  await service.deleteCourse(actorFrom(req), IdParam.parse(req.params).id);
  res.status(204).end();
});

export const allocationsRouter = Router();

allocationsRouter.get('/', authorize('allocation:read'), async (req, res) => {
  res.json({ data: await service.listAllocations(actorFrom(req), ListAllocationsQuery.parse(req.query)) });
});
allocationsRouter.post('/', authorize('allocation:manage'), async (req, res) => {
  res.status(201).json({ data: await service.allocateCourse(actorFrom(req), AllocationBody.parse(req.body)) });
});
allocationsRouter.delete('/:id', authorize('allocation:manage'), async (req, res) => {
  await service.removeAllocation(actorFrom(req), IdParam.parse(req.params).id);
  res.status(204).end();
});
