<script setup lang="ts">
import { useAuth, useUser } from '@fortressauth/vue-sdk';
import { ref } from 'vue';

const { user, loading, error } = useUser();
const { signUp, signIn, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();

const mode = ref<'signin' | 'signup' | 'verify' | 'reset'>('signin');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const token = ref('');
const message = ref('');
const showResetOverlay = ref(false);

async function handleSubmit() {
  message.value = '';
  if (mode.value === 'signup') {
    if (password.value !== confirmPassword.value) {
      message.value = 'Passwords do not match';
      return;
    }
    const res = await signUp(email.value, password.value);
    if (res.success) message.value = 'Verification email sent!';
  } else if (mode.value === 'signin') {
    await signIn(email.value, password.value);
  } else if (mode.value === 'verify') {
    const res = await verifyEmail(token.value);
    if (res.success) {
      message.value = 'Email verified! You can now sign in.';
      mode.value = 'signin';
    }
  } else if (mode.value === 'reset') {
    if (password.value !== confirmPassword.value) {
      message.value = 'Passwords do not match';
      return;
    }
    const res = await resetPassword(token.value, password.value);
    if (res.success) {
      message.value = 'Password reset successful. Please sign in.';
      mode.value = 'signin';
    }
  }
}

async function handleRequestReset() {
  const res = await requestPasswordReset(email.value);
  if (res.success) {
    message.value = 'Password reset email sent.';
    showResetOverlay.value = false;
  }
}
</script>

<template>
  <div class="container">
    <div class="header">
      <img src="/vue-demo/logo.svg" alt="FortressAuth Logo" class="logo" />
      <h1 class="title">FortressAuth Vue</h1>
    </div>

    <div v-if="loading" class="loading">Loading session...</div>
    <div v-else-if="user" class="success">
      <p>Welcome, <span class="user-email">{{ user.email }}</span>!</p>
      <p style="margin: 1rem 0; color: #a0aec0;">
        Email verified: {{ user.emailVerified ? '✅ Yes' : '❌ No' }}
      </p>
      <button class="btn btn-secondary" @click="signOut()">Sign Out</button>
    </div>
    <div v-else>
      <div class="tabs">
        <button :class="['tab', { active: mode === 'signin' }]" @click="mode = 'signin'">Sign In</button>
        <button :class="['tab', { active: mode === 'signup' }]" @click="mode = 'signup'">Sign Up</button>
        <button :class="['tab', { active: mode === 'verify' }]" @click="mode = 'verify'">Verify</button>
        <button :class="['tab', { active: mode === 'reset' }]" @click="mode = 'reset'">Reset</button>
      </div>

      <form @submit.prevent="handleSubmit">
        <template v-if="mode === 'signin' || mode === 'signup'">
          <div class="form-group">
            <label>Email</label>
            <input v-model="email" type="email" placeholder="your@email.com" required />
          </div>
        </template>

        <template v-if="mode === 'reset'">
          <div class="form-group">
            <label>Reset Token</label>
            <input v-model="token" type="text" placeholder="selector:verifier" required />
          </div>
        </template>

        <template v-if="mode === 'verify'">
          <div class="form-group">
            <label>Verification Token</label>
            <input v-model="token" type="text" placeholder="selector:verifier" required />
          </div>
        </template>

        <template v-if="mode === 'signin' || mode === 'signup' || mode === 'reset'">
          <div class="form-group">
            <label>{{ mode === 'reset' ? 'New Password' : 'Password' }}</label>
            <input v-model="password" type="password" placeholder="••••••••" required />
          </div>
        </template>

        <template v-if="mode === 'signup' || mode === 'reset'">
          <div class="form-group">
            <label>Confirm Password</label>
            <input v-model="confirmPassword" type="password" placeholder="••••••••" required />
          </div>
        </template>

        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : mode === 'verify' ? 'Verify Email' : 'Reset Password' }}
        </button>

        <div v-if="mode === 'signin'" class="forgot-password">
          <a href="#" @click.prevent="showResetOverlay = true">Forgot password?</a>
        </div>
      </form>

      <div v-if="showResetOverlay" class="overlay">
        <div class="modal">
          <h3>Reset Password</h3>
          <p class="muted">Enter your email to receive a reset link.</p>
          <div class="form-group">
            <label>Email</label>
            <input v-model="email" type="email" placeholder="your@email.com" />
          </div>
          <button class="btn btn-primary" @click="handleRequestReset">Send Reset Link</button>
          <button class="btn btn-secondary" @click="showResetOverlay = false">Cancel</button>
        </div>
      </div>

      <div v-if="error" class="error">{{ error }}</div>
      <div v-if="message" class="message">{{ message }}</div>
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Inter", sans-serif;
  background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f8f9fa;
}
.container {
  max-width: 800px;
  width: 100%;
  padding: 2.5rem;
  margin: 1rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.header { display: flex; flex-direction: column; align-items: center; margin-bottom: 2rem; }
.logo { width: 64px; height: 64px; margin-bottom: 1rem; }
.title { font-size: 1.5rem; font-weight: 600; text-align: center; color: #f8f9fa; }
.form-group { margin-bottom: 1rem; }
label { display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #a0aec0; }
input {
  width: 100%; padding: 0.75rem 1rem; border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: #f8f9fa; font-size: 1rem;
}
input:focus { outline: none; border-color: #4ecdc4; }
.btn { width: 100%; padding: 0.75rem 1rem; border: none; border-radius: 8px; font-size: 1rem; font-weight: 500; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.btn-primary { background: linear-gradient(135deg, #4ecdc4, #44a08d); color: white; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3); }
.btn-secondary { background: rgba(255, 255, 255, 0.1); color: #f8f9fa; border: 1px solid rgba(255, 255, 255, 0.2); margin-top: 0.5rem; }
.btn-secondary:hover { background: rgba(255, 255, 255, 0.2); }
.error { color: #fc8181; font-size: 0.875rem; margin-top: 1rem; text-align: center; }
.message { color: #4ecdc4; font-size: 0.875rem; margin-top: 1rem; text-align: center; }
.success { text-align: center; }
.user-email { color: #4ecdc4; font-weight: 500; }
.loading { text-align: center; padding: 2rem; }
.tabs { 
  display: flex; 
  margin-bottom: 1.5rem; 
  border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
  gap: 0.5rem;
}
.tab { 
  flex: 1; 
  padding: 0.75rem 1rem; 
  background: transparent; 
  border: none; 
  color: #a0aec0; 
  font-size: 0.9rem; 
  cursor: pointer; 
  transition: color 0.2s; 
  white-space: nowrap;
}
.tab:hover { color: #f8f9fa; }
.tab.active { color: #4ecdc4; border-bottom: 2px solid #4ecdc4; }

/* Responsive styles */
@media (max-width: 600px) {
  body { padding: 0.5rem; }
  .container { max-width: 100%; padding: 1.5rem; margin: 0.5rem; border-radius: 12px; }
  .header { margin-bottom: 1.5rem; }
  .logo { width: 48px; height: 48px; }
  .title { font-size: 1.25rem; }
  .tabs { flex-wrap: wrap; gap: 0.25rem; }
  .tab { padding: 0.5rem; font-size: 0.75rem; }
  .btn { padding: 0.875rem 1rem; }
  .modal { padding: 1.5rem; width: 95%; }
}
.forgot-password { margin-top: 1rem; text-align: center; }
.forgot-password a { color: #a0aec0; font-size: 0.875rem; text-decoration: none; cursor: pointer; }
.forgot-password a:hover { color: #4ecdc4; }
.overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(5px); }
.modal { background: #1e3a5f; padding: 2.5rem; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); max-width: 400px; width: 90%; }
.modal h3 { margin-bottom: 1rem; color: #f8f9fa; }
.modal .muted { margin-bottom: 1.5rem; color: #a0aec0; font-size: 0.875rem; }
.modal .btn-secondary { margin-top: 1rem; }
</style>
