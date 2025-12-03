const express = require('express');
const app = express();

const aiRoutes = require('./src/routes/ai.routes');

app.use(express.json());

app.use('/api/ai', aiRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/utils', utilsRoutes);

app.listen(3000, () => console.log("Server running on port 3000"));
