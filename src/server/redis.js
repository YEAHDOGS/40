import { createClient } from 'redis';

// Simple in-memory fallback for Windows or environments without Redis
class InMemoryRedisMock {
    constructor() {
        this.store = new Map();
        console.warn("> Redis connection failed or mocked: Using in-memory fallback (Not suitable for prod)");
    }
    
    async connect() {
        return true;
    }

    async get(key) {
        return this.store.get(key) || null;
    }

    async set(key, value, options = {}) {
        this.store.set(key, value);
        if (options.EX) {
            const ms = options.EX * 1000;
            if (ms < 2147483647) {
                setTimeout(() => this.store.delete(key), ms);
            }
        }
        return 'OK';
    }

    async del(key) {
        const existed = this.store.has(key);
        this.store.delete(key);
        return existed ? 1 : 0;
    }

    // Set commands (used for the per-user session index in auth.js)
    async sadd(key, member) {
        let set = this.store.get(key);
        if (!(set instanceof Set)) {
            set = new Set();
            this.store.set(key, set);
        }
        const had = set.has(member);
        set.add(member);
        return had ? 0 : 1;
    }

    async srem(key, member) {
        const set = this.store.get(key);
        if (!(set instanceof Set)) return 0;
        return set.delete(member) ? 1 : 0;
    }

    async smembers(key) {
        const set = this.store.get(key);
        return set instanceof Set ? [...set] : [];
    }
    
    on(event, handler) {
        // Mock event emitter
    }
}

// Global singleton instance
let redisClient;

export const getRedisClient = async () => {
    if (redisClient) return redisClient;

    try {
        const client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                connectTimeout: 1000, // 1 second connect timeout
                reconnectStrategy: (retries) => {
                    // Retry once, then fail fast and use in-memory fallback
                    if (retries >= 1) {
                        return false; 
                    }
                    return 100; // retry after 100ms
                }
            }
        });

        client.on('error', (err) => {
            // Suppress unhandled redis connection errors so the server doesn't crash
        });

        await client.connect();
        
        // If successful, use the real redis client
        redisClient = client;
        console.log("> Connected to Redis Cache Successfully");
    } catch (err) {
        // Fallback to memory
        redisClient = new InMemoryRedisMock();
    }
    
    return redisClient;
};
