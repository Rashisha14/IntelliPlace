import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function test() {
    console.log('Attempting to connect to Neon DB...');
    try {
        await client.connect();
        console.log('✅ Successfully connected to Neon DB!');
        const res = await client.query('SELECT NOW()');
        console.log('TIMESTAMP:', res.rows[0].now);
        await client.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection error:', err.message);
        process.exit(1);
    }
}

test();
