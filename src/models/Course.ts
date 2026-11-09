import {
  DataTypes,
  type BelongsToManySetAssociationsMixin,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { SEMESTER_TYPES, type SemesterType } from '../domain/enums.js';
import type { Department } from './Department.js';
import type { Program } from './Program.js';

/**
 * A course is owned by one department, but may be offered to programmes in
 * other departments (e.g. MTH101 owned by Mathematics, taken by CS students).
 * Availability to students is determined by the `course_programs` join table.
 */
export class Course extends Model<InferAttributes<Course>, InferCreationAttributes<Course>> {
  declare id: CreationOptional<string>;
  declare departmentId: ForeignKey<Department['id']>;
  declare code: string;
  declare title: string;
  declare description: string | null;
  declare units: number;
  declare level: number;
  declare semesterType: SemesterType;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare department?: NonAttribute<Department>;
  declare programs?: NonAttribute<Program[]>;

  declare setPrograms: BelongsToManySetAssociationsMixin<Program, string>;
}

Course.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    departmentId: { type: DataTypes.UUID, allowNull: false },
    code: {
      type: DataTypes.STRING(15),
      allowNull: false,
      unique: true,
      set(value: string) {
        this.setDataValue('code', value.replace(/\s+/g, '').toUpperCase());
      },
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    units: { type: DataTypes.SMALLINT, allowNull: false },
    level: { type: DataTypes.SMALLINT, allowNull: false },
    semesterType: { type: DataTypes.ENUM(...SEMESTER_TYPES), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'courses', modelName: 'Course' },
);
