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

export class LecturerProfile extends Model<
  InferAttributes<LecturerProfile>,
  InferCreationAttributes<LecturerProfile>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User['id']>;
  declare staffNumber: string;
  declare title: string | null;
  declare rank: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

LecturerProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true },
    staffNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(20), allowNull: true },
    rank: { type: DataTypes.STRING(60), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'lecturer_profiles', modelName: 'LecturerProfile' },
);
