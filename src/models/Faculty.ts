import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import type { Department } from './Department.js';

export class Faculty extends Model<InferAttributes<Faculty>, InferCreationAttributes<Faculty>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare code: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare departments?: NonAttribute<Department[]>;
}

Faculty.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'faculties', modelName: 'Faculty' },
);
