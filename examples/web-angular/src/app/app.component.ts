import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, AUTH_CONFIG } from '@fortressauth/angular-sdk';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <div class="header">
        <img src="/angular-demo/logo.svg" alt="FortressAuth Logo" class="logo">
        <h1 class="title">FortressAuth Angular</h1>
      </div>
      
      @if (auth.currentUser) {
        <div class="success">
          <p>Welcome, <span class="user-email">{{ auth.currentUser.email }}</span>!</p>
          <p style="margin: 1rem 0; color: #a0aec0;">
            Email verified: {{ auth.currentUser.emailVerified ? '✅ Yes' : '❌ No' }}
          </p>
          <button class="btn btn-secondary" (click)="handleSignOut()">Sign Out</button>
        </div>
      } @else {
        <div class="tabs">
          <button class="tab" [class.active]="mode === 'signin'" (click)="mode = 'signin'">Sign In</button>
          <button class="tab" [class.active]="mode === 'signup'" (click)="mode = 'signup'">Sign Up</button>
          <button class="tab" [class.active]="mode === 'verify'" (click)="mode = 'verify'">Verify</button>
          <button class="tab" [class.active]="mode === 'reset'" (click)="mode = 'reset'">Reset</button>
        </div>

        @if (mode === 'signin' || mode === 'signup') {
          <form (ngSubmit)="handleSubmit()">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" [(ngModel)]="email" name="email" placeholder="your@email.com" required>
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" [(ngModel)]="password" name="password" placeholder="••••••••" required>
            </div>

            @if (mode === 'signup') {
              <div class="form-group">
                <label for="confirmPassword">Confirm Password</label>
                <input type="password" id="confirmPassword" [(ngModel)]="confirmPassword" name="confirmPassword" placeholder="••••••••" required>
              </div>
            }

            <button type="submit" class="btn btn-primary" [disabled]="auth.isLoading">
              {{ auth.isLoading ? 'Processing...' : (mode === 'signin' ? 'Sign In' : 'Sign Up') }}
            </button>
            
            @if (mode === 'signin') {
              <div class="forgot-password">
                <a (click)="showResetOverlay = true">Forgot password?</a>
              </div>
            }
          </form>
        } @else if (mode === 'verify') {
          <form (ngSubmit)="handleVerify()">
            <div class="form-group">
              <label for="token">Verification Token</label>
              <input type="text" id="token" [(ngModel)]="token" name="token" placeholder="selector:verifier" required>
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="auth.isLoading">
              {{ auth.isLoading ? 'Verifying...' : 'Verify Email' }}
            </button>
          </form>
        } @else if (mode === 'reset') {
          <form (ngSubmit)="handleReset()">
            <div class="form-group">
              <label for="resetToken">Reset Token</label>
              <input type="text" id="resetToken" [(ngModel)]="token" name="resetToken" placeholder="selector:verifier" required>
            </div>
            <div class="form-group">
              <label for="newPassword">New Password</label>
              <input type="password" id="newPassword" [(ngModel)]="password" name="newPassword" placeholder="••••••••" required>
            </div>
            <div class="form-group">
              <label for="confirmResetPassword">Confirm Password</label>
              <input type="password" id="confirmResetPassword" [(ngModel)]="confirmPassword" name="confirmResetPassword" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="auth.isLoading">
              {{ auth.isLoading ? 'Resetting...' : 'Reset Password' }}
            </button>
          </form>
        }

        @if (showResetOverlay) {
          <div class="overlay">
            <div class="modal">
              <h3>Reset Password</h3>
              <p class="muted">Enter your email to receive a reset link.</p>
              <div class="form-group">
                <label for="resetEmail">Email</label>
                <input type="email" id="resetEmail" [(ngModel)]="email" name="resetEmail" placeholder="your@email.com">
              </div>
              <button class="btn btn-primary" (click)="handleRequestReset()">Send Reset Link</button>
              <button class="btn btn-secondary" (click)="showResetOverlay = false">Cancel</button>
            </div>
          </div>
        }

        @if (formError) { <p class="error">{{ formError }}</p> }
        @if (auth.currentError) { <p class="error">{{ auth.currentError }}</p> }
        @if (message) { <p class="message">{{ message }}</p> }
      }
    </div>
  `,
})
export class AppComponent {
  auth = inject(AuthService);

  mode: 'signin' | 'signup' | 'verify' | 'reset' = 'signin';
  email = '';
  password = '';
  confirmPassword = '';
  token = '';
  formError = '';
  message = '';
  showResetOverlay = false;

  async handleSubmit() {
    this.formError = '';
    this.message = '';

    if (this.mode === 'signup') {
      if (this.password !== this.confirmPassword) {
        this.formError = 'Passwords do not match';
        return;
      }
      const res = await this.auth.signUp(this.email, this.password);
      if (res.success) this.message = 'Verification email sent!';
    } else {
      await this.auth.signIn(this.email, this.password);
    }
  }

  async handleVerify() {
    this.formError = '';
    this.message = '';
    const res = await this.auth.verifyEmail(this.token);
    if (res.success) {
      this.message = 'Email verified! You can now sign in.';
      this.mode = 'signin';
    }
  }

  async handleRequestReset() {
    this.formError = '';
    this.message = '';
    const res = await this.auth.requestPasswordReset(this.email);
    if (res.success) {
      this.message = 'Password reset email sent.';
      this.showResetOverlay = false;
    }
  }

  async handleReset() {
    this.formError = '';
    this.message = '';
    if (this.password !== this.confirmPassword) {
      this.formError = 'Passwords do not match';
      return;
    }
    const res = await this.auth.resetPassword(this.token, this.password);
    if (res.success) {
      this.message = 'Password reset successful. Please sign in.';
      this.mode = 'signin';
    }
  }

  async handleSignOut() {
    await this.auth.signOut();
  }
}
