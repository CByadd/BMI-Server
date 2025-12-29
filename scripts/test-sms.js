/**
 * Test Script for Route Mobile Bulk SMS API
 * This script tests SMS sending with different configurations
 * 
 * Usage: node server/scripts/test-sms.js <mobile_number>
 * Example: node server/scripts/test-sms.js 9443932288
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

// Get configuration from environment variables
const SMS_API_BASE_URL = process.env.OTP_API_BASE_URL || 'http://sms6.rmlconnect.net:8080';
const SMS_USERNAME = process.env.OTP_USERNAME || '';
const SMS_PASSWORD = process.env.OTP_PASSWORD || '';
const SMS_SOURCE = process.env.OTP_SOURCE || '';

// Get mobile number from command line argument
const mobileNumber = process.argv[2];

if (!mobileNumber) {
  console.error('❌ Error: Mobile number is required');
  console.log('Usage: node server/scripts/test-sms.js <mobile_number>');
  console.log('Example: node server/scripts/test-sms.js 9443932288');
  process.exit(1);
}

// Clean mobile number
const cleanMobile = mobileNumber.replace(/\D/g, '');

if (cleanMobile.length !== 10) {
  console.error('❌ Error: Mobile number must be 10 digits');
  process.exit(1);
}

// Validate configuration
if (!SMS_API_BASE_URL || !SMS_USERNAME || !SMS_PASSWORD || !SMS_SOURCE) {
  console.error('❌ Error: SMS configuration is missing');
  console.log('Required environment variables:');
  console.log('  - OTP_API_BASE_URL');
  console.log('  - OTP_USERNAME');
  console.log('  - OTP_PASSWORD');
  console.log('  - OTP_SOURCE');
  process.exit(1);
}

console.log('\n📱 Route Mobile SMS Test Script\n');
console.log('Configuration:');
console.log(`  Base URL: ${SMS_API_BASE_URL}`);
console.log(`  Username: ${SMS_USERNAME}`);
console.log(`  Password: ${SMS_PASSWORD ? '***' : 'NOT SET'}`);
console.log(`  Source: ${SMS_SOURCE}`);
console.log(`  Mobile: ${cleanMobile}\n`);

/**
 * Test 1: Simple plain text message (exact PHP format)
 */
