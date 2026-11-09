import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import type { Semester } from './Semester.js';

export class AcademicSession extends Model<
  InferAttributes<AcademicSession>,
  InferCreationAttributes<AcademicSession>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare startDate: string;
  declare endDate: string;
  declare isCurrent: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare semesters?: NonAttribute<Semester[]>;
}

AcademicSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'academic_sessions', modelName: 'AcademicSession' },
);
