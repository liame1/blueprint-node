# blueprint-node

A Node.js web application ready for deployment on Render.com.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

## Deployment to Render.com

1. Push your code to a GitHub repository
2. Go to [Render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Render will automatically detect the `render.yaml` file and configure the service
5. Click "Create Web Service" to deploy

The application will be automatically deployed whenever you push changes to your repository.
