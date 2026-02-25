import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.SPARKY_FITNESS_DB_HOST || 'localhost',
  port: parseInt(process.env.SPARKY_FITNESS_DB_PORT || '5433'),
  database: process.env.SPARKY_FITNESS_DB_NAME || 'sparkyfitness_db',
  user: process.env.SPARKY_FITNESS_DB_USER || 'sparky',
  password: process.env.SPARKY_FITNESS_DB_PASSWORD || 'password',
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const poolInstance = pool; // Exporting raw pool to allow manual close in tests

export const getClient = () => pool.connect();
