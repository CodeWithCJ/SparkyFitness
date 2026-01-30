// Test environment configuration
process.env.NODE_ENV = 'test';

// Mock environment variables to prevent loading real .env file
process.env.SPARKY_FITNESS_DB_USER = 'test_user';
process.env.SPARKY_FITNESS_DB_HOST = 'localhost';
process.env.SPARKY_FITNESS_DB_NAME = 'test_db';
process.env.SPARKY_FITNESS_DB_PASSWORD = 'test_password';
process.env.SPARKY_FITNESS_DB_PORT = '5432';
process.env.SPARKY_FITNESS_APP_DB_USER = 'test_app_user';
process.env.SPARKY_FITNESS_APP_DB_PASSWORD = 'test_app_password';
process.env.ENCRYPTION_KEY = 'test-encryption-key';

// Global test timeout
jest.setTimeout(10000);
