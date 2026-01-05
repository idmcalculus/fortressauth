'use client';

import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './CodeShowcase.module.css';

const codeSnippets = {
  quickStart: `import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
import { SqlAdapter } from '@fortressauth/adapter-sql';

// Initialize FortressAuth in 5 lines
const fortress = new FortressAuth({
  repository: new SqlAdapter(db, { dialect: 'sqlite' }),
  rateLimiter: new MemoryRateLimiter(),
});

// Sign up a user
const result = await fortress.signUp({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

if (result.success) {
  console.log('User created:', result.data.user);
}`,

  reactSdk: `import { useAuth, useUser } from '@fortressauth/react-sdk';

function LoginForm() {
  const { signIn, signOut } = useAuth();
  const { user, loading } = useUser();

  if (loading) return <p>Loading...</p>;

  if (user) {
    return (
      <div>
        <p>Welcome, {user.email}!</p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    );
  }

  return (
    <button onClick={() => signIn('user@example.com', 'password')}>
      Sign In
    </button>
  );
}`,

  vueSdk: `<script setup lang="ts">
import { useAuth, useUser } from '@fortressauth/vue-sdk';

const { user, loading } = useUser();
const { signIn, signOut } = useAuth();
</script>

<template>
  <p v-if="loading">Loading...</p>
  <div v-else-if="user">
    <p>Welcome, {{ user.email }}!</p>
    <button @click="signOut()">Sign Out</button>
  </div>
  <button v-else @click="signIn('email', 'pass')">Sign In</button>
</template>`,

  angularSdk: `import { Component, inject } from '@angular/core';
import { AuthService } from '@fortressauth/angular-sdk';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AsyncPipe],
  template: \`
    @if (auth.loading$ | async) { <p>Loading...</p> }
    @else if (auth.user$ | async; as user) {
      <p>Welcome, {{ user.email }}!</p>
      <button (click)="auth.signOut()">Sign Out</button>
    } @else {
      <button (click)="signIn()">Sign In</button>
    }
  \`
})
export class LoginComponent {
  auth = inject(AuthService);
  signIn() { this.auth.signIn('email', 'pass'); }
}`,

  svelteSdk: `<script lang="ts">
import { createAuthStore } from '@fortressauth/svelte-sdk';

const auth = createAuthStore();
const { user, loading } = auth;
</script>

{#if $loading}
  <p>Loading...</p>
{:else if $user}
  <p>Welcome, {$user.email}!</p>
  <button on:click={() => auth.signOut()}>Sign Out</button>
{:else}
  <button on:click={() => auth.signIn('email', 'pass')}>
    Sign In
  </button>
{/if}`,

  reactNativeSdk: `import { AuthProvider, useAuth, useUser } from '@fortressauth/react-native-sdk';
import { View, Text, Button } from 'react-native';

export default function App() {
  return (
    <AuthProvider baseUrl="http://your-api.com">
      <LoginScreen />
    </AuthProvider>
  );
}

function LoginScreen() {
  const { signIn, signOut } = useAuth();
  const { user, loading } = useUser();

  if (loading) return <Text>Loading...</Text>;

  return (
    <View>
      {user ? (
        <><Text>Welcome, {user.email}!</Text>
          <Button title="Sign Out" onPress={() => signOut()} />
        </>
      ) : (
        <Button title="Sign In" onPress={() => signIn('email', 'pass')} />
      )}
    </View>
  );
}`,

  expoSdk: `import { AuthProvider, useAuth, useUser } from '@fortressauth/expo-sdk';
import { View, Text, Button } from 'react-native';

// Expo SDK uses SecureStore for encrypted token storage
export default function App() {
  return (
    <AuthProvider baseUrl="http://your-api.com">
      <LoginScreen />
    </AuthProvider>
  );
}

function LoginScreen() {
  const { signIn, signOut } = useAuth();
  const { user, loading } = useUser();

  if (loading) return <Text>Loading...</Text>;

  return user ? (
    <View>
      <Text>Welcome, {user.email}!</Text>
      <Button title="Sign Out" onPress={() => signOut()} />
    </View>
  ) : (
    <Button title="Sign In" onPress={() => signIn('email', 'pass')} />
  );
}`,

  electronSdk: `import { createAuth } from '@fortressauth/electron-sdk';

// Create auth client with electron-store persistence
const auth = createAuth({ baseUrl: 'http://your-api.com' });

// Subscribe to auth state changes
auth.subscribe((state) => {
  if (state.loading) {
    console.log('Loading...');
  } else if (state.user) {
    console.log('Welcome,', state.user.email);
  } else {
    console.log('Not signed in');
  }
});

// Sign in
await auth.signIn('user@example.com', 'password');

// Sign out
await auth.signOut();`,
};

