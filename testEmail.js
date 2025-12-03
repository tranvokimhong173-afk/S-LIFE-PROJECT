const nodemailer = require('nodemailer');

async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "slife.k12project@gmail.com",
      pass: "nimeibcdoindsyvs",
    }
  });

  try {
    const info = await transporter.sendMail({
      from: "slife.k12project@gmail.com",
      to: "tranvokmhong173@gmail.com",
      subject: "Test Nodemailer",
      text: "Test gửi mail thành công",
    });
    console.log("✅ Sent:", info.response);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

testEmail();
