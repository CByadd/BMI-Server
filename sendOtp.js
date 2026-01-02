/**
 * Route Mobile – Server Generated OTP via BULK SMS
 * Single Node.js file
 */

const http = require("http");

// ================= CONFIG =================
const ROUTE_HOST = "sms6.rmlconnect.net";
const ROUTE_PORT = 8080;

const USERNAME = "kaapistr";
const PASSWORD = "1L(d!i2O";
const SENDER_ID = "WELTDY";
const MOBILE = "9443932288";
// ==========================================

// ===== Generate OTP on server =====
function generateOTP(length = 6) {
  return Math.floor(Math.pow(10, length - 1) +
    Math.random() * Math.pow(9, length - 1)).toString();
}

const otp = generateOTP(6);

// Message (OTP embedded)
const message = `Your Well2Day verification code is ${otp}. Valid for 5 minutes.`;

// ===== Build query params =====
const params = new URLSearchParams({
  username: USERNAME,
  password: PASSWORD,
  type: "0",           // Plain text (GSM 03.38)
  dlr: "1",            // Delivery report required
  destination: MOBILE,
  source: SENDER_ID,
  message: message
});

const options = {
  hostname: ROUTE_HOST,
  port: ROUTE_PORT,
  path: `/bulksms/bulksms?${params.toString()}`,
  method: "GET"
};

console.log("📨 Sending OTP SMS...");
console.log("📱 Mobile:", MOBILE);
console.log("🔐 OTP:", otp); // store this in DB/Redis in real apps

const req = http.request(options, (res) => {
  let data = "";

  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    console.log("✅ SMS Gateway Response:", data.trim());

    if (data.startsWith("1701")) {
      console.log("🎉 OTP SMS sent successfully");
    } else {
      console.log("⚠️ Failed to send SMS");
    }
  });
});

req.on("error", (err) => {
  console.error("❌ Network Error:", err.message);
});

req.end();
