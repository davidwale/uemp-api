import { Router } from 'express';
import { authenticate } from './middleware/authenticate.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { allocationsRouter, coursesRouter } from './modules/courses/courses.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { organisationRouter } from './modules/organisation/organisation.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { registrationsRouter } from './modules/registrations/registrations.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { resultsRouter } from './modules/results/results.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export const apiRouter = Router();

// Public
apiRouter.use('/auth', authRouter);

// Everything below requires an authenticated session. Each route then applies
// its own permission guard, and services apply record-level scope checks.
apiRouter.use(authenticate);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/calendar', calendarRouter);
apiRouter.use('/organisation', organisationRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/allocations', allocationsRouter);
apiRouter.use('/registrations', registrationsRouter);
apiRouter.use('/results', resultsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit-logs', auditRouter);
apiRouter.use('/settings', settingsRouter);
