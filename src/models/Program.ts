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
import type { Department } from './Department.js';

/**
 * An academic programme (e.g. B.Sc. Computer Science).
 * `durationYears` defines the academic levels available in the programme:
 * a 4-year programme spans 100L–400L.
 */
export class Program extends Model<InferAttributes<Program>, InferCreationAttributes<Program>> {
  declare id: CreationOptional<string>;
  declare departmentId: ForeignKey<Department['id']>;
  declare name: string;
  declare code: string;
  declare degree: string;
  declare durationYears: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare department?: NonAttribute<Department>;

  get levels(): NonAttribute<number[]> {
    return Array.from({ length: this.durationYears }, (_, i) => (i + 1) * 100);
  }
}

Program.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    departmentId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    code: { type: DataTypes.STRING(15), allowNull: false, unique: true },
    degree: { type: DataTypes.STRING(20), allowNull: false },
    durationYears: { type: DataTypes.SMALLINT, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'programs', modelName: 'Program' },
);
