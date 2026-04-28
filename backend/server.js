'use strict';

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
let db;

async function connectToMongoDB() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB');
    await db.collection('sessions').createIndex({ playerId: 1, score: -1 });
    await db.collection('sessions').createIndex({ score: -1 });
    await db.collection('players').createIndex({ username: 1 }, { unique: true });
    console.log('Indexes created');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// GET /api/health — liveness check for Render / Railway
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// POST /api/players — register or retrieve a player by username
// ---------------------------------------------------------------------------
app.post('/api/players', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: 'username is required' });
  }
  const name = username.trim().slice(0, 32);
  try {
    // Upsert: create if not exists, return existing if already registered
    const result = await db.collection('players').findOneAndUpdate(
      { username: name },
      { $setOnInsert: { username: name, createdAt: new Date().toISOString() } },
      { upsert: true, returnDocument: 'after' }
    );
    const player = result.value || await db.collection('players').findOne({ username: name });
    return res.status(200).json({ playerId: player._id.toString(), username: player.username });
  } catch (err) {
    console.error('Error registering player:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/highscore?playerId=...
// ---------------------------------------------------------------------------
app.get('/api/highscore', async (req, res) => {
  const { playerId } = req.query;
  if (!playerId) {
    return res.status(400).json({ error: 'playerId query parameter is required' });
  }
  try {
    const results = await db
      .collection('sessions')
      .find({ playerId })
      .sort({ score: -1 })
      .limit(1)
      .toArray();
    const score = results.length > 0 ? results[0].score : 0;
    return res.json({ score });
  } catch (err) {
    console.error('Error fetching high score:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/leaderboard?limit=10 — top scores across all players
// ---------------------------------------------------------------------------
app.get('/api/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  try {
    // Best score per player, then top N
    const rows = await db.collection('sessions').aggregate([
      { $sort: { score: -1 } },
      { $group: { _id: '$playerId', score: { $max: '$score' }, username: { $first: '$username' }, heightPx: { $first: '$heightPx' } } },
      { $sort: { score: -1 } },
      { $limit: limit },
      { $project: { _id: 0, playerId: '$_id', username: 1, score: 1, heightPx: 1 } }
    ]).toArray();
    return res.json({ leaderboard: rows });
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sessions
// ---------------------------------------------------------------------------
app.post('/api/sessions', async (req, res) => {
  const { sessionId, playerId, username, score, heightPx, gemsCollected, startedAt, endedAt } = req.body;
  const requiredFields = ['sessionId', 'playerId', 'score', 'heightPx', 'gemsCollected', 'startedAt', 'endedAt'];
  for (const field of requiredFields) {
    if (req.body[field] === undefined || req.body[field] === null) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }
  const record = { sessionId, playerId, username: username || 'Anonymous', score, heightPx, gemsCollected, startedAt, endedAt };
  try {
    const result = await db.collection('sessions').insertOne(record);
    return res.status(201).json({ ok: true, id: result.insertedId });
  } catch (err) {
    console.error('Error saving session:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

connectToMongoDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Ball Bounce Game backend listening on port ${PORT}`);
  });
});
