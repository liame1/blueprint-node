const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const compression = require('compression');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'tree');
const NODE_MODULES_DIR = path.join(__dirname, 'node_modules');
const GLTF_DIR = path.join(PUBLIC_DIR, 'gltf');

function generateColorFromId(id) {
  const hash = crypto.createHash('sha1').update(String(id)).digest('hex');
  const hue = parseInt(hash.slice(0, 2), 16) / 255; // 0-1
  const saturation = 0.6;
  const lightness = 0.5;

  function hslToHex(h, s, l) {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);

    const toHex = (x) => {
      const val = Math.round(x * 255).toString(16);
      return val.length === 1 ? `0${val}` : val;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  return hslToHex(hue, saturation, lightness);
}

// Middleware
app.use(compression());
app.use(express.json());
app.use('/gltf', express.static(GLTF_DIR, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res, servedPath) => {
    if (servedPath.endsWith('.glb')) {
      res.setHeader('Content-Type', 'model/gltf-binary');
    }
  }
}));
app.use(express.static(PUBLIC_DIR, { maxAge: '7d', immutable: true }));
app.use('/node_modules', express.static(NODE_MODULES_DIR, { maxAge: '1d' }));
app.use('/chat', express.static(__dirname));

// Store active users and their rooms
const activeUsers = new Map(); // socketId -> { username, userId, roomId }
const activePlayers = new Map(); // socketId -> { position, rotation, username, color }

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// API endpoint to get all rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await db.getAllRooms();
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// API endpoint to get messages for a room
app.get('/api/rooms/:roomName/messages', async (req, res) => {
  try {
    const room = await db.getRoomByName(req.params.roomName);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const messages = await db.getMessagesByRoom(room.id);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  activePlayers.set(socket.id, { position: null, rotation: null, username: null, color: null });

  const playersSnapshot = Array.from(activePlayers.entries())
    .filter(([, data]) => data.position)
    .map(([id, data]) => ({
      id,
      position: data.position,
      rotation: data.rotation,
      username: data.username,
      color: data.color
    }));

  socket.emit('existingPlayers', playersSnapshot);
  io.emit('activePlayerCount', activePlayers.size);

  socket.on('playerProfile', ({ username }) => {
    const trimmed = typeof username === 'string' ? username.trim().slice(0, 20) : '';
    if (!trimmed) {
      socket.emit('playerProfileAck', { error: 'Name is required' });
      return;
    }

    const current = activePlayers.get(socket.id) || {};
    const color = current.color || generateColorFromId(`${socket.id}${trimmed}`);
    const updated = {
      ...current,
      username: trimmed,
      color
    };
    activePlayers.set(socket.id, updated);

    const payload = { id: socket.id, username: trimmed, color };
    socket.emit('playerProfileAck', payload);
    socket.broadcast.emit('playerProfileUpdated', payload);
  });

  socket.on('playerUpdate', (payload) => {
    if (!payload || !payload.position || !payload.rotation) {
      return;
    }

    const sanitized = {
      position: {
        x: Number(payload.position.x) || 0,
        y: Number(payload.position.y) || 0,
        z: Number(payload.position.z) || 0
      },
      rotation: {
        x: Number(payload.rotation.x) || 0,
        y: Number(payload.rotation.y) || 0,
        z: Number(payload.rotation.z) || 0
      }
    };

    const existing = activePlayers.get(socket.id) || { username: null, color: null };
    const updated = {
      ...existing,
      position: sanitized.position,
      rotation: sanitized.rotation
    };
    activePlayers.set(socket.id, updated);

    socket.broadcast.emit('playerUpdated', {
      id: socket.id,
      position: sanitized.position,
      rotation: sanitized.rotation,
      username: updated.username,
      color: updated.color
    });
  });

  // Handle user joining
  socket.on('join', async ({ username, roomName }) => {
    try {
      // Create or get user
      let user = await db.getUserByUsername(username);
      if (!user) {
        user = await db.createUser(username);
      }

      // Create or get room
      let room = await db.getRoomByName(roomName);
      if (!room) {
        room = await db.createRoom(roomName);
      }

      // Leave previous room if any
      const previousRoom = activeUsers.get(socket.id)?.roomId;
      if (previousRoom) {
        socket.leave(`room-${previousRoom}`);
      }

      // Join new room
      socket.join(`room-${room.id}`);
      activeUsers.set(socket.id, {
        username: user.username,
        userId: user.id,
        roomId: room.id,
        roomName: room.name
      });

      // Load previous messages
      const messages = await db.getMessagesByRoom(room.id);
      socket.emit('messages', messages);

      // Notify others in the room
      socket.to(`room-${room.id}`).emit('userJoined', {
        username: user.username,
        message: `${user.username} joined the room`
      });

      // Send updated room list to all clients
      const rooms = await db.getAllRooms();
      io.emit('rooms', rooms);

      console.log(`${username} joined room: ${roomName}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Handle new message
  socket.on('message', async ({ message }) => {
    try {
      const userData = activeUsers.get(socket.id);
      if (!userData) {
        socket.emit('error', { message: 'You must join a room first' });
        return;
      }

      // Save message to database
      const savedMessage = await db.saveMessage(
        userData.userId,
        userData.roomId,
        message
      );

      // Get username for the message
      const user = await db.getUserByUsername(userData.username);
      const messageData = {
        id: savedMessage.id,
        username: user.username,
        message: savedMessage.message,
        created_at: savedMessage.created_at
      };

      // Broadcast to all users in the room
      io.to(`room-${userData.roomId}`).emit('newMessage', messageData);

      console.log(`Message from ${userData.username} in ${userData.roomName}: ${message}`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle user leaving
  socket.on('disconnect', () => {
    const hadPlayer = activePlayers.delete(socket.id);
    if (hadPlayer) {
      socket.broadcast.emit('playerDisconnected', { id: socket.id });
    }
    io.emit('activePlayerCount', activePlayers.size);

    const userData = activeUsers.get(socket.id);
    if (userData) {
      socket.to(`room-${userData.roomId}`).emit('userLeft', {
        username: userData.username,
        message: `${userData.username} left the room`
      });
      activeUsers.delete(socket.id);
      console.log(`${userData.username} disconnected`);
    }
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.initDatabase();
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
