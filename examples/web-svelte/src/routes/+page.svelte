<script lang="ts">
  import { createAuthStore } from "@fortressauth/svelte-sdk";

  const auth = createAuthStore({ baseUrl: "http://localhost:5001" });
  const { user, loading, error } = auth;

  let mode: "signin" | "signup" | "verify" | "reset" = $state("signin");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let token = $state("");
  let formError = $state("");
  let message = $state("");
  let showResetOverlay = $state(false);

  async function handleSubmit() {
    formError = "";
    message = "";

    if (mode === "signup") {
      if (password !== confirmPassword) {
        formError = "Passwords do not match";
        return;
      }
      const res = await auth.signUp(email, password);
      if (res.success) message = "Verification email sent!";
    } else {
      await auth.signIn(email, password);
    }
  }

  async function handleVerify() {
    formError = "";
    message = "";
    const res = await auth.verifyEmail(token);
    if (res.success) {
      message = "Email verified! You can now sign in.";
      mode = "signin";
    }
  }

  async function handleRequestReset() {
    formError = "";
    message = "";
    const res = await auth.requestPasswordReset(email);
    if (res.success) {
      message = "Password reset email sent.";
      showResetOverlay = false;
    }
  }

  async function handleReset() {
    formError = "";
    message = "";
    if (password !== confirmPassword) {
      formError = "Passwords do not match";
      return;
    }
    const res = await auth.resetPassword(token, password);
    if (res.success) {
      message = "Password reset successful. Please sign in.";
      mode = "signin";
    }
  }

  async function handleSignOut() {
    await auth.signOut();
  }
</script>

<div class="container">
  <div class="header">
    <img src="/svelte-demo/logo.svg" alt="FortressAuth Logo" class="logo" />
    <h1 class="title">FortressAuth Svelte</h1>
  </div>

  {#if $loading}
    <div class="loading">Loading...</div>
  {:else if $user}
    <div class="success">
      <p>Welcome, <span class="user-email">{$user.email}</span>!</p>
      <p style="margin: 1rem 0; color: #a0aec0;">
        Email verified: {$user.emailVerified ? "✅ Yes" : "❌ No"}
      </p>
      <button class="btn btn-secondary" onclick={handleSignOut}>Sign Out</button
      >
    </div>
  {:else}
    <div class="tabs">
      <button
        class="tab"
        class:active={mode === "signin"}
        onclick={() => (mode = "signin")}>Sign In</button
      >
      <button
        class="tab"
        class:active={mode === "signup"}
        onclick={() => (mode = "signup")}>Sign Up</button
      >
      <button
        class="tab"
        class:active={mode === "verify"}
        onclick={() => (mode = "verify")}>Verify</button
      >
      <button
        class="tab"
        class:active={mode === "reset"}
        onclick={() => (mode = "reset")}>Reset</button
      >
    </div>

    {#if mode === "signin" || mode === "signup"}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            placeholder="your@email.com"
            required
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            bind:value={password}
            placeholder="••••••••"
            required
          />
        </div>

        {#if mode === "signup"}
          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              bind:value={confirmPassword}
              placeholder="••••••••"
              required
            />
          </div>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={$loading}>
          {$loading
            ? "Processing..."
            : mode === "signin"
              ? "Sign In"
              : "Sign Up"}
        </button>

        {#if mode === "signin"}
          <div class="forgot-password">
            <a
              href="javascript:void(0)"
              onclick={() => (showResetOverlay = true)}>Forgot password?</a
            >
          </div>
        {/if}
      </form>
    {:else if mode === "verify"}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleVerify();
        }}
      >
        <div class="form-group">
          <label for="token">Verification Token</label>
          <input
            type="text"
            id="token"
            bind:value={token}
            placeholder="selector:verifier"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" disabled={$loading}>
          {$loading ? "Verifying..." : "Verify Email"}
        </button>
      </form>
    {:else if mode === "reset"}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleReset();
        }}
      >
        <div class="form-group">
          <label for="resetToken">Reset Token</label>
          <input
            type="text"
            id="resetToken"
            bind:value={token}
            placeholder="selector:verifier"
            required
          />
        </div>
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input
            type="password"
            id="newPassword"
            bind:value={password}
            placeholder="••••••••"
            required
          />
        </div>
        <div class="form-group">
          <label for="confirmResetPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmResetPassword"
            bind:value={confirmPassword}
            placeholder="••••••••"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" disabled={$loading}>
          {$loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>
    {/if}

    {#if showResetOverlay}
      <div class="overlay">
        <div class="modal">
          <h3>Reset Password</h3>
          <p class="muted">Enter your email to receive a reset link.</p>
          <div class="form-group">
            <label for="resetEmail">Email</label>
            <input
              type="email"
              id="resetEmail"
              bind:value={email}
              placeholder="your@email.com"
            />
          </div>
          <button class="btn btn-primary" onclick={handleRequestReset}
            >Send Reset Link</button
          >
          <button
            class="btn btn-secondary"
            onclick={() => (showResetOverlay = false)}>Cancel</button
          >
        </div>
      </div>
    {/if}

    {#if formError}
      <p class="error">{formError}</p>
    {/if}
    {#if $error}
      <p class="error">{$error}</p>
    {/if}
    {#if message}
      <p class="message">{message}</p>
    {/if}
  {/if}
</div>
