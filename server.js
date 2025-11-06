const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Store active users and their rooms
const activeUsers = new Map(); // socketId -> { username, userId, roomId }

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
