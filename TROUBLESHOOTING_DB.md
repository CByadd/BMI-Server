# Database Connection Troubleshooting Guide

## Current Issue
The server cannot connect to the Azure PostgreSQL database.

## Error Details
- Error Code: P1001
- Error: "Can't reach database server"
- Database: Azure PostgreSQL at `well2day-postgresqldatabase.postgres.database.azure.com:5432`

## Possible Causes & Solutions

### 1. Azure Firewall Rules
Azure PostgreSQL requires firewall rules to allow connections from your IP address.

**Solution:**
1. Go to Azure Portal → Your PostgreSQL Server
2. Navigate to "Connection security" or "Networking"
3. Add your current IP address to the firewall rules
4. Or enable "Allow access to Azure services" if connecting from Azure
5. Save the changes

### 2. Connection String Format
The DATABASE_URL might need adjustment for Azure PostgreSQL.

**Current format:**
```
postgresql://well2day%40well2day-postgresqldatabase:Adscape%402k25@well2day-postgresqldatabase.postgres.database.azure.com:5432/postgres?sslmode=require&sslaccept=strict
```

**Try this format instead:**
```
postgresql://well2day@well2day-postgresqldatabase:Adscape@2k25@well2day-postgresqldatabase.postgres.database.azure.com:5432/postgres?sslmode=require
```

### 3. SSL Configuration
Azure PostgreSQL requires SSL. Make sure:
- `sslmode=require` is in the connection string
- SSL certificates are properly configured

### 4. Network Connectivity
Test if you can reach the database server:

**Windows PowerShell:**
```powershell
Test-NetConnection -ComputerName well2day-postgresqldatabase.postgres.database.azure.com -Port 5432
```

**Or use telnet:**
```powershell
telnet well2day-postgresqldatabase.postgres.database.azure.com 5432
```

### 5. Database Server Status
Check if the Azure PostgreSQL server is running:
1. Go to Azure Portal
2. Check the server status
3. Ensure it's not paused or stopped

### 6. Username Format
For Azure PostgreSQL, the username format is usually:
- Format: `username@servername`
- Example: `well2day@well2day-postgresqldatabase`

Make sure the username in DATABASE_URL matches this format.

## Quick Fixes to Try

### Option 1: Update .env file
Try updating the DATABASE_URL in `.env`:

```env
DATABASE_URL="postgresql://well2day@well2day-postgresqldatabase:Adscape@2k25@well2day-postgresqldatabase.postgres.database.azure.com:5432/postgres?sslmode=require"
```

### Option 2: Test with psql
Test the connection directly with psql:

```bash
psql "postgresql://well2day@well2day-postgresqldatabase:Adscape@2k25@well2day-postgresqldatabase.postgres.database.azure.com:5432/postgres?sslmode=require"
```

### Option 3: Check Prisma Connection
Run the test script:
```bash
node test-db-connection.js
```

## Next Steps
1. Check Azure Portal for firewall rules
2. Verify database server is running
3. Test network connectivity
4. Update DATABASE_URL if needed
5. Contact Azure support if the issue persists




