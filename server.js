const express = require('express');
const app = express();

const aiRoutes = require('./src/routes/ai.routes');
const emailRoutes = require('./src/routes/email.routes');
const utilsRoutes = require('./src/routes/utils.routes');

app.use(express.json());

app.use('/api/ai', aiRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/utils', utilsRoutes);

app.listen(3000, () => console.log("Server running on port 3000"));