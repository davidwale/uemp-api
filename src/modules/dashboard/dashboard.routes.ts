import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { getDashboard } from './dashboard.service.js';

export const dashboardRouter = Router();

/** Each role receives its own dashboard payload; scope is derived from the session, never from input. */
dashboardRouter.get('/', async (req, res) => {
  res.json({ data: await getDashboard(actorFrom(req)) });
});
