import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes.js";
import categoryRoutes from "./modules/category/category.routes.js";
import departmentRoutes from "./modules/department/department.routes.js";
import wardRoutes from "./modules/ward/ward.routes.js";
import staffRoutes from "./modules/staff/staff.routes.js";
import issueRoutes from "./modules/issue/issue.routes.js";
import issuePhotoRoutes from "./modules/issuePhoto/issuePhoto.routes.js";
import falseReportRoutes from "./modules/falseReport/falseReport.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import messageRoutes from "./modules/message/message.routes.js";
import voteRoutes from "./modules/vote/vote.routes.js";
import {
  publicRouter as commentPublicRoutes,
  moderationRouter as commentModerationRoutes,
} from "./modules/comment/comment.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    // Reflected rather than a fixed list so the Vercel preview URLs this repo will
    // be deployed behind keep working without a code change per environment.
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({ message: "Welcome to CivicTrack API" });
});
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/wards", wardRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/issues", issueRoutes);
// Public participation: mounted under /api/issues/:id as nested resources rather than as
// their own top-level routers, so the URL says what the thing is a vote/comment OF.
// No route inside issue.routes.js collides — '/:id' cannot match a two-segment path, and
// nothing else declares '/:id/vote' or '/:id/comments'.
// Mounted AFTER issueRoutes so the existing '/:id' handler is reached first for a plain
// issue lookup; these only see paths it did not match.
app.use("/api/issues/:id/vote", voteRoutes);
app.use("/api/issues/:id/comments", commentPublicRoutes);
app.use("/api/issue-photos", issuePhotoRoutes);
app.use("/api/false-reports", falseReportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
// Comment moderation lives off /api/issues on purpose, so the admin surface is never
// reachable by guessing a sub-path of the public thread.
app.use("/api/moderation/comments", commentModerationRoutes);

app.use(errorHandler);

export default app;
