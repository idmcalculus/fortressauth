import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

interface WebpackRule {
  test?: { test?: (ext: string) => boolean };
  issuer?: unknown;
  resourceQuery?: { not?: unknown[] };
  exclude?: RegExp;
}

const nextConfig: NextConfig = {
  trailingSlash: true,
  webpack(config) {
    const fileLoaderRule = config.module.rules.find((rule: WebpackRule) =>
      rule.test?.test?.('.svg'),
    );

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
      // Auth requests go through the dynamic proxy
      {
        source: '/auth/:path*',
        destination: '/api/proxy/auth/:path*',
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
