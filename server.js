/* =====================================================
   TRUSTLENS – HYBRID BACKEND ENTRY (v5)
   Clean Architecture: Routes + Services + Utils
   ===================================================== */

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import verifyRoute from "./routes/verify.js";
import explainRoute from "./routes/explain.js";
import logger from "./utils/logger.js";

dotenv.config();
console.log("ENABLE_GEMINI:", process.env.ENABLE_GEMINI);
/* =====================================================
   CONFIG
   ===================================================== */

const PORT = parseInt(process.env.PORT) || 3000;
const API_VERSION = process.env.API_VERSION || "v1";

/* =====================================================
   APP INIT
   ===================================================== */

const app = express();

/* ---------------- SECURITY ---------------- */

app.use(helmet());
app.use(compression());

app.use(cors({
  origin: true
}));

app.use(express.json({
  limit: "1mb"
}));

/* ---------------- RATE LIMIT ---------------- */

app.use(
  `/api/${API_VERSION}/verify`,
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 30
  })
);

/* =====================================================
   ROUTES
   ===================================================== */

app.use(`/api/${API_VERSION}/verify`, verifyRoute);
app.use(`/api/${API_VERSION}/explain`, explainRoute);

/* ---------------- HEALTH ROUTE ---------------- */

app.get(`/api/${API_VERSION}/health`, (req, res) => {
  res.json({
    status: "healthy",
    hybridMode: true,
    aiEnabled: process.env.ENABLE_GEMINI === "true",
    explanationEnabled: process.env.ENABLE_EXPLANATION === "true",
    timestamp: Date.now()
  });
});

/* =====================================================
   GLOBAL ERROR HANDLER
   ===================================================== */

app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`);

  res.status(500).json({
    error: "Internal Server Error"
  });
});

/* =====================================================
   START SERVER
   ===================================================== */

app.listen(PORT, () => {
  logger.info(`🚀 TrustLens Hybrid Backend running on port ${PORT}`);
});
