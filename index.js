import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import userRoutes from './routes/users.js';
import ticketRoutes from './routes/tickets.js';
import { inngest } from "./inngest/client.js";
import { onSignup } from "./inngest/functions/on-signup.js";
import { onTicketCreated } from "./inngest/functions/on-ticket-create.js";
import { serve } from "inngest/express";

// 1. Initialize environment variables immediately
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Routes
app.use("/api/auth", userRoutes);
app.use("/api/tickets", ticketRoutes);

// 4. Inngest Middleware
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [onSignup, onTicketCreated],
  })
);

// 5. Database Connection
// Check if URI exists before trying to connect to prevent crashes
if (!process.env.MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is not defined in .env file.");
    process.exit(1); 
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB connection error:", err.message));

// 6. Basic Health Check
app.get('/', (req, res) => {
  res.send('SmartTicket-AI Backend is Running');
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});