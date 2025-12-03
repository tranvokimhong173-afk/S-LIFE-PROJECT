// src/modules/listeners/healthDataListener.js

// Import Firebase config
const { db, firestore } = require('../config/firebase'); 
// Import các module AI (bao gồm hàm gửi email đã sửa lỗi cú pháp tham số)
const { sendAlertsIfNeeded, analyzePersonalPattern, predictNextValue } = require('../modules/aimodule/ai.service'); 
const { learnAndSaveBaseline } = require('../modules/aimodule/baselineLearner');
const { analyzeAndSaveSleepSummary } = require('../modules/aimodule/sleepAnalyzer');
const { analyzeLongTermTrends, getWeekIdentifier } = require('../modules/aimodule/longTermAnalyzer'); 

console.log("🔍 Listening for health data changes at: healthData/device1");

// --- 1. HÀM HỖ TRỢ DB ---

/**
 * Lưu cảnh báo vào RTDB (lịch sử) và Firestore (live alerts).
 * @param {string} deviceID 
 * @param {object} alertData 
 */
async function saveAlert(deviceID, alertData) {
    const timestamp = Date.now();
    try {
        // 1. LƯU VÀO RTDB 
        await db.ref(`history/${deviceID}/alerts/${timestamp}`).set(alertData);
        console.log(`📝 Alert saved to history/alerts (RTDB) for ${deviceID}.`);

        // 2. GHI VÀO FIRESTORE 
        const alertDoc = {
            // alertData.alerts là mảng string từ code đã sửa
            type: alertData.isPhysicalAlert ? "critical" : "warning", 
            message: alertData.alerts.join(" | "), 
            timestamp: new Date(timestamp).toISOString(),
            deviceID: deviceID,
            riskScore: alertData.riskScore,
            dataContext: alertData.dataContext
        };
        await firestore.collection('alerts').add(alertDoc);
        console.log(`✅ Alert saved to Firestore for ${deviceID}.`);
    } catch (error) {
        console.error(`❌ ERROR in saveAlert for ${deviceID}:`, error);
    }
}

async function get7DaysHistory(deviceID) {
    const RECORDS_PATH = `history/${deviceID}/records`;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    try {
        const snapshot = await db.ref(RECORDS_PATH)
            .orderByKey()
            .startAt(sevenDaysAgo.toString())
            .once('value');

        const data = snapshot.val();
        return data ? Object.keys(data).map(key => ({
            ...data[key],
            timestamp: key
        })) : [];
    } catch (error) {
        console.error(`❌ ERROR in get7DaysHistory for ${deviceID}:`, error);
        return [];
    }
}

async function getLastNHistory(deviceID, n = 50) {
    const RECORDS_PATH = `history/${deviceID}/records`;
    try {
        const snapshot = await db.ref(RECORDS_PATH).orderByKey().limitToLast(n).once('value');
        const data = snapshot.val();
        return data ? Object.values(data) : [];
    } catch (error) {
        console.error(`❌ ERROR in getLastNHistory for ${deviceID}:`, error);
        return [];
    }
}

async function getUserProfile(deviceID) {
    try {
        const snapshot = await db.ref(`userProfile/${deviceID}`).once('value');
        const profile = snapshot.val() || {};
        return {
            age: profile.age || 30,
            underlyingConditions: profile.underlyingConditions || {}
        };
    } catch (error) {
        console.error(`❌ ERROR in getUserProfile for ${deviceID}:`, error);
        return { age: 30, underlyingConditions: {} };
    }
}

async function saveHistory(deviceID, data) {
    const timestamp = Date.now();
    let removedCount = 0;
    const RECORDS_PATH = `history/${deviceID}/records`;

    try {
        const historyRef = db.ref(RECORDS_PATH);
        const newRecordKey = timestamp.toString();
        let updates = { [newRecordKey]: data };

        const sevenDaysAgo = timestamp - 7 * 24 * 60 * 60 * 1000;

        const snapshot = await historyRef
            .orderByKey()
            .endAt(sevenDaysAgo.toString())
            .once('value');

        const oldData = snapshot.val();

        if (oldData) {
            for (let key in oldData) {
                if (parseInt(key) <= sevenDaysAgo) {
                    updates[key] = null; // Đánh dấu xóa
                    removedCount++;
                }
            }
        }
        await historyRef.update(updates);
        console.log(`✅ Completed DB update for ${deviceID}. (Added 1, Removed ${removedCount})`);

    } catch (error) {
        console.error(`❌ ERROR in saveHistory for ${deviceID}:`, error);
    }
}


