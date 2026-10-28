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
  const book = {
    getSheetByName: name => sheets.get(name),
    insertSheet: name => {
      const rows = [];
      const sheet = {
        appendRow: row => rows.push(row),
        setFrozenRows: () => {},
        getLastRow: () => rows.length,
        getRange: (start, column, count, width) => ({
          getValues: () => rows.slice(start - 1, start - 1 + count)
            .map(row => row.slice(column - 1, column - 1 + width)),
          setValues: values => values.forEach((value, index) => {
            const rowIndex = start - 1 + index;
            if (!rows[rowIndex]) rows[rowIndex] = [];
            value.forEach((cell, cellIndex) => { rows[rowIndex][column - 1 + cellIndex] = cell; });
          })
        }),
        deleteRow: row => rows.splice(row - 1, 1)
      };
      sheets.set(name, sheet);
      return sheet;
    },
    deleteSheet: sheet => {
      for (const [name, value] of sheets) if (value === sheet) sheets.delete(name);
    }
  };
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
    SpreadsheetApp: { openById: () => book }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/vendor/jsrsasign.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8'), context);
  context.__sheets = sheets;
  return context;
}

const tool = { name: 'Perceuse', category: 'Percage', description: '18 V', condition: 'Bon', shared: true };

test('signed access token accepted; full CRUD isolated by verified email', () => {
  const api = runtime();
  const accessToken = token();
  api.dispatch_({ action: 'saveProfile', accessToken, profile: {} });
  const created = api.dispatch_({ action: 'create', accessToken, tool });
  assert.equal(api.dispatch_({ action: 'list', accessToken }).tools.length, 1);
  const updated = api.dispatch_({ action: 'update', accessToken, id: created.id, tool: { ...tool, name: 'Scie' } });
  assert.equal(updated.name, 'Scie');
  const bob = token({ email: 'bob@example.com', sub: 'bob' });
  api.dispatch_({ action: 'saveProfile', accessToken: bob, profile: {} });
  assert.equal(api.dispatch_({ action: 'list', accessToken: bob, email: 'alice@example.com' }).tools.length, 0);
  assert.throws(() => api.dispatch_({ action: 'delete', accessToken: bob, id: created.id }), /NOT_FOUND/);
  api.dispatch_({ action: 'delete', accessToken, id: created.id });
  assert.equal(api.dispatch_({ action: 'list', accessToken }).tools.length, 0);
});

test('profiles are derived from the verified email and isolated from other users', () => {
  const api = runtime();
  const aliceToken = token();
  const bobToken = token({ email: 'bob@example.com', sub: 'bob' });
  const empty = api.dispatch_({ action: 'getProfile', accessToken: aliceToken });
  assert.equal(empty.exists, false);
  assert.equal(empty.name, '');
  assert.equal(empty.phone, '');
  assert.equal(empty.address, '');

  const aliceProfile = { name: 'Alice Exemple', phone: '+33 6 12 34 56 78', address: '1 rue des Outils' };
  api.dispatch_({
    action: 'saveProfile', accessToken: aliceToken, email: 'bob@example.com',
    profile: { ...aliceProfile, email: 'bob@example.com' }
  });
  const bobProfile = { name: 'Bob Exemple', phone: '', address: '2 place du Marteau' };
  api.dispatch_({ action: 'saveProfile', accessToken: bobToken, profile: bobProfile });
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken: aliceToken }).name, aliceProfile.name);
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken: aliceToken }).exists, true);
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken: bobToken }).name, bobProfile.name);
  assert.equal(api.__sheets.get('Profils').getRange(1, 1, 3, 4).getValues()[0][0], 'email');

  assert.throws(() => api.dispatch_({
    action: 'saveProfile', accessToken: aliceToken,
    profile: { ...aliceProfile, address: '1 rue des Outils\nbob@example.com' }
  }), /BAD_REQUEST/);
  assert.throws(() => api.dispatch_({
    action: 'saveProfile', accessToken: aliceToken,
    profile: { ...aliceProfile, name: '\nAlice Exemple' }
  }), /BAD_REQUEST/);
  assert.throws(() => api.dispatch_({
    action: 'saveProfile', accessToken: aliceToken,
    profile: { ...aliceProfile, name: 'A'.repeat(121) }
  }), /BAD_REQUEST/);

  const aliceTool = api.dispatch_({ action: 'create', accessToken: aliceToken, tool });
  api.dispatch_({ action: 'create', accessToken: bobToken, tool: { ...tool, name: 'Marteau' } });
  api.dispatch_({ action: 'deleteProfile', accessToken: aliceToken, email: 'bob@example.com' });
  assert.equal(api.__sheets.has(api.userSheetName_('alice@example.com')), false);
  assert.equal(api.__sheets.has(api.userSheetName_('bob@example.com')), true);
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken: bobToken }).name, bobProfile.name);
  assert.throws(() => api.dispatch_({ action: 'list', accessToken: aliceToken }), /PROFILE_REQUIRED/);
  assert.equal(api.__sheets.has(api.userSheetName_('alice@example.com')), false);
  api.dispatch_({ action: 'saveProfile', accessToken: aliceToken, profile: {} });
  assert.equal(api.dispatch_({ action: 'list', accessToken: aliceToken }).tools.length, 0);
  assert.ok(aliceTool.id);
});

