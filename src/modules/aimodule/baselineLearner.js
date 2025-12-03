// src/ai/baselineLearner.js

const db = require('../../config/firebase');
// Điều chỉnh: Sử dụng đường dẫn tới thư mục services
const { mean, std } = require('../../utils/math'); 

/**
 * Hàm phụ trợ: Xác định ngữ cảnh (key) dựa trên thời gian và trạng thái nghỉ ngơi/hoạt động
 * @param {number} timestamp - Thời gian bản ghi (miligiây)
 * @param {boolean} isResting - Trạng thái nghỉ ngơi (true/false)
 * @returns {string} Key phân nhóm (Ví dụ: Morning_Resting_Weekday)
 */
function getGroupingKey(timestamp, isResting) {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const day = date.getDay(); // 0 = Chủ nhật, 6 = Thứ Bảy

    let timeSlot;
    // Chia khung giờ chuẩn
    if (hour >= 6 && hour < 12) timeSlot = 'Morning';
    else if (hour >= 12 && hour < 18) timeSlot = 'Afternoon';
    else if (hour >= 18 && hour < 22) timeSlot = 'Evening';
    else timeSlot = 'Night'; // 22h - 6h

    const dayType = (day === 0 || day === 6) ? 'Weekend' : 'Weekday';
    const activityType = isResting ? 'Resting' : 'Active';

    return `${timeSlot}_${activityType}_${dayType}`;
}


/**
 * 📊 Hàm chính: Học và lưu Baseline cho các chỉ số sinh hiệu (BPM, HRV, Temp, SpO2) vào RTDB.
 * Kết quả được lưu tại history/{deviceId}/patterns
 * * @param {string} deviceID ID thiết bị
 * @param {Array<Object>} history - Mảng dữ liệu lịch sử từ records (ví dụ: 7 ngày gần nhất)
 */
async function learnAndSaveBaseline(deviceID, history) {
    // Yêu cầu tối thiểu 50 bản ghi để học
    if (!history || history.length < 50) {
        console.warn("⚠️ Không đủ dữ liệu lịch sử để học Baseline (>50 bản ghi).");
        return null;
    }

    const groupedData = {};
    const metrics = ['bpm', 'hrv', 'temp', 'spo2'];

    // 1. Phân nhóm Dữ liệu dựa trên Ngữ cảnh
    history.forEach(record => {
        // Lấy timestamp từ key của bản ghi (đã được thêm trong get7DaysHistory)
        const key = getGroupingKey(parseInt(record.timestamp), record.isResting || false); 

        if (!groupedData[key]) {
            groupedData[key] = { bpm: [], hrv: [], temp: [], spo2: [] };
        }
        
        // Chỉ thêm vào mảng nếu giá trị tồn tại
        metrics.forEach(metric => {
            if (record[metric] !== undefined && record[metric] !== null) {
                groupedData[key][metric].push(record[metric]);
            }
        });
    });

    const patterns = {};

    // 2. Tính toán Mean và Std cho từng Ngữ cảnh
    for (const key in groupedData) {
        const group = groupedData[key];
        patterns[key] = { last_updated: Date.now() }; 

        metrics.forEach(metric => {
            const arr = group[metric];
            // Yêu cầu tối thiểu 10 mẫu trong nhóm để tính toán đáng tin cậy
            if (arr.length >= 10) { 
                const avg = mean(arr);
                const standardDev = std(arr);
                
                // Lưu Mean và Std với độ chính xác 2 chữ số thập phân
                patterns[key][`${metric}Mean`] = parseFloat(avg.toFixed(2));
                patterns[key][`${metric}Std`] = parseFloat(standardDev.toFixed(2));
            }
        });
    }

    // 3. Lưu kết quả vào history/{deviceId}/patterns
    try {
        await db.ref(`history/${deviceID}/patterns`).set(patterns);
        console.log(`✅ Success: Saved ${Object.keys(patterns).length} baseline patterns for ${deviceID}.`);
        return patterns;
    } catch (error) {
        console.error(`❌ ERROR saving patterns for ${deviceID}:`, error);
        return null;
    }
}

module.exports = { learnAndSaveBaseline, getGroupingKey };