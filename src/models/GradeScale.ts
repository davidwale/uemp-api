import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/sequelize.js';

/** One band of the grading scale, e.g. { grade: 'A', minScore: 70, maxScore: 100, gradePoint: 5 }. */
export class GradeScale extends Model<InferAttributes<GradeScale>, InferCreationAttributes<GradeScale>> {
  declare id: CreationOptional<string>;
  declare grade: string;
  declare minScore: number;
  declare maxScore: number;
  declare gradePoint: number;
  declare remark: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GradeScale.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    grade: { type: DataTypes.STRING(2), allowNull: false, unique: true },
    minScore: { type: DataTypes.SMALLINT, allowNull: false },
    maxScore: { type: DataTypes.SMALLINT, allowNull: false },
    gradePoint: { type: DataTypes.SMALLINT, allowNull: false },
    remark: { type: DataTypes.STRING(30), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'grade_scales', modelName: 'GradeScale' },
);
