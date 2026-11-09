import { DataTypes, type QueryInterface } from 'sequelize';
import { RESULT_STATUSES, ROLES, SEMESTER_TYPES, USER_STATUSES } from '../../domain/enums.js';

const id = { type: DataTypes.UUID, primaryKey: true, allowNull: false };
const timestamps = {
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
};
const fk = (table: string, onDelete: 'RESTRICT' | 'CASCADE' | 'SET NULL' = 'RESTRICT', allowNull = false) => ({
  type: DataTypes.UUID,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete,
});

export async function up({ context: qi }: { context: QueryInterface }): Promise<void> {
  await qi.sequelize.transaction(async (transaction) => {
    const opts = { transaction };
    const raw = (query: string) => qi.sequelize.query(query, opts);

    // ── Organisation ──────────────────────────────────────────────────────
    await qi.createTable(
      'faculties',
      {
        id,
        name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
        code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
        ...timestamps,
      },
      opts,
    );

    await qi.createTable(
      'departments',
      {
        id,
        faculty_id: fk('faculties'),
        name: { type: DataTypes.STRING(150), allowNull: false },
        code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
        ...timestamps,
      },
      opts,
    );
    await qi.addIndex('departments', ['faculty_id', 'name'], { unique: true, ...opts });

    await qi.createTable(
      'programs',
      {
        id,
        department_id: fk('departments'),
        name: { type: DataTypes.STRING(150), allowNull: false },
        code: { type: DataTypes.STRING(15), allowNull: false, unique: true },
        degree: { type: DataTypes.STRING(20), allowNull: false },
        duration_years: { type: DataTypes.SMALLINT, allowNull: false },
        ...timestamps,
      },
      opts,
    );
    await raw(`ALTER TABLE programs ADD CONSTRAINT programs_duration_chk CHECK (duration_years BETWEEN 1 AND 7)`);

    // ── People ────────────────────────────────────────────────────────────
    await qi.createTable(
      'users',
      {
        id,
        email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        password_hash: { type: DataTypes.STRING(255), allowNull: false },
        first_name: { type: DataTypes.STRING(100), allowNull: false },
        last_name: { type: DataTypes.STRING(100), allowNull: false },
        phone: { type: DataTypes.STRING(30), allowNull: true },
        role: { type: DataTypes.ENUM(...ROLES), allowNull: false },
        status: { type: DataTypes.ENUM(...USER_STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
        department_id: fk('departments', 'RESTRICT', true),
        last_login_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps,
      },
      opts,
    );
    await qi.addIndex('users', ['role'], opts);
    await qi.addIndex('users', ['department_id', 'role'], opts);
    // Every role except Super Admin must belong to a department.
    await raw(
      `ALTER TABLE users ADD CONSTRAINT users_department_required_chk
       CHECK (role = 'SUPER_ADMIN' OR department_id IS NOT NULL)`,
    );

    await qi.createTable(
      'sessions',
      {
        id,
        user_id: fk('users', 'CASCADE'),
        token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        last_seen_at: { type: DataTypes.DATE, allowNull: false },
        ip_address: { type: DataTypes.STRING(64), allowNull: true },
        user_agent: { type: DataTypes.STRING(512), allowNull: true },
        revoked_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps,
      },
      opts,
    );
    await qi.addIndex('sessions', ['user_id'], opts);

    await qi.createTable(
      'student_profiles',
      {
        id,
        user_id: { ...fk('users', 'CASCADE'), unique: true },
        program_id: fk('programs'),
        matric_number: { type: DataTypes.STRING(30), allowNull: false, unique: true },
        level: { type: DataTypes.SMALLINT, allowNull: false },
        entry_year: { type: DataTypes.SMALLINT, allowNull: false },
        gender: { type: DataTypes.STRING(10), allowNull: true },
        date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
        address: { type: DataTypes.STRING(255), allowNull: true },
        ...timestamps,
      },
      opts,
    );
    await raw(
      `ALTER TABLE student_profiles ADD CONSTRAINT student_level_chk CHECK (level BETWEEN 100 AND 700 AND level % 100 = 0)`,
    );
    await qi.addIndex('student_profiles', ['program_id', 'level'], opts);

    await qi.createTable(
      'lecturer_profiles',
      {
        id,
        user_id: { ...fk('users', 'CASCADE'), unique: true },
        staff_number: { type: DataTypes.STRING(30), allowNull: false, unique: true },
        title: { type: DataTypes.STRING(20), allowNull: true },
        rank: { type: DataTypes.STRING(60), allowNull: true },
        ...timestamps,
      },
      opts,
    );

    // ── Academic calendar ─────────────────────────────────────────────────
    await qi.createTable(
      'academic_sessions',
      {
        id,
        name: { type: DataTypes.STRING(20), allowNull: false, unique: true },
        start_date: { type: DataTypes.DATEONLY, allowNull: false },
        end_date: { type: DataTypes.DATEONLY, allowNull: false },
        is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps,
      },
      opts,
    );
    // At most one current session — enforced by the database, not just the app.
    await raw(`CREATE UNIQUE INDEX academic_sessions_single_current ON academic_sessions (is_current) WHERE is_current`);
    await raw(`ALTER TABLE academic_sessions ADD CONSTRAINT academic_sessions_dates_chk CHECK (end_date > start_date)`);

    await qi.createTable(
      'semesters',
      {
        id,
        session_id: fk('academic_sessions'),
        type: { type: DataTypes.ENUM(...SEMESTER_TYPES), allowNull: false },
        start_date: { type: DataTypes.DATEONLY, allowNull: false },
        end_date: { type: DataTypes.DATEONLY, allowNull: false },
        is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        registration_open: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps,
      },
      opts,
    );
    await qi.addIndex('semesters', ['session_id', 'type'], { unique: true, ...opts });
    await raw(`CREATE UNIQUE INDEX semesters_single_current ON semesters (is_current) WHERE is_current`);
    await raw(`ALTER TABLE semesters ADD CONSTRAINT semesters_dates_chk CHECK (end_date > start_date)`);

    // ── Courses ───────────────────────────────────────────────────────────
    await qi.createTable(
      'courses',
      {
        id,
        department_id: fk('departments'),
        code: { type: DataTypes.STRING(15), allowNull: false, unique: true },
        title: { type: DataTypes.STRING(200), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        units: { type: DataTypes.SMALLINT, allowNull: false },
        level: { type: DataTypes.SMALLINT, allowNull: false },
        semester_type: { type: DataTypes.ENUM(...SEMESTER_TYPES), allowNull: false },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps,
      },
      opts,
    );
    await raw(`ALTER TABLE courses ADD CONSTRAINT courses_units_chk CHECK (units BETWEEN 1 AND 6)`);
    await raw(
      `ALTER TABLE courses ADD CONSTRAINT courses_level_chk CHECK (level BETWEEN 100 AND 700 AND level % 100 = 0)`,
    );
    await qi.addIndex('courses', ['department_id'], opts);
    await qi.addIndex('courses', ['level', 'semester_type'], opts);

    await qi.createTable(
      'course_programs',
      {
        course_id: { ...fk('courses', 'CASCADE'), primaryKey: true },
        program_id: { ...fk('programs', 'CASCADE'), primaryKey: true },
      },
      opts,
    );
    await qi.addIndex('course_programs', ['program_id'], opts);

    await qi.createTable(
      'course_allocations',
      {
        id,
        course_id: fk('courses'),
        semester_id: fk('semesters'),
        lecturer_id: fk('users'),
        allocated_by_id: fk('users', 'SET NULL', true),
        ...timestamps,
      },
      opts,
    );
    await qi.addIndex('course_allocations', ['course_id', 'semester_id'], { unique: true, ...opts });
    await qi.addIndex('course_allocations', ['lecturer_id', 'semester_id'], opts);

    // ── Registration ──────────────────────────────────────────────────────
    await qi.createTable(
      'course_registrations',
      {
        id,
        student_id: fk('users'),
        course_id: fk('courses'),
        semester_id: fk('semesters'),
        ...timestamps,
      },
      opts,
    );
    // Business rule #2: no duplicate registration in the same semester.
    await qi.addIndex('course_registrations', ['student_id', 'course_id', 'semester_id'], {
      unique: true,
      name: 'course_registrations_no_duplicates',
      ...opts,
    });
    await qi.addIndex('course_registrations', ['course_id', 'semester_id'], opts);

    // ── Results ───────────────────────────────────────────────────────────
    await qi.createTable(
      'result_sheets',
      {
        id,
        course_id: fk('courses'),
        semester_id: fk('semesters'),
        lecturer_id: fk('users'),
        status: { type: DataTypes.ENUM(...RESULT_STATUSES), allowNull: false, defaultValue: 'DRAFT' },
        submitted_at: { type: DataTypes.DATE, allowNull: true },
        reviewed_at: { type: DataTypes.DATE, allowNull: true },
        reviewed_by_id: fk('users', 'SET NULL', true),
        review_comment: { type: DataTypes.TEXT, allowNull: true },
        ...timestamps,
      },
      opts,
    );
    await qi.addIndex('result_sheets', ['course_id', 'semester_id'], { unique: true, ...opts });
    await qi.addIndex('result_sheets', ['status'], opts);
    // Defence in depth: a reviewer can never be the submitting lecturer.
    await raw(
      `ALTER TABLE result_sheets ADD CONSTRAINT result_sheets_no_self_review_chk
       CHECK (reviewed_by_id IS NULL OR reviewed_by_id <> lecturer_id)`,
    );

    await qi.createTable(
      'result_entries',
      {
        id,
        sheet_id: fk('result_sheets', 'CASCADE'),
        registration_id: { ...fk('course_registrations'), unique: true },
        student_id: fk('users'),
        ca_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
        exam_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
        total_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
        grade: { type: DataTypes.STRING(2), allowNull: true },
        grade_point: { type: DataTypes.SMALLINT, allowNull: true },
        ...timestamps,
      },
      opts,
    );
    await raw(
      `ALTER TABLE result_entries ADD CONSTRAINT result_entries_scores_chk CHECK (
         (ca_score IS NULL OR ca_score BETWEEN 0 AND 30) AND
         (exam_score IS NULL OR exam_score BETWEEN 0 AND 70) AND
         (total_score IS NULL OR total_score BETWEEN 0 AND 100))`,
    );
    await qi.addIndex('result_entries', ['student_id'], opts);
    await qi.addIndex('result_entries', ['sheet_id'], opts);

    await qi.createTable(
      'grade_scales',
      {
        id,
        grade: { type: DataTypes.STRING(2), allowNull: false, unique: true },
        min_score: { type: DataTypes.SMALLINT, allowNull: false },
        max_score: { type: DataTypes.SMALLINT, allowNull: false },
        grade_point: { type: DataTypes.SMALLINT, allowNull: false },
        remark: { type: DataTypes.STRING(30), allowNull: false },
        ...timestamps,
      },
      opts,
    );
    await raw(
      `ALTER TABLE grade_scales ADD CONSTRAINT grade_scales_range_chk
       CHECK (min_score >= 0 AND max_score <= 100 AND min_score <= max_score AND grade_point >= 0)`,
    );

    // ── Audit ─────────────────────────────────────────────────────────────
    await qi.createTable(
      'audit_logs',
      {
        id,
        actor_id: fk('users', 'SET NULL', true),
        actor_role: { type: DataTypes.STRING(20), allowNull: true },
        action: { type: DataTypes.STRING(60), allowNull: false },
        entity_type: { type: DataTypes.STRING(40), allowNull: false },
        entity_id: { type: DataTypes.UUID, allowNull: true },
        department_id: { type: DataTypes.UUID, allowNull: true },
        metadata: { type: DataTypes.JSONB, allowNull: true },
        ip_address: { type: DataTypes.STRING(64), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      opts,
    );
    await qi.addIndex('audit_logs', ['entity_type', 'entity_id'], opts);
    await qi.addIndex('audit_logs', ['actor_id'], opts);
    await qi.addIndex('audit_logs', ['created_at'], opts);
    await qi.addIndex('audit_logs', ['department_id'], opts);
  });

}

export async function down({ context: qi }: { context: QueryInterface }): Promise<void> {
  const tables = [
    'audit_logs',
    'grade_scales',
    'result_entries',
    'result_sheets',
    'course_registrations',
    'course_allocations',
    'course_programs',
    'courses',
    'semesters',
    'academic_sessions',
    'lecturer_profiles',
    'student_profiles',
    'sessions',
    'users',
    'programs',
    'departments',
    'faculties',
  ];
  for (const table of tables) await qi.dropTable(table, { cascade: true });

  const enums = [
    'enum_users_role',
    'enum_users_status',
    'enum_semesters_type',
    'enum_courses_semester_type',
    'enum_result_sheets_status',
  ];
  for (const name of enums) await qi.sequelize.query(`DROP TYPE IF EXISTS "${name}"`);
}
