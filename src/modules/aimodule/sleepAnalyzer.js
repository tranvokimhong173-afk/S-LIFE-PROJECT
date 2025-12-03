// src/ai/sleepAnalyzer.js

const db = require('../../config/firebase');
// Import các hàm DB cần thiết, bao gồm hàm mới getSleepHistory
const { getSleepHistory } = require('../../utils/dbFunctions'); 
// Giả định: Import hàm mean từ module toán học
const { mean } = require('../../utils/math'); 


// --- 1. HẰNG SỐ VÀ NGƯỠNG PHÂN LOẠI GIẤC NGỦ ---

const SLEEP_THRESHOLDS = {
    // Ngưỡng BPM (So với nhịp tim thấp nhất trong đêm - minBPM)
    BPM_DEEP_MAX_OFFSET: 5,   // Deep Sleep: BPM <= minBPM + 5 (rất ổn định)
    BPM_REM_MAX_OFFSET: 15,   // REM Sleep: BPM có thể cao hơn minBPM (tăng do mơ)
    
    // Ngưỡng HRV (So với trung bình HRV trong đêm - meanHRV)
    HRV_DEEP_MIN_OFFSET_FACTOR: 0.9, // Deep Sleep: HRV < meanHRV * 0.9 (HRV rất thấp)
    HRV_REM_MIN_OFFSET_FACTOR: 1.1,  // REM Sleep: HRV > meanHRV * 1.1 (HRV cao, biến động)
    
    ACC_WAKE_THRESHOLD: 10.0, // Gia tốc để đánh dấu thức giấc
    APNEA_SPO2_DROP: 3,       // Giảm 3% SpO2 trong 5 phút
};


// --- 2. PHÂN LOẠI GIAI ĐOẠN NGỦ ---

/**
 * Phân loại giai đoạn ngủ cho một bản ghi.
 * @param {Object} record - Bản ghi dữ liệu (bpm, hrv, spo2, totalAcc, timestamp)
 * @param {Object} nightStats - Thống kê của cả đêm (minBPM, meanHRV, meanSpO2)
 * @returns {string} Giai đoạn ngủ ('Wake', 'Light', 'Deep', 'REM')
 */
function classifySleepStage(record, nightStats) {
    const { bpm, hrv, totalAcc } = record;
    const { minBPM, meanHRV } = nightStats;
    
    // 1. WAKE (Thức giấc)
    // Nếu có chuyển động lớn hoặc nhịp tim tăng vọt (> 20 bpm so với min)
    if (totalAcc > SLEEP_THRESHOLDS.ACC_WAKE_THRESHOLD || bpm > minBPM + 20) {
        return 'Wake';
    }
    
    // 2. DEEP (Ngủ Sâu - NREM3)
    // Đặc trưng: BPM rất thấp và ổn định, HRV thấp
    if (bpm <= minBPM + SLEEP_THRESHOLDS.BPM_DEEP_MAX_OFFSET && 
        hrv < meanHRV * SLEEP_THRESHOLDS.HRV_DEEP_MIN_OFFSET_FACTOR) {
        return 'Deep';
    }

    // 3. REM (Ngủ Mơ)
    // Đặc trưng: BPM tăng (tương tự như thức) VÀ HRV cao (biến động lớn)
    if (bpm <= minBPM + SLEEP_THRESHOLDS.BPM_REM_MAX_OFFSET && 
        hrv > meanHRV * SLEEP_THRESHOLDS.HRV_REM_MIN_OFFSET_FACTOR) {
        return 'REM';
    }

    // 4. LIGHT (Ngủ Nông - Mọi thứ khác nằm giữa Deep và REM)
    return 'Light';
}


// --- 3. PHÁT HIỆN NGƯNG THỞ KHI NGỦ (APNEA) ---

/**
 * Phát hiện các sự kiện giảm SpO2 đột ngột (Ngưng thở khi ngủ)
 * @param {Array<Object>} history - Lịch sử bản ghi cả đêm
 * @returns {number} Số lần ngưng thở ước tính (Apnea Index)
 */
function detectApneaEvents(history) {
    let apneaCount = 0;
    
    for (let i = 1; i < history.length; i++) {
        const current = history[i];
        const previous = history[i-1];
        
        // Kiểm tra sự giảm SpO2 đột ngột trong 1 khoảng thời gian (5 phút)
        const spo2Drop = previous.spo2 - current.spo2;
        
        if (spo2Drop >= SLEEP_THRESHOLDS.APNEA_SPO2_DROP && current.spo2 < 95) {
            // Giảm 3% trở lên VÀ SpO2 hiện tại dưới 95%
            // Điều này gợi ý một sự kiện ngưng thở
            apneaCount++;
        }
    }
    
    // Giả định 1 sự kiện = 1 lần ngưng thở.
    return apneaCount; 
}


