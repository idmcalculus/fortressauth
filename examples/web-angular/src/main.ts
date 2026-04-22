import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { AUTH_CONFIG } from '@fortressauth/angular-sdk';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

const runtimeApiUrl =
  typeof window !== 'undefined' &&
  typeof window.__FORTRESSAUTH_RUNTIME_CONFIG__?.apiUrl === 'string' &&
  window.__FORTRESSAUTH_RUNTIME_CONFIG__.apiUrl.trim().length > 0
    ? window.__FORTRESSAUTH_RUNTIME_CONFIG__.apiUrl
    : undefined;

const apiUrl =
  runtimeApiUrl && runtimeApiUrl.trim().length > 0 ? runtimeApiUrl : environment.apiUrl;

bootstrapApplication(AppComponent, {
  providers: [{ provide: AUTH_CONFIG, useValue: { baseUrl: apiUrl } }],
}).catch((err) => console.error(err));
