const express = require('express');
const app = express();

// 1. Khai báo các route (giữ nguyên)
// Tôi giả định rằng bạn cũng cần emailRoutes như đã thảo luận trước đó
const aiRoutes = require('./src/routes/ai.routes');
// const emailRoutes = require('./src/routes/email.routes'); // Nếu cần, hãy bỏ chú thích dòng này

// 2. Định nghĩa cổng và host (Phần sửa lỗi quan trọng nhất)
// Ưu tiên sử dụng process.env.PORT do Render cung cấp (thường là 10000), 
// nếu không có thì dùng cổng dự phòng (ví dụ: 3000)
const port = process.env.PORT || 10000;

// 3. Middlewares (giữ nguyên)
app.use(express.json());

// 4. Định tuyến (Routes)
app.use('/api/ai', aiRoutes);
// app.use('/api/email', emailRoutes); // Nếu cần, hãy bỏ chú thích dòng này

// Thêm Route gốc ("/") để tránh lỗi "Cannot GET /"
app.get('/', (req, res) => {
    res.send('S-LIFE-PROJECT Server is running! Access API routes via /api/ai/...'); 
});

// 5. Khởi động Server (Phần sửa lỗi Render)
// Bắt buộc ràng buộc với '0.0.0.0' để nhận yêu cầu bên ngoài trên Render
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
