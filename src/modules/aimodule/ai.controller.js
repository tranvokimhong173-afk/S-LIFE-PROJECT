const { analyze } = require('./ai.service');
const { sendAlertEmail } = require('../../utils/email');

async function analyzeDevice(req, res) {
    try {
        const { deviceID } = req.params;
        const result = await analyze(deviceID);

        if (result.risk >= 50) {
            await sendAlertEmail(deviceID, result.data, result);
        }

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { analyzeDevice };