async function testSimpleMessage() {
  console.log('🧪 Test 1: Simple Plain Text Message (PHP format)');
  console.log('─'.repeat(50));
  
  const message = 'Test message from Well2Day. Please ignore.';
  // Use urlencode equivalent (encodeURIComponent in JavaScript)
  const encodedMessage = encodeURIComponent(message);
  
  const baseUrl = SMS_API_BASE_URL.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/bulksms/bulksms`;
  
  const queryParams = [
    `username=${encodeURIComponent(SMS_USERNAME)}`,
    `password=${encodeURIComponent(SMS_PASSWORD)}`,
    `type=0`, // Plain text
    `dlr=0`, // No delivery report
    `destination=${encodeURIComponent(cleanMobile)}`,
    `source=${encodeURIComponent(SMS_SOURCE)}`,
    `message=${encodedMessage}`
  ];
  
  const fullUrl = `${apiUrl}?${queryParams.join('&')}`;
  
  console.log('Message:', message);
  console.log('Encoded Message:', encodedMessage);
  console.log('URL (password hidden):', fullUrl.replace(/password=[^&]*/, 'password=***'));
  console.log('');
  
  try {
    const response = await axios.get(fullUrl, {
      timeout: 25000,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Node.js/SMS-Test'
      },
      validateStatus: (status) => status >= 200 && status < 500
    });
    
    const responseText = (response.data?.toString() || response.data || '').trim();
    console.log('Response Status:', response.status);
    console.log('Response:', responseText);
    
    if (responseText.startsWith('1701|')) {
      console.log('✅ SUCCESS: Message sent successfully!');
      const parts = responseText.split('|');
      if (parts[1]) {
        const cellAndId = parts[1].split(':');
        console.log(`   Cell Number: ${cellAndId[0]}`);
        console.log(`   Message ID: ${cellAndId[1] || 'N/A'}`);
      }
      return true;
    } else {
      console.log('❌ FAILED: Error response from API');
      console.log('   Error Code:', responseText);
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED: Request error');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return false;
  }
}

/**
 * Test 2: OTP-style message
 */
async function testOTPMessage() {
  console.log('\n🧪 Test 2: OTP-Style Message');
  console.log('─'.repeat(50));
  
  const testOTP = '123456';
  const message = `Your OTP is ${testOTP}. Valid for 5 minutes.`;
  const encodedMessage = encodeURIComponent(message);
  
  const baseUrl = SMS_API_BASE_URL.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/bulksms/bulksms`;
  
  const queryParams = [
    `username=${encodeURIComponent(SMS_USERNAME)}`,
    `password=${encodeURIComponent(SMS_PASSWORD)}`,
    `type=0`, // Plain text
    `dlr=0`, // No delivery report
    `destination=${encodeURIComponent(cleanMobile)}`,
    `source=${encodeURIComponent(SMS_SOURCE)}`,
    `message=${encodedMessage}`
  ];
  
  const fullUrl = `${apiUrl}?${queryParams.join('&')}`;
  
  console.log('Message:', message);
  console.log('Encoded Message:', encodedMessage);
  console.log('URL (password hidden):', fullUrl.replace(/password=[^&]*/, 'password=***'));
  console.log('');
  
  try {
    const response = await axios.get(fullUrl, {
      timeout: 25000,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Node.js/SMS-Test'
      },
      validateStatus: (status) => status >= 200 && status < 500
    });
    
    const responseText = (response.data?.toString() || response.data || '').trim();
    console.log('Response Status:', response.status);
    console.log('Response:', responseText);
    
    if (responseText.startsWith('1701|')) {
      console.log('✅ SUCCESS: OTP message sent successfully!');
      const parts = responseText.split('|');
      if (parts[1]) {
        const cellAndId = parts[1].split(':');
        console.log(`   Cell Number: ${cellAndId[0]}`);
        console.log(`   Message ID: ${cellAndId[1] || 'N/A'}`);
      }
      return true;
    } else {
      console.log('❌ FAILED: Error response from API');
      console.log('   Error Code:', responseText);
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED: Request error');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return false;
  }
}

/**
 * Test 3: Short message
 */
