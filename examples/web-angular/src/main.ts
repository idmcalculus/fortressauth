import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { AUTH_CONFIG } from '@fortressauth/angular-sdk';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [{ provide: AUTH_CONFIG, useValue: { baseUrl: environment.apiUrl } }],
}).catch((err) => console.error(err));
