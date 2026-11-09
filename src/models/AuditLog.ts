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

/**
 * Append-only record of security-relevant and academic-record actions.
 * The application never updates or deletes rows in this table.
 */
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<string>;
  declare actorId: ForeignKey<User['id']> | null;
  declare actorRole: string | null;
  declare action: string;
  declare entityType: string;
  declare entityId: string | null;
  declare departmentId: string | null;
  declare metadata: Record<string, unknown> | null;
  declare ipAddress: string | null;
  declare createdAt: CreationOptional<Date>;

  declare actor?: NonAttribute<User>;
}

AuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actorId: { type: DataTypes.UUID, allowNull: true },
    actorRole: { type: DataTypes.STRING(20), allowNull: true },
    action: { type: DataTypes.STRING(60), allowNull: false },
    entityType: { type: DataTypes.STRING(40), allowNull: false },
    entityId: { type: DataTypes.UUID, allowNull: true },
    departmentId: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'audit_logs', modelName: 'AuditLog', updatedAt: false },
);
