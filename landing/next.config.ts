import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  trailingSlash: true,
  webpack(config) {
    const fileLoaderRule = config.module.rules.find((rule: any) => rule.test?.test?.('.svg'));

    config.module.rules.push(
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/,
      },
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /url/] },
        use: ['@svgr/webpack'],
      },
    );

    fileLoaderRule.exclude = /\.svg$/i;

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: 'http://localhost:5001/auth/:path*',
      },
      {
        source: '/react-demo',
        destination: 'http://localhost:3001/react-demo/',
      },
      {
        source: '/react-demo/:path*',
        destination: 'http://localhost:3001/react-demo/:path*',
      },
      {
        source: '/vue-demo',
        destination: 'http://localhost:3002/vue-demo/',
      },
      {
        source: '/vue-demo/:path*',
        destination: 'http://localhost:3002/vue-demo/:path*',
      },
      {
        source: '/svelte-demo',
        destination: 'http://localhost:3003/svelte-demo/',
      },
      {
        source: '/svelte-demo/:path*',
        destination: 'http://localhost:3003/svelte-demo/:path*',
      },
      {
        source: '/angular-demo',
        destination: 'http://localhost:3004/angular-demo/',
      },
      {
        source: '/angular-demo/:path*',
        destination: 'http://localhost:3004/angular-demo/:path*',
      },
    ];
  },
};

export default withNextIntl(nextConfig);
