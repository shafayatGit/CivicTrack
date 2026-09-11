import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to CivicTrack API' });
});

app.use('/api/auth', authRoutes);

app.use(errorHandler);

export default app;