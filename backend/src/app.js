import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './modules/auth/auth.routes.js';
import categoryRoutes from './modules/category/category.routes.js';
import departmentRoutes from './modules/department/department.routes.js';
import wardRoutes from './modules/ward/ward.routes.js';
import staffRoutes from './modules/staff/staff.routes.js';
import issueRoutes from './modules/issue/issue.routes.js';
import issuePhotoRoutes from './modules/issuePhoto/issuePhoto.routes.js';
import messageRoutes from './modules/message/message.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(
  cors({
    // Reflected rather than a fixed list so the Vercel preview URLs this repo will
    // be deployed behind keep working without a code change per environment.
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to CivicTrack API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/wards', wardRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/issue-photos', issuePhotoRoutes);
app.use('/api/messages', messageRoutes);

app.use(errorHandler);

export default app;
