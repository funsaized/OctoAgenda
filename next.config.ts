import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk', 'cheerio', 'ical-generator', 'node-fetch'],
};

export default nextConfig;
