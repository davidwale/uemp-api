import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import type { Course } from './Course.js';
import type { Semester } from './Semester.js';
import type { User } from './User.js';

/** Assigns exactly one responsible lecturer to a course for a given semester. */
export class CourseAllocation extends Model<
  InferAttributes<CourseAllocation>,
  InferCreationAttributes<CourseAllocation>
> {
  declare id: CreationOptional<string>;
  declare courseId: ForeignKey<Course['id']>;
  declare semesterId: ForeignKey<Semester['id']>;
  declare lecturerId: ForeignKey<User['id']>;
  declare allocatedById: ForeignKey<User['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare course?: NonAttribute<Course>;
  declare semester?: NonAttribute<Semester>;
  declare lecturer?: NonAttribute<User>;
}

CourseAllocation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    courseId: { type: DataTypes.UUID, allowNull: false },
    semesterId: { type: DataTypes.UUID, allowNull: false },
    lecturerId: { type: DataTypes.UUID, allowNull: false },
    allocatedById: { type: DataTypes.UUID, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'course_allocations', modelName: 'CourseAllocation' },
);
