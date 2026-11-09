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
import type { ResultEntry } from './ResultEntry.js';

export class CourseRegistration extends Model<
  InferAttributes<CourseRegistration>,
  InferCreationAttributes<CourseRegistration>
> {
  declare id: CreationOptional<string>;
  declare studentId: ForeignKey<User['id']>;
  declare courseId: ForeignKey<Course['id']>;
  declare semesterId: ForeignKey<Semester['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare student?: NonAttribute<User>;
  declare course?: NonAttribute<Course>;
  declare semester?: NonAttribute<Semester>;
  declare resultEntry?: NonAttribute<ResultEntry>;
}

CourseRegistration.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    studentId: { type: DataTypes.UUID, allowNull: false },
    courseId: { type: DataTypes.UUID, allowNull: false },
    semesterId: { type: DataTypes.UUID, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'course_registrations', modelName: 'CourseRegistration' },
);
