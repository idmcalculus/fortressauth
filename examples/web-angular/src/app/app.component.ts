import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@fortressauth/angular-sdk';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h1 class="title">🏰 FortressAuth Angular</h1>
      
      @if (auth.isLoading) {
        <div class="loading">Loading...</div>
      } @else if (auth.currentUser) {
        <div class="success">
          <p>Welcome, <span class="user-email">{{ auth.currentUser.email }}</span>!</p>
          <p style="margin: 1rem 0; color: #a0aec0;">
            Email verified: {{ auth.currentUser.emailVerified ? '✅ Yes' : '❌ No' }}
          </p>
          <button class="btn btn-secondary" (click)="handleSignOut()">Sign Out</button>
        </div>
      } @else {
        <div class="tabs">
          <button 
            class="tab" 
            [class.active]="mode === 'signin'"
            (click)="mode = 'signin'"
          >Sign In</button>
          <button 
            class="tab" 
            [class.active]="mode === 'signup'"
            (click)="mode = 'signup'"
          >Sign Up</button>
        </div>

        <form (ngSubmit)="handleSubmit()">
          <div class="form-group">
            <label for="email">Email</label>
            <input 
              type="email" 
              id="email" 
              [(ngModel)]="email" 
              name="email"
              placeholder="your@email.com"
              required
            >
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              [(ngModel)]="password" 
              name="password"
              placeholder="••••••••"
              required
            >
          </div>

          @if (mode === 'signup') {
            <div class="form-group">
              <label for="confirmPassword">Confirm Password</label>
              <input 
                type="password" 
                id="confirmPassword" 
                [(ngModel)]="confirmPassword" 
                name="confirmPassword"
                placeholder="••••••••"
                required
              >
            </div>
          }

          <button type="submit" class="btn btn-primary">
            {{ mode === 'signin' ? 'Sign In' : 'Sign Up' }}
          </button>
        </form>

        @if (formError) {
          <p class="error">{{ formError }}</p>
        }
        @if (auth.currentError) {
          <p class="error">{{ auth.currentError }}</p>
        }
      }
    </div>
  `
})
export class AppComponent {
  auth = inject(AuthService);

  mode: 'signin' | 'signup' = 'signin';
  email = '';
  password = '';
  confirmPassword = '';
  formError = '';

  async handleSubmit() {
    this.formError = '';

    if (this.mode === 'signup') {
      if (this.password !== this.confirmPassword) {
        this.formError = 'Passwords do not match';
        return;
      }
      await this.auth.signUp(this.email, this.password);
    } else {
      await this.auth.signIn(this.email, this.password);
    }
  }

  async handleSignOut() {
    await this.auth.signOut();
  }
}
