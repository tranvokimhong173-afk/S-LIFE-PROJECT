// src/services/dbFunctions.js

const db = require('../config/firebase'); 

// --- CÁC HÀM LẤY DỮ LIỆU ---

/**
 * Lấy lịch sử dữ liệu trong vòng 7 ngày gần nhất.
 * @param {string} deviceID ID thiết bị
 * @returns {Array<Object>} Mảng các bản ghi lịch sử 7 ngày
 */
async function get7DaysHistory(deviceID) {
    const RECORDS_PATH = `history/${deviceID}/records`;
    // Tính toán timestamp 7 ngày trước
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; 
    try {
        const snapshot = await db.ref(RECORDS_PATH)
            .orderByKey()
            .startAt(sevenDaysAgo.toString())
            .once('value');
            
        const data = snapshot.val();
        
        // Chuyển object thành mảng, thêm timestamp key vào object
        return data ? Object.keys(data).map(key => ({
            ...data[key],
            timestamp: parseInt(key) 
        })) : [];

    } catch (error) {
        console.error(`❌ ERROR in get7DaysHistory for ${deviceID}:`, error);
        return [];
    }
}

/**
 * Lấy N bản ghi gần nhất.
 * @param {string} deviceID ID thiết bị
 * @param {number} n Số lượng bản ghi cần lấy (mặc định 50)
 * @returns {Array<Object>} Mảng các bản ghi gần nhất
 */
async function getLastNHistory(deviceID, n = 50) {
    const RECORDS_PATH = `history/${deviceID}/records`;
    try {
        const snapshot = await db.ref(RECORDS_PATH).orderByKey().limitToLast(n).once('value');
        const data = snapshot.val();
        // Lấy N bản ghi gần nhất cho phân tích tức thì
        return data ? Object.values(data) : []; 
    } catch (error) {
        console.error(`❌ ERROR in getLastNHistory for ${deviceID}:`, error);
        return [];
    }
}

/**
 * Lấy thông tin hồ sơ người dùng (tuổi, bệnh nền).
 * @param {string} deviceID ID thiết bị
 * @returns {Object} Hồ sơ người dùng
 */
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

/**
 * Lấy tất cả bản ghi giữa hai mốc thời gian (dùng cho phân tích giấc ngủ).
 * @param {string} deviceID ID thiết bị
 * @param {number} startTime Timestamp bắt đầu (miligiây)
 * @param {number} endTime Timestamp kết thúc (miligiây)
 * @returns {Array<Object>} Mảng các bản ghi trong khoảng thời gian.
 */
async function getSleepHistory(deviceID, startTime, endTime) {
    const RECORDS_PATH = `history/${deviceID}/records`;
    try {
        const snapshot = await db.ref(RECORDS_PATH)
            .orderByKey()
            .startAt(startTime.toString())
            .endAt(endTime.toString())
            .once('value');
            
        const data = snapshot.val();
        
        return data ? Object.keys(data).map(key => ({
            ...data[key],
            timestamp: parseInt(key) 
        })).filter(record => record.isResting === true) 
        : [];

    } catch (error) {
        console.error(`❌ ERROR in getSleepHistory for ${deviceID}:`, error);
        return [];
    }
}


// --- CÁC HÀM GHI DỮ LIỆU ---

/**
 * Lưu bản ghi sức khỏe mới vào lịch sử và xóa các bản ghi cũ hơn 7 ngày.
 * @param {string} deviceID ID thiết bị
 * @param {Object} data Dữ liệu sức khỏe mới
 */
async function saveHistory(deviceID, data) {
    const timestamp = Date.now();
    let removedCount = 0; 
    const RECORDS_PATH = `history/${deviceID}/records`; 

    try {
        const historyRef = db.ref(RECORDS_PATH);
        const newRecordKey = timestamp.toString();
        let updates = { [newRecordKey]: data };
        
        const sevenDaysAgo = timestamp - 7 * 24 * 60 * 60 * 1000;
        
        // Truy vấn các bản ghi cũ hơn 7 ngày
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
        
        // Thực hiện Multi-path Update: Thêm bản ghi mới và xóa bản ghi cũ
        await historyRef.update(updates); 
        
        console.log(`✅ Completed DB update for ${deviceID}. (Added 1, Removed ${removedCount})`);

    } catch (error) {
        console.error(`❌ ERROR in saveHistory for ${deviceID}:`, error);
    }
}

/**
 * Lưu cảnh báo (Alert) vào lịch sử cảnh báo.
 * @param {string} deviceID ID thiết bị
 * @param {Object} alertData Dữ liệu cảnh báo
 */
async function saveAlert(deviceID, alertData) {
    const timestamp = Date.now();
    try {
        // Lưu cảnh báo vào path history/{deviceId}/alerts/{timestamp}
        await db.ref(`history/${deviceID}/alerts/${timestamp}`).set(alertData);
        console.log(`📝 Alert saved to history/alerts for ${deviceID}.`);
    } catch (error) {
        console.error(`❌ ERROR in saveAlert for ${deviceID}:`, error);
    }
}

// --- EXPORT CÁC HÀM CHO CÁC MODULE KHÁC ---

module.exports = { 
    saveHistory, 
    get7DaysHistory, 
    saveAlert, 
    getLastNHistory,
    getUserProfile,
    getSleepHistory
};