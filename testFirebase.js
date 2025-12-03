require('dotenv').config();
const admin = require('firebase-admin');

const serviceAccount = {
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DATABASE_URL,
});

const db = admin.database();

async function readData() {
  try {
    // Giả sử bạn có node 'testNode' trong Realtime Database
    const ref = db.ref('testNode');
    
    const snapshot = await ref.once('value');
    const data = snapshot.val();
    
    console.log("Dữ liệu đọc được từ testNode:", data);
  } catch (error) {
    console.error("Lỗi đọc dữ liệu Firebase:", error);
  }
}

readData();