<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useAuth, useUser } from '@fortressauth/vue-sdk';

type Credentials = { email: string; password: string };

const { user, loading, error } = useUser();
const { signUp, signIn, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();

const signup = reactive<Credentials>({ email: '', password: '' });
const signin = reactive<Credentials>({ email: '', password: '' });
const verifyToken = ref('');
const resetEmail = ref('');
const resetToken = ref('');
const newPassword = ref('');
const message = ref<string | null>(null);

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    verifyToken.value = token;
    void handleVerify(token);
  }
});

async function handleVerify(tokenValue?: string) {
  const token = tokenValue ?? verifyToken.value;
  if (!token) return;
  const res = await verifyEmail(token);
  message.value = res.success ? 'Email verified. You can now sign in.' : res.error ?? 'Verification failed';
}

async function handleSignup() {
  const res = await signUp(signup.email, signup.password);
  message.value = res.success ? 'Signed up. Check your email for verification.' : res.error ?? 'Sign up failed';
}

async function handleSignin() {
  const res = await signIn(signin.email, signin.password);
  message.value = res.success ? 'Signed in.' : res.error ?? 'Sign in failed';
}

async function handleRequestReset() {
  const res = await requestPasswordReset(resetEmail.value);
  message.value = res.success ? 'Password reset email sent.' : res.error ?? 'Request failed';
}

async function handleResetPassword() {
  const res = await resetPassword(resetToken.value, newPassword.value);
  message.value = res.success ? 'Password reset. You can sign in.' : res.error ?? 'Reset failed';
}
</script>

<template>
  <div>
    <h1>FortressAuth Vue Demo</h1>
    <p class="muted">Simple flows for signup, login, verification, and password reset.</p>

    <div v-if="message" class="message">{{ message }}</div>
    <div v-if="error" class="message">Last error: {{ error }}</div>

    <div class="card">
      <h3>Session</h3>
      <p v-if="loading" class="muted">Loading session...</p>
      <div v-else-if="user">
        <p>
          Signed in as <strong>{{ user.email }}</strong> ({{ user.emailVerified ? 'verified' : 'unverified' }})
        </p>
        <p class="muted">User ID: {{ user.id }}</p>
        <button @click="signOut().then(() => (message = 'Signed out.'))">Sign out</button>
      </div>
      <p v-else class="muted">Not signed in.</p>
    </div>

    <div class="stack">
      <div class="card">
        <h3>Sign up</h3>
        <form @submit.prevent="handleSignup">
          <input v-model="signup.email" placeholder="Email" type="email" required />
          <input v-model="signup.password" placeholder="Password" type="password" required />
          <button type="submit">Create account</button>
          <p class="muted">A verification email will be sent.</p>
        </form>
      </div>

      <div class="card">
        <h3>Sign in</h3>
        <form @submit.prevent="handleSignin">
          <input v-model="signin.email" placeholder="Email" type="email" required />
          <input v-model="signin.password" placeholder="Password" type="password" required />
          <button type="submit">Sign in</button>
        </form>
      </div>

      <div class="card">
        <h3>Email verification</h3>
        <form @submit.prevent="handleVerify()">
          <input v-model="verifyToken" placeholder="Token from email" />
          <button type="submit">Verify email</button>
          <p class="muted">Token format: selector:verifier</p>
        </form>
      </div>

      <div class="card">
        <h3>Password reset</h3>
        <form @submit.prevent="handleRequestReset">
          <input v-model="resetEmail" placeholder="Email" type="email" required />
          <button type="submit">Request reset</button>
        </form>
        <hr />
        <form @submit.prevent="handleResetPassword">
          <input v-model="resetToken" placeholder="Reset token" required />
          <input v-model="newPassword" placeholder="New password" type="password" required />
          <button type="submit">Set new password</button>
        </form>
      </div>
    </div>
  </div>
</template>
