const db = require('./db');

async function initialize() {
  try {
    await db.initDatabase();
    console.log('Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

initialize();

