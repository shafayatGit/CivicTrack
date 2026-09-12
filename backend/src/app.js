import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './modules/auth/auth.routes.js';
import categoryRoutes from './modules/category/category.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to CivicTrack API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);

app.use(errorHandler);

export default app;