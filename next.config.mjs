// On Vercel the site's own address is known at build time, so APP_URL need not be set by hand.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  env: {
    APP_URL: process.env.APP_URL || (vercelUrl ? `https://${vercelUrl}` : ""),
  },
};
