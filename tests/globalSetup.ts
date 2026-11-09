/**
 * Runs once before the whole suite: (re)creates an isolated test database
 * and applies migrations from scratch, so tests also verify the migrations.
 */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const { createDatabase, dropSchema } = await import('../src/db/admin.js');
  const { migrator } = await import('../src/db/umzug.js');
  const { sequelize } = await import('../src/db/sequelize.js');

  await createDatabase();
  await dropSchema();
  await migrator.up();
  await sequelize.close();
}
