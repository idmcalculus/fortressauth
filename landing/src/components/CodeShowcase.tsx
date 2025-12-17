'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
};

export function CodeShowcase() {
	const t = useTranslations('codeShowcase');
	const [activeTab, setActiveTab] = useState<TabKey>('quickStart');

	const tabs: { key: TabKey; label: string }[] = [
		{ key: 'quickStart', label: t('tabs.quickStart') },
		{ key: 'reactSdk', label: t('tabs.reactSdk') },
		{ key: 'vueSdk', label: t('tabs.vueSdk') },
		{ key: 'angularSdk', label: t('tabs.angularSdk') },
		{ key: 'svelteSdk', label: t('tabs.svelteSdk') },
		{ key: 'reactNativeSdk', label: t('tabs.reactNativeSdk') },
		{ key: 'expoSdk', label: t('tabs.expoSdk') },
	];

	return (
		<section className={styles.section}>
			<div className={styles.container}>
				<div className={styles.header}>
					<h2 className={styles.title}>{t('title')}</h2>
					<p className={styles.subtitle}>{t('subtitle')}</p>
				</div>

				<div className={styles.showcase}>
					<div className={styles.tabs}>
						{tabs.map((tab) => (
							<button
								key={tab.key}
								className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
								onClick={() => setActiveTab(tab.key)}
							>
								{tab.label}
							</button>
						))}
					</div>

					<div className={styles.codeContainer}>
						<div className={styles.codeHeader}>
							<span className={styles.dot} style={{ background: '#ff5f56' }} />
							<span className={styles.dot} style={{ background: '#ffbd2e' }} />
							<span className={styles.dot} style={{ background: '#27ca40' }} />
							<span className={styles.filename}>{tabFilenames[activeTab]}</span>
						</div>
						<pre className={styles.code}>
							<code>{codeSnippets[activeTab]}</code>
						</pre>
					</div>

					<div className={styles.features}>
						<div className={styles.feature}>
							<span className={styles.featureIcon}>⚡</span>
							<span>{t('features.fast')}</span>
						</div>
						<div className={styles.feature}>
							<span className={styles.featureIcon}>🔒</span>
							<span>{t('features.secure')}</span>
						</div>
						<div className={styles.feature}>
							<span className={styles.featureIcon}>🎯</span>
							<span>{t('features.typed')}</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

