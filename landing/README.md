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
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page.

### Build

```bash
pnpm build
pnpm start
```

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