// --- 4. HÀM CHÍNH: TỔNG HỢP VÀ LƯU DỮ LIỆU ---

/**
 * Phân tích dữ liệu trong một đêm và tạo bản tóm tắt giấc ngủ, sau đó lưu vào DB.
 * @param {string} deviceID ID thiết bị
 * @param {number} endTime - Timestamp cuối cùng của đêm (ví dụ: 6:00 sáng nay)
 * @param {number} durationHours - Khoảng thời gian tìm kiếm (mặc định 8 giờ)
 */
async function analyzeAndSaveSleepSummary(deviceID, endTime, durationHours = 8) {
    const startTime = endTime - durationHours * 60 * 60 * 1000;

    // 1. Tải Dữ liệu Đêm (Chỉ lấy các bản ghi isResting=true)
    const history = await getSleepHistory(deviceID, startTime, endTime);

    if (history.length < 10) { // Yêu cầu tối thiểu 10 bản ghi (khoảng 50 phút)
        console.log("😴 Không đủ dữ liệu để phân tích giấc ngủ.");
        return null;
    }
    
    // 2. Tính toán Thống kê Cơ bản của Đêm
    const bpms = history.map(r => r.bpm).filter(Boolean);
    const hrvs = history.map(r => r.hrv).filter(Boolean);
    const spo2s = history.map(r => r.spo2).filter(Boolean);

    const nightStats = {
        minBPM: Math.min(...bpms),
        meanHRV: mean(hrvs),
        meanSpO2: mean(spo2s),
        totalRecords: history.length,
        // Giả định thời gian giữa các bản ghi (5 phút = 300000ms)
        timeUnitMs: (history[history.length - 1].timestamp - history[0].timestamp) / (history.length - 1) 
    };

    // 3. Phân loại từng bản ghi và Tính tổng thời gian
    const stagesDuration = { Wake: 0, Light: 0, Deep: 0, REM: 0 };
    
    history.forEach(record => {
        const stage = classifySleepStage(record, nightStats);
        stagesDuration[stage] += nightStats.timeUnitMs;
    });

    const totalTimeInBedMs = stagesDuration.Wake + stagesDuration.Light + stagesDuration.Deep + stagesDuration.REM;
    const totalSleepTimeMs = stagesDuration.Light + stagesDuration.Deep + stagesDuration.REM;

    // 4. Tính toán Chỉ số Tổng hợp
    const summaryDate = new Date(endTime).toISOString().split('T')[0];
    const sleepEfficiency = (totalSleepTimeMs / totalTimeInBedMs) * 100;
    const apneaEvents = detectApneaEvents(history);
    
    const summary = {
        date: summaryDate,
        totalTimeInBedMin: Math.round(totalTimeInBedMs / (60 * 1000)),
        totalSleepTimeMin: Math.round(totalSleepTimeMs / (60 * 1000)),
        
        // Chỉ số Chất lượng
        efficiency: parseFloat(sleepEfficiency.toFixed(1)),
        apnea_index: apneaEvents,
        
        stages: {
            wakeMin: Math.round(stagesDuration.Wake / (60 * 1000)),
            lightMin: Math.round(stagesDuration.Light / (60 * 1000)),
            deepMin: Math.round(stagesDuration.Deep / (60 * 1000)),
            remMin: Math.round(stagesDuration.REM / (60 * 1000)),
        },
        metrics: {
            minBPM: nightStats.minBPM,
            avgHRV: parseFloat(nightStats.meanHRV.toFixed(1)),
            avgSpO2: parseFloat(nightStats.meanSpO2.toFixed(1)),
        },
        last_updated: Date.now()
    };
    
    // 5. Lưu kết quả vào history/{deviceId}/sleep_summaries
    try {
        // Sử dụng định dạng key là ngày (YYYY-MM-DD)
        await db.ref(`history/${deviceID}/sleep_summaries/${summaryDate}`).set(summary);
        console.log(`✅ Success: Saved Sleep Summary for ${summaryDate} (Efficiency: ${summary.efficiency}%)`);
        return summary;
    } catch (error) {
        console.error(`❌ ERROR saving sleep summary for ${deviceID}:`, error);
        return null;
    }
}

module.exports = { analyzeAndSaveSleepSummary, classifySleepStage, detectApneaEvents };