test('friend requests are normalized, recipient-controlled, and expose profiles only after acceptance', () => {
  const api = runtime();
  const aliceToken = token();
  const bobToken = token({ email: 'Bob@example.com', sub: 'bob' });
  api.dispatch_({ action: 'saveProfile', accessToken: aliceToken, profile: { name: 'Alice', phone: '111', address: 'Rue A' } });
  api.dispatch_({ action: 'saveProfile', accessToken: bobToken, profile: { name: 'Bob', phone: '222', address: 'Rue B' } });
  api.dispatch_({ action: 'create', accessToken: aliceToken, tool: { ...tool, shared: true } });
  api.dispatch_({ action: 'create', accessToken: aliceToken, tool: { ...tool, name: 'Privé', shared: false } });
  api.dispatch_({ action: 'create', accessToken: bobToken, tool: { ...tool, name: 'Marteau', shared: true } });
  api.dispatch_({ action: 'create', accessToken: bobToken, tool: { ...tool, name: 'Étau privé', shared: false } });

  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({
    action: 'sendFriendRequest', accessToken: aliceToken, email: 'BOB@example.com',
    requester: 'bob@example.com', email1: 'bob@example.com', status: 'accepté'
  }))), { submitted: true });
  const sheet = api.__sheets.get('Amities');
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.getRange(1, 1, 2, 4).getValues())), [
    ['email_1', 'email_2', 'demandeur', 'statut'],
    ['alice@example.com', 'bob@example.com', 'alice@example.com', 'en attente']
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({ action: 'getFriendStatus', accessToken: bobToken }))), { incomingCount: 1 });
  const aliceBeforeAcceptance = api.dispatch_({ action: 'listFriends', accessToken: aliceToken });
  const bobBeforeAcceptance = api.dispatch_({ action: 'listFriends', accessToken: bobToken });
  assert.deepEqual(JSON.parse(JSON.stringify(aliceBeforeAcceptance)), { friends: [], sent: [{ email: 'bob@example.com' }], received: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(bobBeforeAcceptance)), { friends: [], sent: [], received: [{ email: 'alice@example.com' }] });
  assert.throws(() => api.dispatch_({
    action: 'respondFriendRequest', accessToken: aliceToken, email: 'bob@example.com', decision: 'accept'
  }), /FORBIDDEN/);
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({
    action: 'listNeighborhoodTools', accessToken: aliceToken
  }))), { tools: [] });

  api.dispatch_({ action: 'respondFriendRequest', accessToken: bobToken, email: 'alice@example.com', decision: 'accept' });
  assert.equal(sheet.getRange(2, 4, 1, 1).getValues()[0][0], 'accepté');
  const aliceAfterAcceptance = api.dispatch_({ action: 'listFriends', accessToken: aliceToken });
  assert.deepEqual(JSON.parse(JSON.stringify(aliceAfterAcceptance.friends)), [{
    email: 'bob@example.com', name: 'Bob', phone: '222', address: 'Rue B'
  }]);
  const neighborhood = api.dispatch_({ action: 'listNeighborhoodTools', accessToken: aliceToken });
  assert.deepEqual(JSON.parse(JSON.stringify(neighborhood.tools.map(item => [item.name, item.ownerEmail, item.ownerName]))), [
    ['Marteau', 'bob@example.com', 'Bob']
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({
    action: 'sendFriendRequest', accessToken: bobToken, email: 'alice@example.com'
  }))), { submitted: true });
  assert.equal(sheet.getLastRow(), 2);
  api.dispatch_({ action: 'deleteProfile', accessToken: bobToken });
  assert.equal(sheet.getLastRow(), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({ action: 'listNeighborhoodTools', accessToken: aliceToken }))), { tools: [] });
});