// --- HÀM KIỂM TRA NGƯỠNG VẬT LÝ CƠ BẢN ---
function checkPhysicalThresholds(deviceID, data) {
    const alerts = [];
    let isCritical = false;

    // Ngưỡng vật lý cơ bản
    const MAX_BPM = 150; 
    const MIN_BPM = 40; 
    const MAX_TEMP = 40.0; 
    const MIN_TEMP = 35.0; 
    const MIN_SPO2 = 90; 

    if (data.bpm && (data.bpm > MAX_BPM || data.bpm < MIN_BPM)) {
        const message = `Nhịp tim (${data.bpm} bpm) vượt ngưỡng an toàn nghiêm trọng!`;
        alerts.push(message); 
        isCritical = true;
    }

    if (data.temp && data.temp > MAX_TEMP) {
        const message = `Nhiệt độ cơ thể (${data.temp}°C) vượt ngưỡng sốt cao nghiêm trọng!`;
        alerts.push(message);
        isCritical = true;
    }

    if (data.temp && data.temp < MIN_TEMP) {
        const message = `Nhiệt độ cơ thể (${data.temp}°C) dưới ngưỡng hạ thân nhiệt nghiêm trọng!`;
        alerts.push(message);
        isCritical = true;
    }
    
    if (data.spO2 && data.spO2 < MIN_SPO2) {
        const message = `SpO2 (${data.spO2}%) rất thấp, nguy cơ thiếu oxy máu nghiêm trọng!`;
        alerts.push(message);
        isCritical = true;
    }


    if (alerts.length > 0) {
        return {
            risk: isCritical ? 100 : 80, 
            alerts: alerts, // Trả về MẢNG STRING
            isPhysicalAlert: true // Dấu hiệu để biết đây là cảnh báo vật lý
        };
    }
    return null;
}


// --- 2. LISTENER CHÍNH (Xử lý Luồng Dữ liệu) ---

const ref = db.ref('healthData/device1');

