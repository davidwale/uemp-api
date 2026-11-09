import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { IdParam } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import {
  DepartmentBody,
  DepartmentQuery,
  FacultyBody,
  ProgramBody,
  ProgramQuery,
  UpdateDepartmentBody,
  UpdateFacultyBody,
  UpdateProgramBody,
} from './organisation.schemas.js';
import * as service from './organisation.service.js';

export const organisationRouter = Router();

// Faculties
organisationRouter.get('/faculties', authorize('faculty:read'), async (_req, res) => {
  res.json({ data: await service.listFaculties() });
});
organisationRouter.post('/faculties', authorize('faculty:manage'), async (req, res) => {
  res.status(201).json({ data: await service.createFaculty(actorFrom(req), FacultyBody.parse(req.body)) });
});
organisationRouter.patch('/faculties/:id', authorize('faculty:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateFaculty(actorFrom(req), id, UpdateFacultyBody.parse(req.body)) });
});
organisationRouter.delete('/faculties/:id', authorize('faculty:manage'), async (req, res) => {
  await service.deleteFaculty(actorFrom(req), IdParam.parse(req.params).id);
  res.status(204).end();
});

// Departments
organisationRouter.get('/departments', authorize('department:read'), async (req, res) => {
  res.json({ data: await service.listDepartments(DepartmentQuery.parse(req.query)) });
});
organisationRouter.post('/departments', authorize('department:manage'), async (req, res) => {
  res.status(201).json({ data: await service.createDepartment(actorFrom(req), DepartmentBody.parse(req.body)) });
});
organisationRouter.patch('/departments/:id', authorize('department:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateDepartment(actorFrom(req), id, UpdateDepartmentBody.parse(req.body)) });
});
organisationRouter.delete('/departments/:id', authorize('department:manage'), async (req, res) => {
  await service.deleteDepartment(actorFrom(req), IdParam.parse(req.params).id);
  res.status(204).end();
});

// Programmes
organisationRouter.get('/programs', authorize('program:read'), async (req, res) => {
  res.json({ data: await service.listPrograms(ProgramQuery.parse(req.query)) });
});
organisationRouter.post('/programs', authorize('program:manage'), async (req, res) => {
  res.status(201).json({ data: await service.createProgram(actorFrom(req), ProgramBody.parse(req.body)) });
});
organisationRouter.patch('/programs/:id', authorize('program:manage'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateProgram(actorFrom(req), id, UpdateProgramBody.parse(req.body)) });
});
organisationRouter.delete('/programs/:id', authorize('program:manage'), async (req, res) => {
  await service.deleteProgram(actorFrom(req), IdParam.parse(req.params).id);
  res.status(204).end();
});
