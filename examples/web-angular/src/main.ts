import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { AUTH_CONFIG } from '@fortressauth/angular-sdk';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [{ provide: AUTH_CONFIG, useValue: { baseUrl: '' } }],
}).catch((err) => console.error(err));
