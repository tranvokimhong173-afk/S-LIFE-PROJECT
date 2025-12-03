// src/modules/aimodule/ai.service.js
const { db } = require('../../config/firebase');
// Sửa đường dẫn nếu cần, giả định 'email.js' nằm trong 'utils'
const { sendAlertEmail } = require('../../utils/email'); 

// ... (Hằng số giữ nguyên)

// ------------------- 1. Phân tích dữ liệu cá nhân (Đã sửa trả về MẢNG alerts) -------------------
async function analyzePersonalPattern(deviceID, data, history, age, underlyingConditions) {
    let risk = 0;
    let alerts = [];

    try {
        const baselineSnap = await db.ref(`baselines/${deviceID}`).once('value');
        const baseline = baselineSnap.val() || {};
        const avgBpm = baseline.bpm_weekly_avg || 80;
        const currentBpm = data.bpm || null;

        if (currentBpm) {
            if (currentBpm > avgBpm * 1.2) {
                risk += 60;
                alerts.push(`Nhịp tim (${currentBpm} bpm) tăng ${((currentBpm / avgBpm - 1) * 100).toFixed(0)}% so với mức trung bình tuần qua (${avgBpm} bpm).`);
            }
            if (data.hrv < 40 && currentBpm > 90) {
                risk += 30;
                alerts.push(`HRV thấp (${data.hrv}) trong khi nhịp tim cao. Có dấu hiệu căng thẳng/mệt mỏi.`);
            }
        }

        if (data.temp && data.temp > 37.5 && age > 60) {
            risk += 40;
            alerts.push(`Người cao tuổi (${age} tuổi) có dấu hiệu sốt nhẹ (${data.temp}°C).`);
        }

    } catch (err) {
        console.error(`Lỗi phân tích AI cho ${deviceID}:`, err);
        return { risk: 0, alerts: ["AI gặp lỗi khi tính toán rủi ro cá nhân."], dataContext: data };
    }

    if (risk > 100) risk = 100;

    // ⭐ SỬA LỖI: Trả về MẢNG STRING alerts cho hàm gửi email xử lý
    return { risk, alerts, dataContext: data }; 
}

// ------------------- 2. Dự đoán giá trị tiếp theo -------------------
function predictNextValue(history, metric) {
    if (!history || history.length < 5) return null;
    const relevant = history.slice(-5).map(r => r[metric]).filter(v => typeof v === 'number');
    if (!relevant.length) return null;
    return parseFloat((relevant.reduce((a,b)=>a+b,0)/relevant.length).toFixed(1));
}

// ------------------- 3. Gửi cảnh báo nếu cần (Đã sửa cú pháp tham số) -------------------
// ⭐ SỬA LỖI: Hàm này phải nhận đủ 3 tham số để truyền cho sendAlertEmail
async function sendAlertsIfNeeded(deviceID, data, analysis) { 
    if (!analysis || !analysis.alerts || analysis.alerts.length === 0) return;

    try {
        // Gọi hàm gửi email với đủ 3 tham số
        await sendAlertEmail(deviceID, data, analysis); 
        console.log(`📧 Đã gửi email cảnh báo cho ${deviceID}`);
    } catch (err) {
        // Ghi lại lỗi từ Transporter
        console.error(`❌ Lỗi khi gửi email cảnh báo cho ${deviceID}:`, err.message); 
    }
}

module.exports = {
    analyzePersonalPattern,
    predictNextValue,
    sendAlertsIfNeeded
};