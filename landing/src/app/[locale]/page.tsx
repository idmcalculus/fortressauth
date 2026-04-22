import { CodeShowcase } from '@/components/CodeShowcase';
import { Documentation } from '@/components/Documentation';
import { ExamplesShowcase } from '@/components/ExamplesShowcase';
import { Features } from '@/components/Features';
import { Footer } from '@/components/Footer';
import { GlobalBackground } from '@/components/GlobalBackground';
import { Hero } from '@/components/Hero';
import { Navigation } from '@/components/Navigation';
import { getDocumentationUrl } from '@/lib/api-config';

export default function HomePage() {
  const externalDocsUrl =
    process.env.NODE_ENV === 'production'
      ? (getDocumentationUrl(process.env) ?? '/api/proxy/docs/')
      : '/api/proxy/docs/';

  return (
    <GlobalBackground>
      <Navigation />
      <main>
        <Hero />
        <Features />
        <CodeShowcase />
        <ExamplesShowcase />
        <Documentation externalDocsUrl={externalDocsUrl} />
      </main>
      <Footer />
    </GlobalBackground>
  );
}
