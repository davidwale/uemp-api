/**
 * Central model registry. All associations are declared here — in one place —
 * so the relational structure of the system can be read top to bottom.
 *
 * Foreign keys on academic records use RESTRICT: deleting a course, student or
 * semester that has registrations or results must fail rather than silently
 * cascading away official records.
 */
import { sequelize } from '../db/sequelize.js';
import { AcademicSession } from './AcademicSession.js';
import { AuditLog } from './AuditLog.js';
import { Course } from './Course.js';
import { CourseAllocation } from './CourseAllocation.js';
import { CourseProgram } from './CourseProgram.js';
import { CourseRegistration } from './CourseRegistration.js';
import { Department } from './Department.js';
import { Faculty } from './Faculty.js';
import { GradeScale } from './GradeScale.js';
import { LecturerProfile } from './LecturerProfile.js';
import { Program } from './Program.js';
import { ResultEntry } from './ResultEntry.js';
import { ResultSheet } from './ResultSheet.js';
import { Semester } from './Semester.js';
import { Session } from './Session.js';
import { StudentProfile } from './StudentProfile.js';
import { User } from './User.js';

const RESTRICT = { onDelete: 'RESTRICT', onUpdate: 'CASCADE' } as const;

// ── Organisation ────────────────────────────────────────────────────────────
Faculty.hasMany(Department, { foreignKey: 'facultyId', as: 'departments', ...RESTRICT });
Department.belongsTo(Faculty, { foreignKey: 'facultyId', as: 'faculty' });

Department.hasMany(Program, { foreignKey: 'departmentId', as: 'programs', ...RESTRICT });
Program.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Department.hasMany(User, { foreignKey: 'departmentId', as: 'members', ...RESTRICT });
User.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

// ── People ──────────────────────────────────────────────────────────────────
User.hasOne(StudentProfile, { foreignKey: 'userId', as: 'studentProfile', onDelete: 'CASCADE' });
StudentProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
StudentProfile.belongsTo(Program, { foreignKey: 'programId', as: 'program', ...RESTRICT });

User.hasOne(LecturerProfile, { foreignKey: 'userId', as: 'lecturerProfile', onDelete: 'CASCADE' });
LecturerProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Session, { foreignKey: 'userId', as: 'sessions', onDelete: 'CASCADE' });
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── Calendar ────────────────────────────────────────────────────────────────
AcademicSession.hasMany(Semester, { foreignKey: 'sessionId', as: 'semesters', ...RESTRICT });
Semester.belongsTo(AcademicSession, { foreignKey: 'sessionId', as: 'session' });

// ── Courses ─────────────────────────────────────────────────────────────────
Department.hasMany(Course, { foreignKey: 'departmentId', as: 'courses', ...RESTRICT });
Course.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Course.belongsToMany(Program, { through: CourseProgram, foreignKey: 'courseId', otherKey: 'programId', as: 'programs' });
Program.belongsToMany(Course, { through: CourseProgram, foreignKey: 'programId', otherKey: 'courseId', as: 'courses' });

CourseAllocation.belongsTo(Course, { foreignKey: 'courseId', as: 'course', ...RESTRICT });
CourseAllocation.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester', ...RESTRICT });
CourseAllocation.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer', ...RESTRICT });
CourseAllocation.belongsTo(User, { foreignKey: 'allocatedById', as: 'allocatedBy', onDelete: 'SET NULL' });
Course.hasMany(CourseAllocation, { foreignKey: 'courseId', as: 'allocations' });

// ── Registration ────────────────────────────────────────────────────────────
CourseRegistration.belongsTo(User, { foreignKey: 'studentId', as: 'student', ...RESTRICT });
CourseRegistration.belongsTo(Course, { foreignKey: 'courseId', as: 'course', ...RESTRICT });
CourseRegistration.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester', ...RESTRICT });
CourseRegistration.hasOne(ResultEntry, { foreignKey: 'registrationId', as: 'resultEntry' });
User.hasMany(CourseRegistration, { foreignKey: 'studentId', as: 'registrations' });

// ── Results ─────────────────────────────────────────────────────────────────
ResultSheet.belongsTo(Course, { foreignKey: 'courseId', as: 'course', ...RESTRICT });
ResultSheet.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester', ...RESTRICT });
ResultSheet.belongsTo(User, { foreignKey: 'lecturerId', as: 'lecturer', ...RESTRICT });
ResultSheet.belongsTo(User, { foreignKey: 'reviewedById', as: 'reviewedBy', onDelete: 'SET NULL' });
ResultSheet.hasMany(ResultEntry, { foreignKey: 'sheetId', as: 'entries', onDelete: 'CASCADE' });

ResultEntry.belongsTo(ResultSheet, { foreignKey: 'sheetId', as: 'sheet' });
ResultEntry.belongsTo(CourseRegistration, { foreignKey: 'registrationId', as: 'registration', ...RESTRICT });
ResultEntry.belongsTo(User, { foreignKey: 'studentId', as: 'student', ...RESTRICT });

// ── Audit ───────────────────────────────────────────────────────────────────
AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor', onDelete: 'SET NULL' });

export {
  sequelize,
  AcademicSession,
  AuditLog,
  Course,
  CourseAllocation,
  CourseProgram,
  CourseRegistration,
  Department,
  Faculty,
  GradeScale,
  LecturerProfile,
  Program,
  ResultEntry,
  ResultSheet,
  Semester,
  Session,
  StudentProfile,
  User,
};
