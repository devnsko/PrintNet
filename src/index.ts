import express from 'express';
import cors from 'cors';
import printerRouter from './routes/printers';
import jobRouter from './routes/job';
import queueRouter from './routes/queue';
import modelRouter from './routes/model'
import authRouter from './routes/auth';
import userRouter from './routes/user';
import uploadRouter from './routes/upload';
import initializeDatabase from './db/init';
import { mockAuth, requireAuth } from './middlewares/authMiddleware';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;


app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // your Next.js frontend
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(cookieParser());


app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express + TypeScript', api: '/api/printers' });
});

app.use('/api/auth', authRouter);
app.use('/api', mockAuth, userRouter);
app.use('/api', mockAuth, printerRouter);
app.use('/api', mockAuth, modelRouter);
app.use('/api', mockAuth, jobRouter);
app.use('/api', mockAuth, queueRouter);
app.use('/api', mockAuth, uploadRouter);

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
