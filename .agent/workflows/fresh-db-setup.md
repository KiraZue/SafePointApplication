---
description: How to setup a fresh database for the client
---

# Fresh Database Setup Guide

Follow these steps to initialize a clean database for your client.

## Option 1: Create a Different Local Database
If you just want a clean start on your local machine:
1. Open `backend/.env`.
2. Change the database name at the end of the `MONGO_URI`.
   - Current: `mongodb://localhost:27017/emergency-app`
   - New: `mongodb://localhost:27017/safepoint-v1`
3. Restart the backend (`npm run dev`). 
4. The system will automatically:
   - Create the new database.
   - Run the seeder to create a fresh Admin account.

## Option 2: Set up a Production Database (MongoDB Atlas)
For a real client deployment, it is best to use the Cloud:
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a Free Cluster (Shared).
3. Under **Network Access**, add `0.0.0.0/0` (Allow access from anywhere).
4. Under **Database Access**, create a user (e.g., `client_admin`).
5. Click **Connect** -> **Connect your application** and copy the Connection String.
6. Update `backend/.env`:
   ```bash
   MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/safepoint-db
   ```
7. Restart the backend.

## 🔑 Initial Admin Credentials
Once the fresh DB is connected, use these default credentials to log in for the first time:
- **UserCode**: `ADMIN01`
- **Password**: `password123`
- **Role**: `Admin`

> [!NOTE]
> You should change this password immediately after the first login via the Admin Dashboard.
