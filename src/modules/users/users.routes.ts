import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { IdParam } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import {
  CreateUserBody,
  ListUsersQuery,
  ResetPasswordBody,
  UpdateRoleBody,
  UpdateStatusBody,
  UpdateUserBody,
} from './users.schemas.js';
import * as service from './users.service.js';

export const usersRouter = Router();

usersRouter.get('/', authorize('user:read'), async (req, res) => {
  res.json(await service.listUsers(actorFrom(req), ListUsersQuery.parse(req.query)));
});

usersRouter.get('/:id', authorize('user:read'), async (req, res) => {
  res.json({ data: await service.getUser(actorFrom(req), IdParam.parse(req.params).id) });
});

usersRouter.post('/', authorize('user:create'), async (req, res) => {
  res.status(201).json({ data: await service.createUser(actorFrom(req), CreateUserBody.parse(req.body)) });
});

usersRouter.patch('/:id', authorize('user:update'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateUser(actorFrom(req), id, UpdateUserBody.parse(req.body)) });
});

usersRouter.patch('/:id/status', authorize('user:status'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateStatus(actorFrom(req), id, UpdateStatusBody.parse(req.body)) });
});

usersRouter.patch('/:id/role', authorize('user:role'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  res.json({ data: await service.updateRole(actorFrom(req), id, UpdateRoleBody.parse(req.body)) });
});

usersRouter.post('/:id/reset-password', authorize('user:update'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  await service.resetPassword(actorFrom(req), id, ResetPasswordBody.parse(req.body).password);
  res.status(204).end();
});
