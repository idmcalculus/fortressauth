import { Navigation } from '@/components/Navigation';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { ExamplesShowcase } from '@/components/ExamplesShowcase';
import { CodeShowcase } from '@/components/CodeShowcase';
import { Documentation } from '@/components/Documentation';

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