ref.on('value', async (snapshot) => {
    try {
        const deviceID = snapshot.key;
        const data = snapshot.val();

        if (!data || Object.keys(data).length === 0) return;

        console.log(`\n📥 New data from ${deviceID}:`, data);

        // 1. LƯU DỮ LIỆU TỨC THỜI VÀO LỊCH SỬ (records)
        await saveHistory(deviceID, data);

        // BỔ SUNG: KIỂM TRA NGƯỠNG VẬT LÝ TRƯỚC HẾT
        const physicalAlert = checkPhysicalThresholds(deviceID, data);

        // ⭐ XỬ LÝ CẢNH BÁO VẬT LÝ
        if (physicalAlert) {
            console.log("🚨 CẢNH BÁO VẬT LÝ NGHIÊM TRỌNG ĐƯỢC KÍCH HOẠT!");
            
            const alertDataToSave = {
                timestamp: Date.now(),
                riskScore: physicalAlert.risk,
                alerts: physicalAlert.alerts, 
                isPhysicalAlert: true, // Thêm cờ để nhận diện trong saveAlert
                dataContext: data
            };
            await saveAlert(deviceID, alertDataToSave);
            
            // ⭐ SỬA LỖI QUAN TRỌNG: Truyền đủ 3 tham số: deviceID, data, analysis (alertDataToSave)
            await sendAlertsIfNeeded(deviceID, data, alertDataToSave); 
            console.log(`📧 Successfully triggered physical alert email.`);
            
            // DỪNG xử lý AI nếu đã có cảnh báo vật lý nghiêm trọng
            return; 
        }

        // 2. TẢI DỮ LIỆU CẦN THIẾT
        const history = await getLastNHistory(deviceID, 50); 
        const { age, underlyingConditions } = await getUserProfile(deviceID);

        // BỔ SUNG: 3. TÍCH HỢP HỌC BASELINE
        if (history.length > 10 && Math.random() < 0.1) { 
            const longTermHistory = await get7DaysHistory(deviceID); 
            if (longTermHistory.length > 100) {
                console.log("⏳ Bắt đầu Học và Cập nhật Baseline...");
                await learnAndSaveBaseline(deviceID, longTermHistory); 
            }
        }

        // 4. PHÂN TÍCH BẰNG AI CHÍNH
        const analysis = await analyzePersonalPattern(deviceID, data, history, age, underlyingConditions); 

        // 5. CẢNH BÁO VÀ GHI LỊCH SỬ CẢNH BÁO
        if (analysis.alerts && analysis.alerts.length > 0) {
            const alertDataToSave = {
                timestamp: Date.now(),
                riskScore: analysis.risk,
                alerts: analysis.alerts, 
                dataContext: data
            };
            await saveAlert(deviceID, alertDataToSave);
            
            // ⭐ SỬA LỖI QUAN TRỌNG: Truyền đủ 3 tham số: deviceID, data, analysis (alertDataToSave)
            await sendAlertsIfNeeded(deviceID, data, alertDataToSave);
            console.log(`📧 Successfully triggered AI alert email.`);
        }

        const nextBpm = predictNextValue(history, "bpm");
        const nextTemp = predictNextValue(history, "temp");

        console.log(`📊 Device: ${deviceID} | Risk Score: ${analysis.risk}/100`);
        console.log(`🔮 Next BPM: ${nextBpm} | Next Temp: ${nextTemp}`);

        // =========================================================
        // BỔ SUNG: 6. PHÂN TÍCH GIẤC NGỦ (Nhiệm vụ 2)
        // =========================================================
        const currentDate = new Date();
        const currentHour = currentDate.getHours();
        
        // Kích hoạt Phân tích Giấc ngủ một lần vào buổi sáng (ví dụ: 6h-7h)
        if (currentHour >= 6 && currentHour <= 7 && data.isResting === false) { 
            const summaryDate = currentDate.toISOString().split('T')[0];
            
            // Tránh chạy phân tích nhiều lần trong cùng một ngày
            const checkRef = db.ref(`history/${deviceID}/sleep_summaries/${summaryDate}`);
            const summarySnapshot = await checkRef.once('value');

            if (!summarySnapshot.exists()) {
                console.log("💤 Bắt đầu Phân tích Giấc ngủ Đêm qua...");
                const endTime = currentDate.getTime();
                // Giả định thời gian ngủ trung bình là 8 giờ
                await analyzeAndSaveSleepSummary(deviceID, endTime, 8); 
            }
        }
        
        // =========================================================
        // BỔ SUNG: 7. BÁO CÁO HÀNG TUẦN (Nhiệm vụ 3)
        // =========================================================
        const currentDayOfWeek = currentDate.getDay(); 
        const targetRunHour = 10; 

        // CHỈ CHẠY VÀO CHỦ NHẬT VÀ TRONG KHOẢNG 10H SÁNG
        if (currentDayOfWeek === 0 && currentHour === targetRunHour) { 
            const currentWeekId = getWeekIdentifier(currentDate);
            const weeklyRef = db.ref(`history/${deviceID}/weekly_summaries/${currentWeekId}`);
            const weeklySnapshot = await weeklyRef.once('value');

            if (!weeklySnapshot.exists()) {
                console.log("\n📰 Bắt đầu tạo Báo cáo Sức khỏe Hàng tuần...");
                await analyzeLongTermTrends(deviceID, currentDate);
            } else {
                console.log(`Báo cáo tuần ${currentWeekId} đã tồn tại. Bỏ qua.`);
            }
        }
        // =========================================================


    } catch (error) {
        console.error(`🔴 CRITICAL ERROR in healthData listener:`, error);
    }
});

console.log("✅ Listener for device1 is running...");

// XUẤT CÁC HÀM HỖ TRỢ ĐỂ FILE TEST CÓ THỂ GỌI ĐƯỢC
module.exports = { 
    saveHistory, 
    get7DaysHistory, 
    saveAlert, 
    getLastNHistory,
    getUserProfile,
    checkPhysicalThresholds, 
    analyzeAndSaveSleepSummary,
    analyzeLongTermTrends
};