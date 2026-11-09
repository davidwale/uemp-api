import { Router } from 'express';
import { actorFrom } from '../../lib/actor.js';
import { IdParam } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import {
  CourseSemesterParams,
  ListSheetsQuery,
  RejectBody,
  ReopenBody,
  ReviewBody,
  SaveEntriesBody,
  TeachingQuery,
} from './results.schemas.js';
import * as service from './results.service.js';

export const resultsRouter = Router();

// Student
resultsRouter.get('/me', authorize('result:read:own'), async (req, res) => {
  res.json({ data: await service.getStudentResults(req.auth!.userId) });
});

// Lecturer
resultsRouter.get('/teaching', authorize('result:enter'), async (req, res) => {
  const { semesterId } = TeachingQuery.parse(req.query);
  res.json({ data: await service.getTeachingLoad(actorFrom(req), semesterId) });
});

resultsRouter.get('/courses/:courseId/semesters/:semesterId', authorize('result:read'), async (req, res) => {
  const { courseId, semesterId } = CourseSemesterParams.parse(req.params);
  res.json({ data: await service.getSheetView(actorFrom(req), courseId, semesterId) });
});

resultsRouter.put('/courses/:courseId/semesters/:semesterId/entries', authorize('result:enter'), async (req, res) => {
  const { courseId, semesterId } = CourseSemesterParams.parse(req.params);
  const body = SaveEntriesBody.parse(req.body);
  res.json({ data: await service.saveEntries(actorFrom(req), courseId, semesterId, body) });
});

resultsRouter.post('/courses/:courseId/semesters/:semesterId/submit', authorize('result:submit'), async (req, res) => {
  const { courseId, semesterId } = CourseSemesterParams.parse(req.params);
  res.json({ data: await service.submitSheet(actorFrom(req), courseId, semesterId) });
});

// Oversight & review
resultsRouter.get('/sheets', authorize('result:read'), async (req, res) => {
  res.json({ data: await service.listSheets(actorFrom(req), ListSheetsQuery.parse(req.query)) });
});

resultsRouter.get('/sheets/:id', authorize('result:read'), async (req, res) => {
  res.json({ data: await service.getSheetViewById(actorFrom(req), IdParam.parse(req.params).id) });
});

resultsRouter.get('/sheets/:id/history', authorize('result:read'), async (req, res) => {
  res.json({ data: await service.getSheetHistory(actorFrom(req), IdParam.parse(req.params).id) });
});

resultsRouter.post('/sheets/:id/approve', authorize('result:approve'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const { comment } = ReviewBody.parse(req.body ?? {});
  res.json({ data: await service.approveSheet(actorFrom(req), id, comment) });
});

resultsRouter.post('/sheets/:id/reject', authorize('result:approve'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const { comment } = RejectBody.parse(req.body);
  res.json({ data: await service.rejectSheet(actorFrom(req), id, comment) });
});

resultsRouter.post('/sheets/:id/reopen', authorize('result:reopen'), async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const { reason } = ReopenBody.parse(req.body);
  res.json({ data: await service.reopenSheet(actorFrom(req), id, reason) });
});
