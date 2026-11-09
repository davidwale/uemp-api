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
import { RESULT_STATUSES, type ResultStatus } from '../domain/enums.js';
import type { Course } from './Course.js';
import type { Semester } from './Semester.js';
import type { User } from './User.js';
import type { ResultEntry } from './ResultEntry.js';

/** The unit of submission and approval: all results for one course in one semester. */
export class ResultSheet extends Model<InferAttributes<ResultSheet>, InferCreationAttributes<ResultSheet>> {
  declare id: CreationOptional<string>;
  declare courseId: ForeignKey<Course['id']>;
  declare semesterId: ForeignKey<Semester['id']>;
  declare lecturerId: ForeignKey<User['id']>;
  declare status: CreationOptional<ResultStatus>;
  declare submittedAt: Date | null;
  declare reviewedAt: Date | null;
  declare reviewedById: ForeignKey<User['id']> | null;
  declare reviewComment: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare course?: NonAttribute<Course>;
  declare semester?: NonAttribute<Semester>;
  declare lecturer?: NonAttribute<User>;
  declare reviewedBy?: NonAttribute<User>;
  declare entries?: NonAttribute<ResultEntry[]>;
}

ResultSheet.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    courseId: { type: DataTypes.UUID, allowNull: false },
    semesterId: { type: DataTypes.UUID, allowNull: false },
    lecturerId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.ENUM(...RESULT_STATUSES), allowNull: false, defaultValue: 'DRAFT' },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedById: { type: DataTypes.UUID, allowNull: true },
    reviewComment: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'result_sheets', modelName: 'ResultSheet' },
);
