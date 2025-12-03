const express = require('express');
const router = express.Router();
const { analyzeDevice } = require('../modules/aimodule/ai.controller');

router.get('/analyze/:deviceID', analyzeDevice);

module.exports = router;