# FortressAuth Landing Page

A modern, theme-aware landing page for FortressAuth built with Next.js 15 and internationalization support.

## Features

- 🌍 **Internationalization**: Support for 11 languages (English, Spanish, French, German, Chinese, Japanese, Portuguese, Russian, Arabic, Hindi, and Yoruba)
- 🎨 **Theme Support**: Light and dark mode with smooth transitions
- 📱 **Responsive Design**: Mobile-first approach with beautiful layouts
- ⚡ **Performance**: Built with Next.js 15 and Turbopack
- 🎯 **Modern UI**: Glassmorphism design with fortress-themed colors
- 🔒 **Security-First**: Showcases FortressAuth's security features

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + CSS Modules
- **Icons**: Lucide React + React Icons
- **i18n**: next-intl
- **Fonts**: JetBrains Mono (headings) + Inter (body)

## Getting Started

### Development

```bash
AUTH_API_URL=http://localhost:5000
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page.

If `AUTH_API_URL` points at a local loopback address, `pnpm dev` treats that port as the preferred starting point. When `5000` is busy, the landing dev launcher picks the next free local API port, injects that resolved origin into Next.js and the demo apps, and starts the server in strict mode so it cannot silently drift to a different port.

### Build

```bash
pnpm build
pnpm start
```

## Deployment

FortressAuth's clean production setup is:

- `landing/` on Netlify at `https://fortressauth.com`
- `https://www.fortressauth.com` redirects to the apex domain
- API on its own domain, for example `https://api.fortressauth.com`
- Each web demo deployed separately on its own root-domain deployment:
  - `https://react-demo.fortressauth.com`
  - `https://vue-demo.fortressauth.com`
  - `https://svelte-demo.fortressauth.com`
  - `https://angular-demo.fortressauth.com`

This keeps the landing app simple and avoids depending on same-domain path mounting in production.

Netlify deploy previews remain enabled for `landing`, but they are treated as UI/docs previews only. Do not rely on preview deployments for end-to-end auth verification flows until a staging API exists. Production demo links should stay pointed at the stable demo subdomains above, even in preview builds. Demo deploy previews are disabled because unstable preview origins should not be valid auth origins.

### API origin configuration

```bash
AUTH_API_URL=https://api.fortressauth.com/
```

`AUTH_API_URL` is required in every environment. Landing refuses to start if it is missing or not an absolute `http(s)` URL.

- `/auth/*` rewrites
- the internal proxy route
- the docs panel URL

For local development, point it at the local server started by the landing dev stack:

```bash
AUTH_API_URL=http://localhost:5000/
```

You can put that in `landing/.env.local`; the landing startup check now loads the same local env files that Next.js uses.

That value is the preferred local starting port, not a hard requirement. If `5000` is occupied, `landing dev` will move the local API to the next free port and keep the landing app, docs iframe, proxy route, and demo apps aligned with that resolved origin.

### API docs panel

By default, the docs panel uses:

```bash
$AUTH_API_URL/docs
```

The landing page embeds the docs through its own `/api/proxy/docs/` route so the iframe and health check stay same-origin in local and production environments. In production, the "Open in new tab" link still points at the real API docs URL derived from `AUTH_API_URL` unless you override it.

Override that only if you need a different deployed docs origin:

```bash
NEXT_PUBLIC_DOCS_URL=https://api.fortressauth.com/docs
```

### Demo link environment variables

For separate demo deployments, set absolute URLs:

```bash
NEXT_PUBLIC_REACT_DEMO_URL=https://react-demo.fortressauth.com
NEXT_PUBLIC_VUE_DEMO_URL=https://vue-demo.fortressauth.com
NEXT_PUBLIC_SVELTE_DEMO_URL=https://svelte-demo.fortressauth.com
NEXT_PUBLIC_ANGULAR_DEMO_URL=https://angular-demo.fortressauth.com
```

Only use relative paths such as `/react-demo` when production hosting really serves those paths on the same domain.

When a production demo URL is not configured, the landing page now hides that demo link instead of shipping a broken relative URL.

### Netlify and IaC ownership

- Netlify's GitHub integration is the primary deployment path for landing previews and production releases.
- `landing/netlify.toml` defines the landing build command, publish directory, and `www` to apex redirect.
- `packages/infra-netlify` manages existing Netlify site build settings, custom domains, deploy preview flags, and project environment variables with Pulumi.
- GitHub Actions is used for IaC preview/apply and for post-deploy production smoke checks, not for uploading frontend artifacts to Netlify.

## Project Structure

```
landing/
├── src/
│   ├── app/
│   │   ├── [locale]/          # Internationalized routes
│   │   │   ├── layout.tsx     # Root layout with i18n
│   │   │   └── page.tsx       # Home page
│   │   └── globals.css        # Global styles and design tokens
│   ├── components/
│   │   ├── Navigation.tsx     # Header with theme toggle
│   │   ├── Hero.tsx           # Hero section
│   │   ├── Features.tsx       # Features grid
│   │   └── ThemeProvider.tsx  # Theme context
│   ├── assets/
│   │   └── logo.svg           # FortressAuth logo
│   ├── i18n/
│   │   ├── routing.ts         # i18n routing config
│   │   └── request.ts         # i18n request config
│   └── middleware.ts          # Next.js middleware for i18n
├── messages/                  # Translation files
│   ├── en.json
│   ├── es.json
│   ├── yo.json
│   └── ... (other languages)
└── public/                    # Static assets
```

## Supported Languages

1. **en** - English
2. **es** - Spanish (Español)
3. **fr** - French (Français)
4. **de** - German (Deutsch)
5. **zh** - Chinese (中文)
6. **ja** - Japanese (日本語)
7. **pt** - Portuguese (Português)
8. **ru** - Russian (Русский)
9. **ar** - Arabic (العربية)
10. **hi** - Hindi (हिन्दी)
11. **yo** - Yoruba

## Design System

### Colors

The color palette is inspired by the FortressAuth logo:

- **Primary**: Dark blues (#1e3a5f, #0d1b2a, #3d5a80)
- **Accent**: Teal/Cyan (#4ecdc4, #44a08d)
- **Background**: Adaptive light/dark backgrounds
- **Text**: High contrast for accessibility

### Typography

- **Headings**: JetBrains Mono (developer-focused monospace)
- **Body**: Inter (modern, professional sans-serif)

### Components

- **Navigation**: Sticky header with mobile menu and theme toggle
- **Hero**: Full-viewport hero with animated background
- **Features**: Glassmorphic cards with hover effects
- **Responsive**: Mobile-first with smooth breakpoints

## Adding New Languages

1. Create a new JSON file in `messages/` (e.g., `messages/it.json`)
2. Copy the structure from `messages/en.json`
3. Translate all strings
4. Add the locale code to `src/i18n/routing.ts`:
   ```typescript
   locales: ['en', 'es', ..., 'it']
   ```
5. Update the middleware matcher in `src/middleware.ts`

## Customization

### Theme Colors

Edit CSS variables in `src/app/globals.css`:

```css
:root {
  --color-primary: #1e3a5f;
  --color-accent: #4ecdc4;
  /* ... */
}
```

### Fonts

Update font imports in `src/app/[locale]/layout.tsx` and CSS variables in `globals.css`.

## License

MIT
