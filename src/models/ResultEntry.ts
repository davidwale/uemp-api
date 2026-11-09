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
import type { ResultSheet } from './ResultSheet.js';
import type { CourseRegistration } from './CourseRegistration.js';
import type { User } from './User.js';

/** Postgres returns NUMERIC as string to avoid precision loss; scores fit safely in a JS number. */
const numeric = (field: string) => ({
  type: DataTypes.DECIMAL(5, 2),
  allowNull: true,
  get(this: Model) {
    const raw = this.getDataValue(field) as string | null;
    return raw === null || raw === undefined ? null : Number(raw);
  },
});

export class ResultEntry extends Model<InferAttributes<ResultEntry>, InferCreationAttributes<ResultEntry>> {
  declare id: CreationOptional<string>;
  declare sheetId: ForeignKey<ResultSheet['id']>;
  declare registrationId: ForeignKey<CourseRegistration['id']>;
  declare studentId: ForeignKey<User['id']>;
  declare caScore: number | null;
  declare examScore: number | null;
  declare totalScore: number | null;
  declare grade: string | null;
  declare gradePoint: number | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sheet?: NonAttribute<ResultSheet>;
  declare registration?: NonAttribute<CourseRegistration>;
  declare student?: NonAttribute<User>;
}

ResultEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sheetId: { type: DataTypes.UUID, allowNull: false },
    registrationId: { type: DataTypes.UUID, allowNull: false, unique: true },
    studentId: { type: DataTypes.UUID, allowNull: false },
    caScore: numeric('caScore'),
    examScore: numeric('examScore'),
    totalScore: numeric('totalScore'),
    grade: { type: DataTypes.STRING(2), allowNull: true },
    gradePoint: { type: DataTypes.SMALLINT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'result_entries', modelName: 'ResultEntry' },
);
