import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { AUTH_CONFIG } from '@fortressauth/angular-sdk';

bootstrapApplication(AppComponent, {
	providers: [
		{ provide: AUTH_CONFIG, useValue: { baseUrl: 'http://localhost:3001' } }
	]
}).catch((err) => console.error(err));
