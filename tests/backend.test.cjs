const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' };
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ecJwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec', alg: 'ES256', use: 'sig' };
const config = {
  SPREADSHEET_ID: 'sheet', OIDC_ISSUER: 'https://identity.example/',
  OIDC_AUDIENCE: 'toolbox-api', OIDC_JWKS_URI: 'https://identity.example/keys'
};

function token(overrides = {}, headerOverrides = {}, signingKey = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test', ...headerOverrides })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: config.OIDC_ISSUER, sub: 'alice', aud: config.OIDC_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 300, scope: 'openid email profile',
    email: 'alice@example.com', email_verified: true, ...overrides
  })).toString('base64url');
  const data = `${header}.${payload}`;
  return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), signingKey).toString('base64url')}`;
}

function es256Token(overrides = {}, headerOverrides = {}, signingKey = ec.privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'ec', ...headerOverrides })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: config.OIDC_ISSUER, sub: 'alice', aud: config.OIDC_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 300, email: 'alice@example.com',
    user_metadata: { email_verified: true }, ...overrides
  })).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(data), { key: signingKey, dsaEncoding: 'ieee-p1363' });
  return `${data}.${signature.toString('base64url')}`;
}

function runtime(extra = {}) {
  const sheets = new Map();
  const context = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({ ...config, ...extra }) }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    UrlFetchApp: { fetch: url => {
      assert.equal(url, config.OIDC_JWKS_URI);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ keys: [jwk, ecJwk] }) };
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()],
      getUuid: crypto.randomUUID
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ setMimeType: () => JSON.parse(value) }) },
    SpreadsheetApp: { openById: () => ({
      getSheetByName: name => sheets.get(name),
      insertSheet: name => {
        const rows = [];
        const sheet = {
          appendRow: row => rows.push(row), setFrozenRows: () => {}, getLastRow: () => rows.length,
          getRange: (start, _, count) => ({
            getValues: () => rows.slice(start - 1, start - 1 + count),
            setValues: values => { rows[start - 1] = values[0]; }
          }),
          deleteRow: row => rows.splice(row - 1, 1)
        };
        sheets.set(name, sheet);
        return sheet;
      }
    }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/vendor/jsrsasign.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), context);
  return context;
}

const tool = { name: 'Perceuse', category: 'Percage', description: '18 V', condition: 'Bon', shared: true };

test('signed access token accepted; full CRUD isolated by verified email', () => {
  const api = runtime();
  const accessToken = token();
  const created = api.dispatch_({ action: 'create', accessToken, tool });
  assert.equal(api.dispatch_({ action: 'list', accessToken }).tools.length, 1);
  const updated = api.dispatch_({ action: 'update', accessToken, id: created.id, tool: { ...tool, name: 'Scie' } });
  assert.equal(updated.name, 'Scie');
  const bob = token({ email: 'bob@example.com', sub: 'bob' });
  assert.equal(api.dispatch_({ action: 'list', accessToken: bob, email: 'alice@example.com' }).tools.length, 0);
  assert.throws(() => api.dispatch_({ action: 'delete', accessToken: bob, id: created.id }), /NOT_FOUND/);
  api.dispatch_({ action: 'delete', accessToken, id: created.id });
  assert.equal(api.dispatch_({ action: 'list', accessToken }).tools.length, 0);
});

test('accept standard OIDC scopes without requiring a scope claim in the access token', () => {
  const api = runtime();
  for (const claims of [{}, { scope: undefined }]) {
    assert.equal(api.dispatch_({ action: 'list', accessToken: token(claims) }).email, 'alice@example.com');
  }
});

test('ES256 access tokens are verified with EC keys; email verification can be relaxed explicitly', () => {
  const strict = runtime();
  assert.throws(() => strict.dispatch_({ action: 'list', accessToken: es256Token() }), /FORBIDDEN/);
  assert.equal(strict.dispatch_({ action: 'list', accessToken: es256Token({ email_verified: true }) }).email, 'alice@example.com');
  const relaxed = runtime({ OIDC_REQUIRE_EMAIL_VERIFIED: 'false' });
  assert.equal(relaxed.dispatch_({ action: 'list', accessToken: es256Token() }).email, 'alice@example.com');
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  for (const value of [es256Token({}, {}, other.privateKey), es256Token({}, { alg: 'RS256' }), es256Token({ aud: 'frontend-client' }),
      es256Token({ exp: 0 }), es256Token({}, { kid: 'test' })]) {
    assert.throws(() => relaxed.dispatch_({ action: 'list', accessToken: value }), /UNAUTHORIZED|FORBIDDEN/);
  }
});

test('reject invalid signature, missing expiry, expired token, wrong issuer/audience/email', () => {
  const api = runtime();
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const invalid = [token({}, {}, other.privateKey), token({ exp: 0 }), token({ exp: undefined }),
    token({ iss: 'https://attacker.example/' }), token({ aud: 'frontend-client' }),
    token({ aud: 'frontend-client', scope: undefined }), token({ email_verified: false }), token({ email: undefined }),
    token({ nbf: Math.floor(Date.now() / 1000) + 1000 }), token({}, { alg: 'none' }),
    token({}, { kid: 'unknown' }), token({}, { crit: ['custom'] }), 'not-a-token'];
  for (const value of invalid) assert.throws(() => api.verifyJwt_(value, config), /UNAUTHORIZED|FORBIDDEN/);
});

test('validation rejects oversized/invalid input and ignores client-controlled identity fields', () => {
  const api = runtime();
  assert.throws(() => api.validateTool_({ ...tool, name: ' ' }), /BAD_REQUEST/);
  assert.throws(() => api.validateTool_({ ...tool, shared: 'true' }), /BAD_REQUEST/);
  assert.throws(() => api.validateTool_({ ...tool, description: 'a'.repeat(1001) }), /BAD_REQUEST/);
  const saved = api.dispatch_({ action: 'create', accessToken: token(), tool: { ...tool, name: '=IMPORTXML("x")', email: 'bob@example.com' } });
  assert.equal(saved.email, undefined);
  assert.equal(saved.name, '=IMPORTXML("x")');
});

test('transport returns structured errors without leaking internals', () => {
  const api = runtime();
  assert.equal(api.doPost({ postData: { contents: '{' } }).error, 'INTERNAL');
  assert.equal(api.doPost({ postData: { contents: JSON.stringify({ action: 'list', accessToken: 'bad' }) } }).error, 'UNAUTHORIZED');
});