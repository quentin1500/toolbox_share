(() => {
  'use strict';
  function signinArguments() {
    const nonce = crypto.randomUUID();
    return { nonce, state: { nonce } };
  }

  function validateUser(user, config, { requireNonce = true } = {}) {
    const claims = user?.profile;
    const now = Math.floor(Date.now() / 1000);
    const fail = reason => { throw new Error(`OIDC ${reason}`); };
    const trim = value => String(value).replace(/\/+$/, '');
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    if (!claims) fail('ID token absent');
    if (typeof claims.nonce !== 'string' || !claims.nonce) fail('nonce missing');
    const nonce = user.state?.nonce;
    if (requireNonce && (typeof nonce !== 'string' || !nonce)) fail('nonce missing');
    if (nonce !== undefined && claims.nonce !== nonce) fail('nonce mismatch');
    if (typeof claims.iss !== 'string' || trim(claims.iss) !== trim(config.authority)) fail('issuer mismatch');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!claims.sub) fail('subject missing');
    if (audiences.indexOf(config.clientId) < 0 ||
        (audiences.length > 1 && claims.azp !== config.clientId) ||
        (claims.azp !== undefined && claims.azp !== config.clientId)) fail('audience mismatch');
    if (!finite(claims.exp) || claims.exp <= now) fail('ID token expired');
    if (!finite(claims.iat) || claims.iat > now + 30) fail('invalid iat');
    if (claims.nbf !== undefined && (!finite(claims.nbf) || claims.nbf > now)) fail('invalid nbf');
    if (!user.access_token) fail('access token missing');
    if (user.expired === true || (finite(user.expires_at) && user.expires_at <= now)) fail('access token expired');
    // Un refresh token eventuel n'est jamais utilise ; on ne le conserve pas.
    user.refresh_token = undefined;
    return user;
  }

  function createPersistentUserStorage(storage) {
    return {
      get length() { return storage.length; },
      key(index) { return storage.key(index); },
      getItem(key) { return storage.getItem(key); },
      removeItem(key) { return storage.removeItem(key); },
      setItem(key, value) {
        const user = JSON.parse(value);
        if (!user || typeof user !== 'object' || Array.isArray(user)) {
          throw new Error('Invalid OIDC user storage value');
        }
        delete user.refresh_token;
        storage.setItem(key, JSON.stringify(user));
      }
    };
  }

  globalThis.ToolboxAuth = Object.freeze({ signinArguments, validateUser, createPersistentUserStorage });
})();