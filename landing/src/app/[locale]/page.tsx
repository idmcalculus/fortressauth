import { CodeShowcase } from '@/components/CodeShowcase';
import { Documentation } from '@/components/Documentation';
import { ExamplesShowcase } from '@/components/ExamplesShowcase';
import { Features } from '@/components/Features';
import { Hero } from '@/components/Hero';
import { Navigation } from '@/components/Navigation';

export default function HomePage() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <Features />
        <CodeShowcase />
        <ExamplesShowcase />
        <Documentation />
      </main>
    </>
  );
}
