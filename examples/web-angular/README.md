# FortressAuth Angular Example

A complete Angular 19 example demonstrating FortressAuth integration with the Angular SDK.

## Features

- Sign up with email/password
- Sign in with existing account
- Sign out
- Display user information and email verification status
- Beautiful, modern UI with glassmorphism design

## Getting Started

### Prerequisites

Make sure the FortressAuth server is running:

```bash
# From the monorepo root
pnpm --filter @fortressauth/server dev
```

### Running the Example

```bash
# From the monorepo root
pnpm --filter fortressauth-web-angular dev
```

The app will open at http://localhost:4200

## SDK Usage

### Bootstrap with Auth Config

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AUTH_CONFIG } from '@fortressauth/angular-sdk';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: AUTH_CONFIG, useValue: { baseUrl: 'http://localhost:3001' } }
  ]
});
```

### Using the AuthService

```typescript
import { Component, inject } from '@angular/core';
import { AuthService } from '@fortressauth/angular-sdk';

@Component({...})
export class AppComponent {
  auth = inject(AuthService);

  // Access state
  user = this.auth.currentUser;
  loading = this.auth.isLoading;
  error = this.auth.currentError;

  // Or use observables
  user$ = this.auth.user$;
  loading$ = this.auth.loading$;

  async signIn() {
    await this.auth.signIn(email, password);
  }

  async signUp() {
    await this.auth.signUp(email, password);
  }

  async signOut() {
    await this.auth.signOut();
  }
}
```

## Learn More

- [FortressAuth Documentation](https://github.com/AaronFortressAgData/fortressauth)
- [Angular Documentation](https://angular.dev)
