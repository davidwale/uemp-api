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
import type { User } from './User.js';
import type { Program } from './Program.js';

export class StudentProfile extends Model<
  InferAttributes<StudentProfile>,
  InferCreationAttributes<StudentProfile>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User['id']>;
  declare programId: ForeignKey<Program['id']>;
  declare matricNumber: string;
  declare level: number;
  declare entryYear: number;
  declare gender: string | null;
  declare dateOfBirth: string | null;
  declare address: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
  declare program?: NonAttribute<Program>;
}

StudentProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true },
    programId: { type: DataTypes.UUID, allowNull: false },
    matricNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    level: { type: DataTypes.SMALLINT, allowNull: false },
    entryYear: { type: DataTypes.SMALLINT, allowNull: false },
    gender: { type: DataTypes.STRING(10), allowNull: true },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    address: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'student_profiles', modelName: 'StudentProfile' },
);