async function testShortMessage() {
  console.log('\n🧪 Test 3: Short Message');
  console.log('─'.repeat(50));
  
  const message = 'Test SMS';
  const encodedMessage = encodeURIComponent(message);
  
  const baseUrl = SMS_API_BASE_URL.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/bulksms/bulksms`;
  
  const queryParams = [
    `username=${encodeURIComponent(SMS_USERNAME)}`,
    `password=${encodeURIComponent(SMS_PASSWORD)}`,
    `type=0`, // Plain text
    `dlr=1`, // With delivery report
    `destination=${encodeURIComponent(cleanMobile)}`,
    `source=${encodeURIComponent(SMS_SOURCE)}`,
    `message=${encodedMessage}`
  ];
  
  const fullUrl = `${apiUrl}?${queryParams.join('&')}`;
  
  console.log('Message:', message);
  console.log('Encoded Message:', encodedMessage);
  console.log('URL (password hidden):', fullUrl.replace(/password=[^&]*/, 'password=***'));
  console.log('');
  
  try {
    const response = await axios.get(fullUrl, {
      timeout: 25000,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Node.js/SMS-Test'
      },
      validateStatus: (status) => status >= 200 && status < 500
    });
    
    const responseText = (response.data?.toString() || response.data || '').trim();
    console.log('Response Status:', response.status);
    console.log('Response:', responseText);
    
    if (responseText.startsWith('1701|')) {
      console.log('✅ SUCCESS: Short message sent successfully!');
      const parts = responseText.split('|');
      if (parts[1]) {
        const cellAndId = parts[1].split(':');
        console.log(`   Cell Number: ${cellAndId[0]}`);
        console.log(`   Message ID: ${cellAndId[1] || 'N/A'}`);
      }
      return true;
    } else {
      console.log('❌ FAILED: Error response from API');
      console.log('   Error Code:', responseText);
      
      // Show error meaning
      const errorMessages = {
        '1702': 'Invalid URL or missing parameter',
        '1703': 'Invalid username or password',
        '1706': 'Invalid destination (mobile number)',
        '1707': 'Invalid source (sender ID)',
        '1025': 'Insufficient credit',
        '1032': 'DND reject (Do Not Disturb)',
        '1028': 'Spam message',
        '1709': 'User validation failed'
      };
      
      if (errorMessages[responseText]) {
        console.log(`   Meaning: ${errorMessages[responseText]}`);
      }
      
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED: Request error');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return false;
  }
}

/**
 * Test 4: With country code prefix
 */
async function testWithCountryCode() {
  console.log('\n🧪 Test 4: Message with Country Code Prefix');
  console.log('─'.repeat(50));
  
  const message = 'Test with country code prefix';
  const encodedMessage = encodeURIComponent(message);
  
  // Add country code 91 (India)
  const destinationWithCountry = `91${cleanMobile}`;
  
  const baseUrl = SMS_API_BASE_URL.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/bulksms/bulksms`;
  
  const queryParams = [
    `username=${encodeURIComponent(SMS_USERNAME)}`,
    `password=${encodeURIComponent(SMS_PASSWORD)}`,
    `type=0`, // Plain text
    `dlr=0`, // No delivery report
    `destination=${encodeURIComponent(destinationWithCountry)}`,
    `source=${encodeURIComponent(SMS_SOURCE)}`,
    `message=${encodedMessage}`
  ];
  
  const fullUrl = `${apiUrl}?${queryParams.join('&')}`;
  
  console.log('Message:', message);
  console.log('Destination (with country code):', destinationWithCountry);
  console.log('URL (password hidden):', fullUrl.replace(/password=[^&]*/, 'password=***'));
  console.log('');
  
  try {
    const response = await axios.get(fullUrl, {
      timeout: 25000,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Node.js/SMS-Test'
      },
      validateStatus: (status) => status >= 200 && status < 500
    });
    
    const responseText = (response.data?.toString() || response.data || '').trim();
    console.log('Response Status:', response.status);
    console.log('Response:', responseText);
    
    if (responseText.startsWith('1701|')) {
      console.log('✅ SUCCESS: Message with country code sent successfully!');
      return true;
    } else {
      console.log('❌ FAILED: Error response from API');
      console.log('   Error Code:', responseText);
      return false;
    }
  } catch (error) {
    console.log('❌ FAILED: Request error');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('Starting SMS tests...\n');
  
  const results = {
    test1: await testSimpleMessage(),
    test2: await testOTPMessage(),
    test3: await testShortMessage(),
    test4: await testWithCountryCode()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(50));
  console.log(`Test 1 (Simple Message): ${results.test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 2 (OTP Message): ${results.test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 3 (Short Message): ${results.test3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 4 (With Country Code): ${results.test4 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(50));
  
  const passedCount = Object.values(results).filter(r => r).length;
  console.log(`\nTotal: ${passedCount}/4 tests passed\n`);
  
  if (passedCount === 0) {
    console.log('⚠️  All tests failed. Please check:');
    console.log('   1. Environment variables are set correctly');
    console.log('   2. Username and password are correct');
    console.log('   3. Source (sender ID) is approved and active');
    console.log('   4. Account has sufficient credits');
    console.log('   5. Mobile number is not on DND list');
    console.log('   6. Network connectivity to Route Mobile server');
  } else if (passedCount < 4) {
    console.log('⚠️  Some tests failed. Check the error messages above.');
  } else {
    console.log('✅ All tests passed! SMS delivery should be working.');
    console.log('   If you still don\'t receive SMS, check:');
    console.log('   - Mobile number is correct');
    console.log('   - Phone is not in airplane mode');
    console.log('   - Network signal is available');
    console.log('   - Number is not blocked');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});

