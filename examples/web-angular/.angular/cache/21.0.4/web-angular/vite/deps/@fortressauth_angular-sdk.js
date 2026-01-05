import {
  BehaviorSubject,
  Inject,
  Injectable,
  InjectionToken,
  Observable,
  Optional
} from "./chunk-NMLZR7KV.js";
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
var CSRF_COOKIE_NAME = "fortress_csrf";
var CSRF_HEADER_NAME = "x-csrf-token";
var csrfTokenCache = /* @__PURE__ */ new Map();
var csrfPromiseCache = /* @__PURE__ */ new Map();
function resolveBaseUrl(explicit) {
  if (typeof window !== "undefined") {
    const envUrl = window.__FORTRESS_API_URL__;
    if (envUrl)
      return envUrl;
  }
  return explicit ?? "http://localhost:3000";
}
function getCookieValue(name) {
  const doc = globalThis.document;
  const cookie = doc?.cookie;
  if (!cookie)
    return null;
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
function fetchCsrfToken(baseUrl) {
  return __async(this, null, function* () {
    const res = yield fetch(`${baseUrl}/auth/csrf`, { credentials: "include" });
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const data = yield res.json();
      if (data.success && data.data?.csrfToken) {
        return data.data.csrfToken;
      }
    }
    throw new Error("CSRF_TOKEN_UNAVAILABLE");
  });
}
function getCsrfToken(baseUrl) {
  return __async(this, null, function* () {
    const cookieToken = getCookieValue(CSRF_COOKIE_NAME);
    if (cookieToken) {
      csrfTokenCache.set(baseUrl, cookieToken);
      return cookieToken;
    }
    const cached = csrfTokenCache.get(baseUrl);
    if (cached)
      return cached;
    const inflight = csrfPromiseCache.get(baseUrl);
    if (inflight)
      return inflight;
    const promise = fetchCsrfToken(baseUrl).then((token) => {
      csrfTokenCache.set(baseUrl, token);
      return token;
    }).finally(() => {
      csrfPromiseCache.delete(baseUrl);
    });
    csrfPromiseCache.set(baseUrl, promise);
    return promise;
  });
}
function clearCsrfToken(baseUrl) {
  csrfTokenCache.delete(baseUrl);
}
function apiRequest(baseUrl, path, init, retry = false) {
  return __async(this, null, function* () {
    try {
      const method = init?.method?.toUpperCase() ?? "GET";
      const requiresCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      let csrfToken;
      if (requiresCsrf) {
        try {
          csrfToken = yield getCsrfToken(baseUrl);
        } catch {
          csrfToken = void 0;
        }
      }
      const res = yield fetch(`${baseUrl}${path}`, __spreadProps(__spreadValues({}, init), {
        credentials: "include",
        headers: __spreadValues(__spreadValues({
          "Content-Type": "application/json"
        }, csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}), init?.headers ?? {})
      }));
      const data = yield res.json();
      if (!retry && requiresCsrf && !data.success && data.error === "CSRF_TOKEN_INVALID") {
        clearCsrfToken(baseUrl);
        return apiRequest(baseUrl, path, init, true);
      }
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
