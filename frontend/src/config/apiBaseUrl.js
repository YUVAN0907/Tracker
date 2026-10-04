const LOCAL_API_URL = 'http://localhost:3002/api';
const CLOUD_API_URL = 'https://vendbees-inventory-backend-333114755202.asia-south1.run.app/api';
const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const isLocalApiUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(configuredApiUrl);

export const API_BASE_URL = import.meta.env.PROD
    ? (configuredApiUrl && !isLocalApiUrl ? configuredApiUrl : CLOUD_API_URL)
    : (configuredApiUrl || LOCAL_API_URL);