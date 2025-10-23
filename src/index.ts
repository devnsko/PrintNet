import express from 'express';
import printerRouter from './routes/printers';
import jobRouter from './routes/job';
import queueRouter from './routes/queue';
import initializeDatabase from './db/init';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express + TypeScript', api: '/api/printers' });
});

app.use('/api', printerRouter);
app.use('/api', jobRouter);
app.use('/api', queueRouter);

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
