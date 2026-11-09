import { Router } from 'express';
import { z } from 'zod';
import { actorFrom } from '../../lib/actor.js';
import { sendCsv } from '../../lib/csv.js';
import { optionalUuid } from '../../lib/schemas.js';
import { authorize } from '../../middleware/authorize.js';
import * as service from './reports.service.js';

const ReportQuery = z.object({
  departmentId: optionalUuid,
  programId: optionalUuid,
  semesterId: optionalUuid,
  level: z.coerce.number().int().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export const reportsRouter = Router();
reportsRouter.use(authorize('report:read'));

reportsRouter.get('/students', async (req, res) => {
  const { format, ...filter } = ReportQuery.parse(req.query);
  const rows = await service.studentListReport(actorFrom(req), filter);
  if (format === 'csv') {
    return sendCsv(res, 'student-list.csv', [
      { key: 'matricNumber', header: 'Matric Number' },
      { key: 'lastName', header: 'Last Name' },
      { key: 'firstName', header: 'First Name' },
      { key: 'email', header: 'Email' },
      { key: 'level', header: 'Level' },
      { key: 'program', header: 'Programme' },
      { key: 'department', header: 'Department' },
      { key: 'entryYear', header: 'Entry Year' },
      { key: 'status', header: 'Status' },
    ], rows);
  }
  res.json({ data: rows });
});

reportsRouter.get('/registrations', async (req, res) => {
  const { format, ...filter } = ReportQuery.parse(req.query);
  const report = await service.registrationReport(actorFrom(req), filter);
  if (format === 'csv') {
    return sendCsv(res, 'course-registrations.csv', [
      { key: 'code', header: 'Course Code' },
      { key: 'title', header: 'Title' },
      { key: 'units', header: 'Units' },
      { key: 'level', header: 'Level' },
      { key: 'department', header: 'Department' },
      { key: 'lecturer', header: 'Lecturer' },
      { key: 'registered', header: 'Registered Students' },
      { key: 'resultStatus', header: 'Result Status' },
    ], report.rows);
  }
  res.json({ data: report });
});

reportsRouter.get('/performance', async (req, res) => {
  const { format, ...filter } = ReportQuery.parse(req.query);
  const report = await service.performanceReport(actorFrom(req), filter);
  if (format === 'csv') {
    const flat = report.rows.map(({ distribution, ...r }) => ({ ...r, ...distribution }));
    return sendCsv(res, 'academic-performance.csv', [
      { key: 'code', header: 'Course Code' },
      { key: 'title', header: 'Title' },
      { key: 'department', header: 'Department' },
      { key: 'students', header: 'Students' },
      { key: 'average', header: 'Average' },
      { key: 'highest', header: 'Highest' },
      { key: 'lowest', header: 'Lowest' },
      { key: 'passRate', header: 'Pass Rate (%)' },
      { key: 'A', header: 'A' },
      { key: 'B', header: 'B' },
      { key: 'C', header: 'C' },
      { key: 'D', header: 'D' },
      { key: 'E', header: 'E' },
      { key: 'F', header: 'F' },
    ], flat);
  }
  res.json({ data: report });
});
