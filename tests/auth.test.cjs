const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash, generateKeyPairSync, sign } = require('node:crypto');

test('real OIDC library generates authorization code + PKCE S256, state and nonce without client secret', async () => {
  const context = vm.createContext({
    console, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: webcrypto,
    atob, btoa, setTimeout, clearTimeout, setInterval, clearInterval,
    Headers, Response, AbortController,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/vendor/oidc-client-ts.min.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/auth.js'), 'utf8'), context);
  const library = context.oidc;
  const store = new library.InMemoryWebStorage();
  const client = new library.OidcClient({
    authority: 'https://identity.example/', client_id: 'toolbox-spa',
    redirect_uri: 'http://localhost:8000/', response_type: 'code',
    scope: 'openid email profile', disablePKCE: false, filterProtocolClaims: false,
    stateStore: new library.WebStorageStateStore({ store }),
    metadata: {
      issuer: 'https://identity.example/',
      authorization_endpoint: 'https://identity.example/authorize',
      token_endpoint: 'https://identity.example/token'
    }
  });
  const signin = context.ToolboxAuth.signinArguments();
  const nonce = signin.nonce;
  const request = await client.createSigninRequest(signin);
  const parameters = new URL(request.url).searchParams;
  assert.equal(parameters.get('response_type'), 'code');
  assert.equal(parameters.get('code_challenge_method'), 'S256');
  assert.equal(parameters.get('client_id'), 'toolbox-spa');
  assert.equal(parameters.get('redirect_uri'), 'http://localhost:8000/');
  assert.equal(parameters.get('scope'), 'openid email profile');
  assert.equal(parameters.has('client_secret'), false);
  assert.equal(parameters.has('code_verifier'), false);
  assert.ok(parameters.get('state'));
  assert.equal(parameters.get('nonce'), nonce);
  assert.ok(request.state.code_verifier.length >= 43);
  assert.equal(parameters.get('code_challenge'), createHash('sha256').update(request.state.code_verifier).digest('base64url'));
  const second = await client.createSigninRequest(context.ToolboxAuth.signinArguments());
  assert.notEqual(new URL(second.url).searchParams.get('state'), parameters.get('state'));
  assert.notEqual(second.state.code_verifier, request.state.code_verifier);
  const stored = await client.settings.stateStore.get(request.state.id);
  assert.ok(stored.includes(request.state.code_verifier));

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  function idToken(returnedNonce) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://identity.example/', sub: 'alice', aud: 'toolbox-spa',
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, nonce: returnedNonce
    })).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  }
  let returnedNonce = nonce;
  let exchange;
  context.fetch = async (url, options) => {
    assert.equal(url, 'https://identity.example/token');
    assert.equal(options.method, 'POST');
    exchange = new URLSearchParams(options.body);
    return new Response(JSON.stringify({
      access_token: 'test-access-token', token_type: 'Bearer', expires_in: 300,
      scope: 'openid email profile', id_token: idToken(returnedNonce)
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const response = await client.processSigninResponse(`http://localhost:8000/?code=test-code&state=${request.state.id}`);
  assert.equal(response.access_token, 'test-access-token');
  assert.equal(response.profile.sub, 'alice');
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(exchange.get('code_verifier'), request.state.code_verifier);
  assert.equal(exchange.has('client_secret'), false);
  assert.equal(await client.settings.stateStore.get(request.state.id), undefined);
  const user = { profile: response.profile, state: response.userState, access_token: response.access_token };
  const configuration = { authority: 'https://identity.example/', clientId: 'toolbox-spa' };
  assert.equal(context.ToolboxAuth.validateUser(user, configuration), user);
  for (const changed of [{ iss: 'https://attacker.example/' }, { aud: 'another-client' }, { exp: 0 }, { iat: undefined }]) {
    assert.throws(() => context.ToolboxAuth.validateUser({ ...user, profile: { ...user.profile, ...changed } }, configuration), /OIDC/);
  }
  const withRefresh = { ...user, refresh_token: 'ignored' };
  assert.equal(context.ToolboxAuth.validateUser(withRefresh, configuration).refresh_token, undefined);
  assert.throws(
    () => context.ToolboxAuth.validateUser({ ...user, expires_at: Math.floor(Date.now() / 1000) - 1 }, configuration),
    /access token expired/
  );
  const storedValues = new Map();
  const backingStorage = {
    get length() { return storedValues.size; },
    key(index) { return Array.from(storedValues.keys())[index] || null; },
    getItem(key) { return storedValues.get(key) || null; },
    setItem(key, value) { storedValues.set(key, String(value)); },
    removeItem(key) { storedValues.delete(key); }
  };
  const persistentStorage = context.ToolboxAuth.createPersistentUserStorage(backingStorage);
  persistentStorage.setItem('oidc.user:toolbox-spa', JSON.stringify({
    access_token: 'persisted-access-token',
    id_token: 'persisted-id-token',
    refresh_token: 'must-not-be-stored',
    profile: { email: 'alice@example.test' }
  }));
  const persistedUser = JSON.parse(backingStorage.getItem('oidc.user:toolbox-spa'));
  assert.equal(persistedUser.access_token, 'persisted-access-token');
  assert.equal(persistedUser.id_token, 'persisted-id-token');
  assert.equal(persistedUser.refresh_token, undefined);
  const oidcUser = new library.User({
    access_token: 'reload-access-token',
    id_token: 'reload-id-token',
    refresh_token: 'must-not-survive-reload',
    userState: { nonce: 'reload-nonce' },
    profile: {
      email: 'alice@example.test',
      iss: 'https://identity.example/',
      sub: 'alice',
      aud: 'toolbox-spa',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: 'reload-nonce'
    },
    expires_at: Math.floor(Date.now() / 1000) + 300
  });
  const userStore = new library.WebStorageStateStore({ store: persistentStorage });
  await userStore.set('user:toolbox-spa', oidcUser.toStorageString());
  const restoredUser = library.User.fromStorageString(await userStore.get('user:toolbox-spa'));
  assert.equal(restoredUser.access_token, 'reload-access-token');
  assert.equal(restoredUser.profile.email, 'alice@example.test');
  assert.equal(restoredUser.refresh_token, undefined);
  assert.equal(restoredUser.state, undefined);
  assert.equal(context.ToolboxAuth.validateUser(restoredUser, configuration, { requireNonce: false }), restoredUser);
  assert.throws(() => context.ToolboxAuth.validateUser(restoredUser, configuration), /nonce missing/);
  const slashless = { ...user, profile: { ...user.profile, iss: 'https://identity.example' } };
  assert.equal(context.ToolboxAuth.validateUser(slashless, configuration), slashless);
  await assert.rejects(() => client.processSigninResponse('http://localhost:8000/?code=test-code&state=unknown'));
  returnedNonce = 'wrong-nonce';
  const wrongResponse = await client.processSigninResponse(`http://localhost:8000/?code=test-code&state=${second.state.id}`);
  assert.throws(() => context.ToolboxAuth.validateUser({ profile: wrongResponse.profile, state: wrongResponse.userState, access_token: wrongResponse.access_token }, configuration), /nonce/i);
});