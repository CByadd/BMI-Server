// Check DATABASE_URL format
require('dotenv').config();

console.log('DATABASE_URL check:');
console.log('Raw:', process.env.DATABASE_URL);

if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('\nParsed URL:');
    console.log('Protocol:', url.protocol);
    console.log('Hostname:', url.hostname);
    console.log('Port:', url.port);
    console.log('Pathname:', url.pathname);
    console.log('Username:', url.username);
    console.log('Password:', url.password ? '***' : 'not set');
    console.log('Search params:', url.searchParams.toString());
    
    // Check if it's an Azure PostgreSQL URL
    if (url.hostname.includes('azure.com')) {
      console.log('\n✓ This appears to be an Azure PostgreSQL database');
      console.log('Note: Azure PostgreSQL requires SSL and may need firewall rules configured');
    }
  } catch (e) {
    console.error('Error parsing URL:', e.message);
  }
} else {
  console.log('DATABASE_URL is not set!');
}


