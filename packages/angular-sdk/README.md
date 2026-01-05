# @fortressauth/angular-sdk

Angular service for FortressAuth authentication.

## Features

- Injectable `AuthService` with RxJS observables
- Cookie-based sessions with CSRF handling
- TypeScript types for auth responses and user state

## Installation

```bash
npm install @fortressauth/angular-sdk
# or
pnpm add @fortressauth/angular-sdk
# or
yarn add @fortressauth/angular-sdk
```

## Quick Start

### Configure base URL

Provide a base URL via `AUTH_CONFIG` or set `window.__FORTRESS_API_URL__` at runtime.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AUTH_CONFIG } from '@fortressauth/angular-sdk';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: AUTH_CONFIG, useValue: { baseUrl: 'http://localhost:3000' } },
  ],
});
```

### Use the service

```ts
import { Component } from '@angular/core';
import { AuthService } from '@fortressauth/angular-sdk';

@Component({
  selector: 'app-login',
  template: `
    <div *ngIf="(loading$ | async)">Loading...</div>
    <div *ngIf="(error$ | async) as err">{{ err }}</div>
    <button (click)="signIn()">Sign In</button>
  `,
})
export class LoginComponent {
  user$ = this.auth.user$;
  loading$ = this.auth.loading$;
  error$ = this.auth.error$;

  constructor(private readonly auth: AuthService) {}

  async signIn() {
    await this.auth.signIn('user@example.com', 'password123');
  }
}
```

## License

MIT
