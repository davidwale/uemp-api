import { DataTypes, Model, type ForeignKey, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import type { Course } from './Course.js';
import type { Program } from './Program.js';

export class CourseProgram extends Model<
  InferAttributes<CourseProgram>,
  InferCreationAttributes<CourseProgram>
> {
  declare courseId: ForeignKey<Course['id']>;
  declare programId: ForeignKey<Program['id']>;
}

CourseProgram.init(
  {
    courseId: { type: DataTypes.UUID, primaryKey: true },
    programId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, tableName: 'course_programs', modelName: 'CourseProgram', timestamps: false },
);
