// TEMPORARY sign-in stand-in until issue #1 (authentication) is built.
//
// During development only, VITE_DEV_USER_ID (see .env.example) makes the app
// act as that customer by sending the X-Dev-User-Id header, which the API honours
// only when it runs with ALLOW_DEV_AUTH=true. Production builds ignore it.
// When real sign-in arrives, replace the body of authHeaders() - nothing else changes.

export function authHeaders() {
  const id = import.meta.env?.DEV ? import.meta.env.VITE_DEV_USER_ID : undefined;
  return id ? { 'X-Dev-User-Id': String(id) } : {};
}
