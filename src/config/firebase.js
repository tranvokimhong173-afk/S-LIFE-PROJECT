// src/config/firebase.js

const admin = require('firebase-admin');

// 1. Tải cấu hình Service Account
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Đảm bảo privateKey được định dạng đúng cách
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

// 2. KHỞI TẠO ỨNG DỤNG FIREBASE
// Lệnh này phải chạy trước khi sử dụng bất kỳ dịch vụ nào
if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.DATABASE_URL,
    });
}

// 3. LẤY VÀ KHỞI TẠO CÁC DỊCH VỤ CẦN THIẾT
const db = admin.database(); // Đối tượng Realtime Database
const firestore = admin.firestore(); // Đối tượng Firestore (nếu bạn sử dụng)

// 4. EXPORT CÁC ĐỐI TƯỢNG DỊCH VỤ
// Đây là đối tượng mà các tệp khác sẽ require
module.exports = { db, firestore, admin };