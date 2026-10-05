import pg from 'pg';
const c = new pg.Client(process.env.DATABASE_URL); await c.connect();
for (const q of process.argv.slice(2)) { const r = await c.query(q); console.log(JSON.stringify(r.rows)); }
await c.end();