test('friend request refusal removes the row and unregistered targets are not disclosed', () => {
  const api = runtime();
  const aliceToken = token();
  const bobToken = token({ email: 'bob@example.com', sub: 'bob' });
  api.dispatch_({ action: 'saveProfile', accessToken: aliceToken, profile: {} });
  api.dispatch_({ action: 'saveProfile', accessToken: bobToken, profile: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({
    action: 'sendFriendRequest', accessToken: aliceToken, email: 'nobody@example.com'
  }))), { submitted: true });
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({ action: 'listFriends', accessToken: aliceToken }))), {
    friends: [], sent: [], received: []
  });
  api.dispatch_({ action: 'sendFriendRequest', accessToken: aliceToken, email: 'bob@example.com' });
  api.dispatch_({ action: 'respondFriendRequest', accessToken: bobToken, email: 'alice@example.com', decision: 'decline' });
  assert.equal(api.__sheets.get('Amities').getLastRow(), 1);
  assert.throws(() => api.dispatch_({
    action: 'sendFriendRequest', accessToken: aliceToken, email: 'alice@example.com'
  }), /BAD_REQUEST/);
});

test('friendship email pairs are always stored alphabetically regardless of requester', () => {
  const api = runtime();
  const aliceToken = token();
  const zoeToken = token({ email: 'zoe@example.com', sub: 'zoe' });
  api.dispatch_({ action: 'saveProfile', accessToken: aliceToken, profile: {} });
  api.dispatch_({ action: 'saveProfile', accessToken: zoeToken, profile: {} });
  api.dispatch_({ action: 'sendFriendRequest', accessToken: zoeToken, email: 'alice@example.com' });
  assert.deepEqual(JSON.parse(JSON.stringify(api.__sheets.get('Amities').getRange(2, 1, 1, 4).getValues())), [
    ['alice@example.com', 'zoe@example.com', 'zoe@example.com', 'en attente']
  ]);
});

test('either participant can remove pending requests or accepted friendships, but outsiders cannot', () => {
  const api = runtime();
  const aliceToken = token();
  const bobToken = token({ email: 'bob@example.com', sub: 'bob' });
  const carolToken = token({ email: 'carol@example.com', sub: 'carol' });
  api.dispatch_({ action: 'saveProfile', accessToken: aliceToken, profile: {} });
  api.dispatch_({ action: 'saveProfile', accessToken: bobToken, profile: {} });
  api.dispatch_({ action: 'saveProfile', accessToken: carolToken, profile: {} });
  api.dispatch_({ action: 'create', accessToken: bobToken, tool: { ...tool, name: 'Perceuse de Bob' } });

  api.dispatch_({ action: 'sendFriendRequest', accessToken: aliceToken, email: 'bob@example.com' });
  const sheet = api.__sheets.get('Amities');
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({
    action: 'removeFriendship', accessToken: bobToken, email: 'alice@example.com'
  }))), { removed: true });
  assert.equal(sheet.getLastRow(), 1);

  api.dispatch_({ action: 'sendFriendRequest', accessToken: aliceToken, email: 'bob@example.com' });
  api.dispatch_({ action: 'removeFriendship', accessToken: aliceToken, email: 'bob@example.com' });
  assert.equal(sheet.getLastRow(), 1);

  api.dispatch_({ action: 'sendFriendRequest', accessToken: aliceToken, email: 'bob@example.com' });
  api.dispatch_({ action: 'respondFriendRequest', accessToken: bobToken, email: 'alice@example.com', decision: 'accept' });
  assert.equal(api.dispatch_({ action: 'listNeighborhoodTools', accessToken: aliceToken }).tools.length, 1);
  assert.throws(() => api.dispatch_({
    action: 'removeFriendship', accessToken: carolToken, email: 'alice@example.com',
    email_1: 'alice@example.com', email_2: 'bob@example.com', requester: 'alice@example.com'
  }), /NOT_FOUND/);
  api.dispatch_({ action: 'removeFriendship', accessToken: aliceToken, email: 'bob@example.com' });
  assert.equal(sheet.getLastRow(), 1);
  assert.equal(api.dispatch_({ action: 'listFriends', accessToken: aliceToken }).friends.length, 0);
  assert.equal(api.dispatch_({ action: 'listFriends', accessToken: bobToken }).friends.length, 0);
  assert.equal(api.dispatch_({ action: 'listNeighborhoodTools', accessToken: aliceToken }).tools.length, 0);

  api.dispatch_({ action: 'sendFriendRequest', accessToken: aliceToken, email: 'bob@example.com' });
  api.dispatch_({ action: 'respondFriendRequest', accessToken: bobToken, email: 'alice@example.com', decision: 'accept' });
  api.dispatch_({ action: 'removeFriendship', accessToken: bobToken, email: 'alice@example.com' });
  assert.equal(sheet.getLastRow(), 1);
  assert.equal(api.dispatch_({ action: 'listNeighborhoodTools', accessToken: aliceToken }).tools.length, 0);
  assert.throws(() => api.dispatch_({
    action: 'removeFriendship', accessToken: aliceToken, email: 'alice@example.com'
  }), /BAD_REQUEST/);
});

