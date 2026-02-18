const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        const users = await User.find({ pushToken: { $exists: true, $ne: '' } });
        console.log(`Found ${users.length} users with push tokens:`);
        users.forEach(u => {
            console.log(`- ${u.firstName} ${u.lastName} (${u.role}): ${u.pushToken}`);
        });
        process.exit(0);
    })
    .catch(err => {
        console.error('Connection error:', err);
        process.exit(1);
    });
