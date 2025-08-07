/**
 * Jest test setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.SOURCE_URL = 'https://example.com/events';
process.env.DEFAULT_TIMEZONE = 'America/New_York';
process.env.CACHE_ENABLED = 'false';

// Mock console methods to reduce noise in tests
const _originalConsole = console;
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Global test timeout
jest.setTimeout(10000);