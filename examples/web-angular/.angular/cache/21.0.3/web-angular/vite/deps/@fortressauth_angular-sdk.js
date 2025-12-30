import {
  BehaviorSubject,
  Inject,
  Injectable,
  InjectionToken,
  Observable,
  Optional
} from "./chunk-RIWGLLGO.js";
import {
  __async,
  __spreadProps,
  __spreadValues
} from "./chunk-WDMUDEB6.js";

// ../../packages/angular-sdk/dist/auth.service.js
var __decorate = function(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = function(k, v) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = function(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
};
var AUTH_CONFIG = new InjectionToken("AUTH_CONFIG");
function resolveBaseUrl(explicit) {
  if (typeof window !== "undefined") {
    const envUrl = window.__FORTRESS_API_URL__;
    if (envUrl)
      return envUrl;
  }
  return explicit ?? "http://localhost:3000";
}
function apiRequest(baseUrl, path, init) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(`${baseUrl}${path}`, __spreadProps(__spreadValues({}, init), {
        credentials: "include",
        headers: __spreadValues({
          "Content-Type": "application/json"
        }, init?.headers ?? {})
      }));
      const data = yield res.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error"
      };
    }
  });
}
var AuthService = class AuthService2 {
  get user$() {
    return new Observable((subscriber) => {
      this.stateSubject.subscribe((state) => subscriber.next(state.user));
    });
  }
  get loading$() {
    return new Observable((subscriber) => {
      this.stateSubject.subscribe((state) => subscriber.next(state.loading));
    });
  }
  get error$() {
    return new Observable((subscriber) => {
      this.stateSubject.subscribe((state) => subscriber.next(state.error));
    });
  }
  get currentUser() {
    return this.stateSubject.getValue().user;
  }
  get isLoading() {
    return this.stateSubject.getValue().loading;
  }
  get currentError() {
    return this.stateSubject.getValue().error;
  }
  constructor(config) {
    this.stateSubject = new BehaviorSubject({
      user: null,
      loading: true,
      error: null
    });
    this.state$ = this.stateSubject.asObservable();
    this.baseUrl = resolveBaseUrl(config?.baseUrl);
    this.refreshUser();
  }
  updateState(partial) {
    this.stateSubject.next(__spreadValues(__spreadValues({}, this.stateSubject.getValue()), partial));
  }
  refreshUser() {
    return __async(this, null, function* () {
      this.updateState({ loading: true });
      const response = yield apiRequest(this.baseUrl, "/auth/me");
      if (response.success && response.data) {
        this.updateState({
          user: response.data.user,
          error: null,
          loading: false
        });
      } else {
        this.updateState({
          user: null,
          error: response.error ?? null,
          loading: false
        });
      }
    });
  }
  signUp(email, password) {
    return __async(this, null, function* () {
      const response = yield apiRequest(this.baseUrl, "/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (response.success && response.data) {
        this.updateState({ user: response.data.user, error: null });
      } else {
        this.updateState({ error: response.error ?? "UNKNOWN_ERROR" });
      }
      return response;
    });
  }
  signIn(email, password) {
    return __async(this, null, function* () {
      const response = yield apiRequest(this.baseUrl, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (response.success && response.data) {
        this.updateState({ user: response.data.user, error: null });
      } else {
        this.updateState({ error: response.error ?? "UNKNOWN_ERROR" });
      }
      return response;
    });
  }
  signOut() {
    return __async(this, null, function* () {
      const response = yield apiRequest(this.baseUrl, "/auth/logout", {
        method: "POST"
      });
      if (response.success) {
        this.updateState({ user: null });
      }
      return response;
    });
  }
  verifyEmail(token) {
    return __async(this, null, function* () {
      return apiRequest(this.baseUrl, "/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      });
    });
  }
  requestPasswordReset(email) {
    return __async(this, null, function* () {
      return apiRequest(this.baseUrl, "/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email })
      });
    });
  }
  resetPassword(token, newPassword) {
    return __async(this, null, function* () {
      return apiRequest(this.baseUrl, "/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword })
      });
    });
  }
};
AuthService = __decorate([
  Injectable({
    providedIn: "root"
  }),
  __param(0, Optional()),
  __param(0, Inject(AUTH_CONFIG)),
  __metadata("design:paramtypes", [Object])
], AuthService);
export {
  AUTH_CONFIG,
  AuthService
};
//# sourceMappingURL=@fortressauth_angular-sdk.js.map
