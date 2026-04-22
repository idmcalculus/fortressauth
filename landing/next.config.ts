import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { requireAuthApiOrigin } from './src/lib/api-config';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const authApiOrigin = requireAuthApiOrigin(process.env);
const isDevelopment = process.env.NODE_ENV !== 'production';

interface WebpackRule {
  test?: { test?: (ext: string) => boolean };
  issuer?: unknown;
  resourceQuery?: { not?: unknown[] };
  exclude?: RegExp;
}

const nextConfig: NextConfig = {
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_AUTH_API_URL: authApiOrigin,
  },
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
    const rules = [
      {
        source: '/auth/:path*',
        destination: `${authApiOrigin}/auth/:path*`,
      },
    ];

    // Local demo proxying is only needed for development.
    if (isDevelopment) {
      rules.push(
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
      );
    }

    return rules;
  },
};

export default withNextIntl(nextConfig);