test('tool APIs require an existing profile, then allow a profile with blank fields', () => {
  const api = runtime();
  const accessToken = token();
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken }).exists, false);
  for (const request of [
    { action: 'list' },
    { action: 'create', tool },
    { action: 'update', id: 'tool-id', tool },
    { action: 'delete', id: 'tool-id' },
    { action: 'getFriendStatus' },
    { action: 'listFriends' },
    { action: 'sendFriendRequest', email: 'bob@example.com' },
    { action: 'respondFriendRequest', email: 'bob@example.com', decision: 'accept' },
    { action: 'removeFriendship', email: 'bob@example.com' },
    { action: 'listNeighborhoodTools' }
  ]) {
    assert.throws(() => api.dispatch_({ ...request, accessToken }), /PROFILE_REQUIRED/);
  }
  api.dispatch_({ action: 'saveProfile', accessToken, profile: {} });
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken }).exists, true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.dispatch_({ action: 'list', accessToken }).tools)), []);
  assert.ok(api.dispatch_({ action: 'create', accessToken, tool }).id);
});

test('profile save allows clearing optional fields and stores formula-like text safely', () => {
  const api = runtime();
  const accessToken = token();
  const formulaText = { name: '=1+1', address: 'Rue du Test' };
  api.dispatch_({ action: 'saveProfile', accessToken, profile: formulaText });
  assert.equal(api.__sheets.get('Profils').getRange(2, 1, 1, 4).getValues()[0][1], "'=1+1");
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken }).name, '=1+1');
  assert.equal(api.dispatch_({ action: 'getProfile', accessToken }).phone, '');
  api.dispatch_({ action: 'saveProfile', accessToken, profile: { name: '', phone: '', address: '' } });
  const result = api.dispatch_({ action: 'getProfile', accessToken });
  assert.equal(result.name, '');
  assert.equal(result.phone, '');
  assert.equal(result.address, '');
});

test('duplicate profile email rows fail closed', () => {
  const api = runtime();
  const accessToken = token();
  api.dispatch_({ action: 'saveProfile', accessToken, profile: { name: 'Alice', phone: '', address: '' } });
  api.__sheets.get('Profils').appendRow(['alice@example.com', 'Intrus', '', '']);
  assert.throws(() => api.dispatch_({ action: 'getProfile', accessToken }), /INTERNAL/);
  assert.throws(() => api.dispatch_({
    action: 'saveProfile', accessToken, profile: { name: 'Alice', phone: '', address: '' }
  }), /INTERNAL/);
});

test('accept standard OIDC scopes without requiring a scope claim in the access token', () => {
  const api = runtime();
  for (const claims of [{}, { scope: undefined }]) {
    const accessToken = token(claims);
    api.dispatch_({ action: 'saveProfile', accessToken, profile: {} });
    assert.equal(api.dispatch_({ action: 'list', accessToken }).email, 'alice@example.com');
  }
});

test('ES256 access tokens are verified with EC keys; email verification can be relaxed explicitly', () => {
  const strict = runtime();
  assert.throws(() => strict.dispatch_({ action: 'list', accessToken: es256Token() }), /FORBIDDEN/);
  const strictToken = es256Token({ email_verified: true });
  strict.dispatch_({ action: 'saveProfile', accessToken: strictToken, profile: {} });
  assert.equal(strict.dispatch_({ action: 'list', accessToken: strictToken }).email, 'alice@example.com');
  const relaxed = runtime({ OIDC_REQUIRE_EMAIL_VERIFIED: 'false' });
  const relaxedToken = es256Token();
  relaxed.dispatch_({ action: 'saveProfile', accessToken: relaxedToken, profile: {} });
  assert.equal(relaxed.dispatch_({ action: 'list', accessToken: relaxedToken }).email, 'alice@example.com');
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
  api.dispatch_({ action: 'saveProfile', accessToken: token(), profile: {} });
  const saved = api.dispatch_({ action: 'create', accessToken: token(), tool: { ...tool, name: '=IMPORTXML("x")', email: 'bob@example.com' } });
  assert.equal(saved.email, undefined);
  assert.equal(saved.name, '=IMPORTXML("x")');
});

test('transport returns structured errors without leaking internals', () => {
  const api = runtime();
  assert.equal(api.doPost({ postData: { contents: '{' } }).error, 'INTERNAL');
  assert.equal(api.doPost({ postData: { contents: JSON.stringify({ action: 'list', accessToken: 'bad' }) } }).error, 'UNAUTHORIZED');
  assert.equal(api.doPost({ postData: { contents: JSON.stringify({ action: 'list', accessToken: token() }) } }).error, 'PROFILE_REQUIRED');
});