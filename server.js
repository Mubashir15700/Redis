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

// Route to get user by ID (using simple key-value caching)
app.get('/users/:id', cacheMiddleware, async (req, res) => {
    console.log('🔍 Searching for user...');

    const { id } = req.params;
    const user = data.find((user) => user.id === parseInt(id));

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found, caching result');

    try {
        await redisClient.set(`user:${id}`, JSON.stringify(user), { EX: 3600 });
    } catch (error) {
        console.error('❌ Failed to cache data:', error);
    }

    res.json(user);
});

// Route to store and retrieve user data using Redis Hashes
app.get('/users/hash/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { field } = req.query; // Optional query param

        const hashKey = `user_hash:${id}`; // Use key for Hashes

        // Check Redis key type before accessing
        const keyType = await redisClient.type(hashKey);
        if (keyType && keyType !== 'hash') {
            console.log('❌ Wrong Redis key type, deleting...');
            await redisClient.del(hashKey); // Remove invalid type key
        }

        // Check if user exists in Redis Hash
        const exists = await redisClient.exists(hashKey);

        if (exists) {
            console.log('⚡ Hash Cache hit');

            // Retrieve a specific field if 'field' query exists
            if (field) {
                const value = await redisClient.hGet(hashKey, field);
                return value
                    ? res.json({ [field]: value })
                    : res.status(404).json({ message: `Field '${field}' not found` });
            }

            // Get full user data from Redis Hash
            const user = await redisClient.hGetAll(hashKey);
            return res.json(user);
        }

        console.log('🛑 Hash Cache miss, fetching from DB');

        // Fetch from JSON DB
        const user = data.find((user) => user.id === parseInt(id));

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Store user in Redis Hash
        await redisClient.hSet(hashKey, user);
        await redisClient.expire(hashKey, 3600); // Set expiration time

        res.json(user);
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Close Redis connection on shutdown
process.on('SIGINT', async () => {
    console.log('🔻 Closing Redis connection...');
    await redisClient.quit();
    process.exit();
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
