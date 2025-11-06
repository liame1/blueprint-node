const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create rooms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default room if it doesn't exist
    await pool.query(`
      INSERT INTO rooms (name) 
      VALUES ('general') 
      ON CONFLICT (name) DO NOTHING
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// User operations
async function createUser(username) {
  const result = await pool.query(
    'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO NOTHING RETURNING *',
    [username]
  );
  if (result.rows.length === 0) {
    // User already exists, fetch it
    const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return existing.rows[0];
  }
  return result.rows[0];
}

async function getUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
}

// Room operations
async function createRoom(roomName) {
  const result = await pool.query(
    'INSERT INTO rooms (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
    [roomName]
  );
  if (result.rows.length === 0) {
    // Room already exists, fetch it
    const existing = await pool.query('SELECT * FROM rooms WHERE name = $1', [roomName]);
    return existing.rows[0];
  }
  return result.rows[0];
}

async function getAllRooms() {
  const result = await pool.query('SELECT * FROM rooms ORDER BY created_at ASC');
  return result.rows;
}

async function getRoomByName(roomName) {
  const result = await pool.query('SELECT * FROM rooms WHERE name = $1', [roomName]);
  return result.rows[0];
}

// Message operations
async function saveMessage(userId, roomId, message) {
  const result = await pool.query(
    'INSERT INTO messages (user_id, room_id, message) VALUES ($1, $2, $3) RETURNING *',
    [userId, roomId, message]
  );
  return result.rows[0];
}

async function getMessagesByRoom(roomId, limit = 50) {
  const result = await pool.query(
    `SELECT m.*, u.username 
     FROM messages m 
     JOIN users u ON m.user_id = u.id 
     WHERE m.room_id = $1 
     ORDER BY m.created_at DESC 
     LIMIT $2`,
    [roomId, limit]
  );
  return result.rows.reverse(); // Reverse to show oldest first
}

module.exports = {
  pool,
  initDatabase,
  createUser,
  getUserByUsername,
  createRoom,
  getAllRooms,
  getRoomByName,
  saveMessage,
  getMessagesByRoom
};

