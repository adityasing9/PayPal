// Express server for Member 1. Run: npm install && npm start  -> http://localhost:8000
import express from "express";
import cors from "cors";
import { createApi } from "./api.js";

const app = express();
const handleRequest = createApi();

app.use(cors());
app.use(express.json());
app.use((req, res) => {
  const { status, body } = handleRequest({ method: req.method, path: req.path, query: req.query, body: req.body });
  res.status(status).json(body);
});
// bad JSON body -> 400 instead of a stack trace
app.use((e, _req, res, _next) => res.status(400).json({ detail: "Invalid JSON body" }));

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`AI Commerce Agent on http://localhost:${PORT}  (POST /agent/chat)`));
