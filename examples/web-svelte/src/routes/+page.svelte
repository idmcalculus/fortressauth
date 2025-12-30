<script lang="ts">
  import { createAuthStore } from "@fortressauth/svelte-sdk";

  const auth = createAuthStore({ baseUrl: "" });
  // biome-ignore lint/correctness/noUnusedVariables: Used in template
  const { user, loading, error } = auth;

  let mode: "signin" | "signup" = $state("signin");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  // biome-ignore lint/correctness/noUnusedVariables: Used in template
  let formError = $state("");
  // biome-ignore lint/correctness/noUnusedVariables: Used in template
  async function handleSubmit() {
    formError = "";

    if (mode === "signup") {
      if (password !== confirmPassword) {
        formError = "Passwords do not match";
        return;
      }
      await auth.signUp(email, password);
    } else {
      await auth.signIn(email, password);
    }
  }
  // biome-ignore lint/correctness/noUnusedVariables: Used in template
  async function handleSignOut() {
    await auth.signOut();
  }
</script>

<div class="container">
  <h1 class="title">🏰 FortressAuth Svelte</h1>

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
    </div>

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

      <button type="submit" class="btn btn-primary">
        {mode === "signin" ? "Sign In" : "Sign Up"}
      </button>
    </form>

    {#if formError}
      <p class="error">{formError}</p>
    {/if}
    {#if $error}
      <p class="error">{$error}</p>
    {/if}
  {/if}
</div>
