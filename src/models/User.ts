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
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../domain/enums.js';
import type { Department } from './Department.js';
import type { StudentProfile } from './StudentProfile.js';
import type { LecturerProfile } from './LecturerProfile.js';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string;
  declare firstName: string;
  declare lastName: string;
  declare phone: string | null;
  declare role: Role;
  declare status: CreationOptional<UserStatus>;
  declare departmentId: ForeignKey<Department['id']> | null;
  declare lastLoginAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare department?: NonAttribute<Department>;
  declare studentProfile?: NonAttribute<StudentProfile>;
  declare lecturerProfile?: NonAttribute<LecturerProfile>;

  get fullName(): NonAttribute<string> {
    return `${this.firstName} ${this.lastName}`;
  }

  /** Never leak the password hash, regardless of how the model is serialised. */
  override toJSON() {
    const { passwordHash: _omit, ...rest } = super.toJSON() as InferAttributes<User>;
    return rest;
  }
}

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      set(value: string) {
        this.setDataValue('email', value.trim().toLowerCase());
      },
    },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    role: { type: DataTypes.ENUM(...ROLES), allowNull: false },
    status: { type: DataTypes.ENUM(...USER_STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    departmentId: { type: DataTypes.UUID, allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'users', modelName: 'User' },
);
