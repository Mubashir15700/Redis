import express from 'express';
import { createClient } from 'redis';
import data from './db.json' assert { type: 'json' };

const app = express();
app.use(express.json());

// Create Redis client
const redisClient = createClient();

const connectRedis = async () => {
    try {
        await redisClient.connect();
        console.log('✅ Connected to Redis');
    } catch (error) {
        console.error('❌ Redis connection failed:', error);
    }
};

// Ensure Redis is connected before handling requests
await connectRedis();

// Middleware to check Redis cache before querying the JSON data
const cacheMiddleware = async (req, res, next) => {
    try {
        const { id } = req.params;
        const cachedData = await redisClient.get(`user:${id}`);

        if (cachedData) {
            console.log('⚡ Cache hit');
            return res.json(JSON.parse(cachedData));
        }

        console.log('🛑 Cache miss');
    } catch (error) {
        console.error('❌ Redis error:', error);
    }

    next();
};

// Route to get user by ID (with caching)
app.get('/users/:id', cacheMiddleware, async (req, res) => {
    console.log('🔍 Searching for user...');

    const user = data.find((user) => user.id === parseInt(req.params.id));

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found, caching result');

    try {
        await redisClient.set(`user:${req.params.id}`, JSON.stringify(user), { EX: 3600 });
    } catch (error) {
        console.error('❌ Failed to cache data:', error);
    }

    res.json(user);
});

// Close Redis connection on shutdown
process.on('SIGINT', async () => {
    console.log('🔻 Closing Redis connection...');
    await redisClient.quit();
    process.exit();
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
