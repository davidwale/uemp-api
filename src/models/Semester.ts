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
import { SEMESTER_TYPES, type SemesterType } from '../domain/enums.js';
import type { AcademicSession } from './AcademicSession.js';

export class Semester extends Model<InferAttributes<Semester>, InferCreationAttributes<Semester>> {
  declare id: CreationOptional<string>;
  declare sessionId: ForeignKey<AcademicSession['id']>;
  declare type: SemesterType;
  declare startDate: string;
  declare endDate: string;
  declare isCurrent: CreationOptional<boolean>;
  declare registrationOpen: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare session?: NonAttribute<AcademicSession>;
}

Semester.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sessionId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...SEMESTER_TYPES), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    registrationOpen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'semesters', modelName: 'Semester' },
);