type TabKey = keyof typeof codeSnippets;

const tabFilenames: Record<TabKey, string> = {
  quickStart: 'server.ts',
  reactSdk: 'LoginForm.tsx',
  vueSdk: 'LoginForm.vue',
  angularSdk: 'login.component.ts',
  svelteSdk: 'Login.svelte',
  reactNativeSdk: 'App.tsx',
  expoSdk: 'App.tsx',
  electronSdk: 'main.ts',
};

export function CodeShowcase() {
  const t = useTranslations('codeShowcase');
  const [activeTab, setActiveTab] = useState<TabKey>('quickStart');
  const [copied, setCopied] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollHintLeft, setShowScrollHintLeft] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'quickStart', label: t('tabs.quickStart') },
    { key: 'reactSdk', label: t('tabs.reactSdk') },
    { key: 'vueSdk', label: t('tabs.vueSdk') },
    { key: 'angularSdk', label: t('tabs.angularSdk') },
    { key: 'svelteSdk', label: t('tabs.svelteSdk') },
    { key: 'reactNativeSdk', label: t('tabs.reactNativeSdk') },
    { key: 'expoSdk', label: t('tabs.expoSdk') },
    { key: 'electronSdk', label: t('tabs.electronSdk') },
  ];

  // Check if tabs are scrollable and update hint visibility
  useEffect(() => {
    const checkScrollable = () => {
      if (tabsRef.current) {
        const { scrollWidth, clientWidth, scrollLeft } = tabsRef.current;
        const isScrollable = scrollWidth > clientWidth;
        const isNotAtEnd = scrollLeft < scrollWidth - clientWidth - 10;
        const isNotAtStart = scrollLeft > 10;
        setShowScrollHint(isScrollable && isNotAtEnd);
        setShowScrollHintLeft(isScrollable && isNotAtStart);
      }
    };

    checkScrollable();
    window.addEventListener('resize', checkScrollable);

    const tabsElement = tabsRef.current;
    if (tabsElement) {
      tabsElement.addEventListener('scroll', checkScrollable);
    }

    return () => {
      window.removeEventListener('resize', checkScrollable);
      if (tabsElement) {
        tabsElement.removeEventListener('scroll', checkScrollable);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await (navigator as Navigator).clipboard.writeText(codeSnippets[activeTab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available - silently fail
    }
  }, [activeTab]);

  return (
    <section id="examples" className={styles.section} aria-labelledby="code-showcase-title">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 id="code-showcase-title" className={styles.title}>
            {t('title')}
          </h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>

        <div className={styles.showcase}>
          <div className={styles.tabsWrapper}>
            <div
              className={`${styles.scrollHint} ${styles.scrollHintLeft} ${showScrollHintLeft ? styles.scrollHintVisible : ''}`}
              aria-hidden="true"
            >
              <ChevronLeft className={styles.scrollHintIcon} />
            </div>
            <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label={t('title')}>
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  aria-controls={`tabpanel-${tab.key}`}
                  className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div
              className={`${styles.scrollHint} ${styles.scrollHintRight} ${showScrollHint ? styles.scrollHintVisible : ''}`}
              aria-hidden="true"
            >
              <ChevronRight className={styles.scrollHintIcon} />
            </div>
          </div>

          <div
            id={`tabpanel-${activeTab}`}
            role="tabpanel"
            aria-label={tabs.find((t) => t.key === activeTab)?.label}
            className={styles.codeContainer}
          >
            <div className={styles.codeHeader}>
              <span className={styles.dot} style={{ background: '#ff5f56' }} aria-hidden="true" />
              <span className={styles.dot} style={{ background: '#ffbd2e' }} aria-hidden="true" />
              <span className={styles.dot} style={{ background: '#27ca40' }} aria-hidden="true" />
              <span className={styles.filename}>{tabFilenames[activeTab]}</span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={handleCopy}
                aria-label={copied ? t('copied') : t('copy')}
                title={copied ? t('copied') : t('copy')}
              >
                {copied ? (
                  <Check className={styles.copyIcon} aria-hidden="true" />
                ) : (
                  <Copy className={styles.copyIcon} aria-hidden="true" />
                )}
                <span className={styles.copyText}>{copied ? t('copied') : t('copy')}</span>
              </button>
            </div>
            <pre className={styles.code}>
              <code>{codeSnippets[activeTab]}</code>
            </pre>
          </div>

          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                ⚡
              </span>
              <span>{t('features.fast')}</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                🔒
              </span>
              <span>{t('features.secure')}</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                🎯
              </span>
              <span>{t('features.typed')}</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                🔌
              </span>
              <span>{t('features.pluggable')}</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                📦
              </span>
              <span>{t('features.zeroDeps')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
