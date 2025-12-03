// src/index.js
require('dotenv').config(); // Load biến môi trường từ .env

const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware để parse JSON body nếu cần
app.use(express.json());

// Import các routes của bạn (ví dụ có file routes)
const aiRoutes = require('./routes/ai.routes');
app.use('/api/ai', aiRoutes);

// Khởi động listener realtime cho health data
require('./listeners/data');

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});