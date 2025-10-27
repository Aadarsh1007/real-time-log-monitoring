const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// DB connection
mongoose
  .connect("mongodb://127.0.0.1:27017/logsdb", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// mongodb schema
  const logSchema = new mongoose.Schema({
  service: String,
  type: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const Log = mongoose.model("Log", logSchema);

// handling for rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min window
  max: 100, // 100 request per min per IP
  message: "Too many requests, please try again later.",
});
app.use(limiter);

const subscriptions = new Map();

wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.send("Connected to Real-Time Log Stream");

  ws.safeSend = (data) => {
    if (ws.bufferedAmount === 0) {
      ws.send(data);
    } else {
      console.log("Backpressure detected, delaying sending");
      setTimeout(() => ws.safeSend(data), 100);
    }
  };

  ws.on("drain", () => {
    console.log("WebSocket buffer cleared");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.subscribe) {
        subscriptions.set(ws, data.subscribe);
        ws.safeSend(`Subscribed to ${data.subscribe}`);
      }
    } catch {
      console.log("Invalid message from client");
    }
  });

  ws.on("close", () => {
    subscriptions.delete(ws);
    console.log("Client disconnected");
  });
});

// api to insert logs
app.post("/api/logs", async (req, res) => {
  const { service, type, message } = req.body;

  if (!service || !type || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const newLog = await Log.create({ service, type, message });

    // Broadcast to subscribers
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        const subscribedService = subscriptions.get(client);
        if (subscribedService === service) {
          client.safeSend(JSON.stringify(newLog));
        }
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving log:", err);
    res.status(500).json({ error: "Failed to save log" });
  }
});

// api to get logs by filter
app.get("/api/logs", async (req, res) => {
  const { type, service, from, to } = req.query;

  const filter = {};

  if (type) filter.type = type;
  if (service) filter.service = service;

  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);

    if (from && to && new Date(from) > new Date(to)) {
      return res.status(400).json({ error: "From date cannot be after To date" });
    }
  }

  try {
    const logs = await Log.find(filter).sort({ timestamp: -1 }).limit(200);
    res.json(logs);
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
