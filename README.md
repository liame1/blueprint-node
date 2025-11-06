# blueprint-node

A multi-user real-time chat room application with database persistence, built with Node.js, Socket.io, and PostgreSQL.

## Features

- 🚀 Real-time messaging using WebSockets (Socket.io)
- 👥 Multi-user support with username-based authentication
- 🏠 Multiple chat rooms
- 💾 Message and room persistence in PostgreSQL database
- 🎨 Modern, responsive UI
- ☁️ Ready for deployment on Render.com

## Local Development

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or remote)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your database connection:
   - Create a `.env` file in the root directory
   - Add your database connection string:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/database_name
   ```

3. Initialize the database:
```bash
npm run init-db
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## Deployment to Render.com

### Step 1: Create PostgreSQL Database

1. Go to [Render.com Dashboard](https://dashboard.render.com)
2. Click "New +" and select "PostgreSQL"
3. Name it `blueprint-db` (or update the name in `render.yaml`)
4. Select the free plan
5. Click "Create Database"
6. Copy the **Internal Database URL** (you'll need this)

### Step 2: Deploy Web Service

1. Push your code to GitHub
2. In Render Dashboard, click "New +" and select "Web Service"
3. Connect your GitHub repository
4. Render will automatically detect the `render.yaml` file
5. If you named your database differently, update the `render.yaml` file
6. Click "Create Web Service"

### Step 3: Initialize Database

After deployment, you need to initialize the database tables:

1. Go to your Web Service in Render Dashboard
2. Click on "Shell" tab
3. Run: `npm run init-db`

Alternatively, you can use the Render Shell or connect directly to your database and run the initialization manually.

### Environment Variables

The `render.yaml` file automatically configures the `DATABASE_URL` environment variable to connect to your PostgreSQL database. If you need to set additional environment variables, you can do so in the Render Dashboard under your Web Service settings.

## Usage

1. **Join Chat**: Enter a username and click "Join Chat"
2. **Select Room**: Click on a room from the sidebar to join it
3. **Create Room**: Type a room name and click "Create Room"
4. **Send Messages**: Type your message and press Enter or click "Send"
5. **View History**: Previous messages are automatically loaded when you join a room

## Database Schema

The application uses three main tables:

- **users**: Stores user information (username, created_at)
- **rooms**: Stores chat rooms (name, created_at)
- **messages**: Stores messages with references to users and rooms (user_id, room_id, message, created_at)

## Technology Stack

- **Backend**: Node.js, Express.js
- **Real-time**: Socket.io
- **Database**: PostgreSQL
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## License

ISC
