function doPost(event) {
  var result;
  try {
    if (!event || !event.postData || event.postData.contents.length > 20000) {
      throw new Error('BAD_REQUEST');
    }
    result = { ok: true, data: dispatch_(JSON.parse(event.postData.contents)) };
  } catch (error) {
    var allowed = ['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BUSY', 'CONFIGURATION'];
    var code = allowed.indexOf(error.message) >= 0 ? error.message : 'INTERNAL';
    result = { ok: false, error: code };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function configuration_() {
  var properties = PropertiesService.getScriptProperties().getProperties();
  ['SPREADSHEET_ID', 'OIDC_ISSUER', 'OIDC_AUDIENCE', 'OIDC_JWKS_URI'].forEach(function (key) {
    if (!properties[key]) throw new Error('CONFIGURATION');
  });
  if (!/^https:\/\//.test(properties.OIDC_ISSUER) || !/^https:\/\//.test(properties.OIDC_JWKS_URI)) {
    throw new Error('CONFIGURATION');
  }
  return properties;
}

function jwks_(config, force) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'jwks:' + config.OIDC_JWKS_URI;
  var cached = force ? null : cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  var response = UrlFetchApp.fetch(config.OIDC_JWKS_URI, {
    muteHttpExceptions: true, followRedirects: false
  });
  if (response.getResponseCode() !== 200) throw new Error('UNAUTHORIZED');
  var text = response.getContentText();
  var keys = JSON.parse(text);
  if (!Array.isArray(keys.keys) || keys.keys.length > 30) throw new Error('UNAUTHORIZED');
  if (text.length < 90000) cache.put(cacheKey, text, 300);
  return keys;
}

function verifyJwt_(token, config) {
  try {
    var library = jwtLibrary_();
    var KJUR = library.KJUR;
    var KEYUTIL = library.KEYUTIL;
    var b64utoutf8 = library.b64utoutf8;
    if (typeof token !== 'string' || token.length > 16000 || token.split('.').length !== 3) {
      throw new Error('UNAUTHORIZED');
    }
    var header = KJUR.jws.JWS.readSafeJSONString(b64utoutf8(token.split('.')[0]));
    if (!header || ['RS256', 'ES256'].indexOf(header.alg) < 0 || typeof header.kid !== 'string' || !header.kid || header.crit) {
      throw new Error('UNAUTHORIZED');
    }
    var keyType = header.alg === 'ES256' ? 'EC' : 'RSA';
    var chooseKey = function (set) {
      return set.keys.filter(function (key) {
        return key.kid === header.kid && key.kty === keyType && (keyType !== 'EC' || key.crv === 'P-256') &&
          (!key.use || key.use === 'sig') && (!key.alg || key.alg === header.alg) &&
          (!key.key_ops || key.key_ops.indexOf('verify') >= 0);
      })[0];
    };
    var key = chooseKey(jwks_(config, false));
    if (!key) key = chooseKey(jwks_(config, true));
    if (!key || !KJUR.jws.JWS.verify(token, KEYUTIL.getKey(key), [header.alg])) {
      throw new Error('UNAUTHORIZED');
    }
    var claims = KJUR.jws.JWS.readSafeJSONString(b64utoutf8(token.split('.')[1]));
    var now = Math.floor(Date.now() / 1000);
    if (!claims || claims.iss !== config.OIDC_ISSUER || !claims.sub ||
        typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        (claims.iat !== undefined && (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > now + 30))) {
      throw new Error('UNAUTHORIZED');
    }
    var audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (audiences.indexOf(config.OIDC_AUDIENCE) < 0 ||
        typeof claims.email !== 'string' || claims.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
        (config.OIDC_REQUIRE_EMAIL_VERIFIED !== 'false' && claims.email_verified !== true)) {
      throw new Error('FORBIDDEN');
    }
    return { email: claims.email.trim().toLowerCase(), sub: claims.sub };
  } catch (error) {
    if (error.message === 'FORBIDDEN') throw error;
    throw new Error('UNAUTHORIZED');
  }
}

function dispatch_(request) {
  if (!request || typeof request !== 'object') throw new Error('BAD_REQUEST');
  var config = configuration_();
  var identity = verifyJwt_(request.accessToken, config);
  if (['list', 'create', 'update', 'delete'].indexOf(request.action) < 0) throw new Error('BAD_REQUEST');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('BUSY');
  try {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, identity.email);
    var name = 'u_' + digest.map(function (byte) {
      return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
    }).join('');
    var book = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    var sheet = book.getSheetByName(name);
    if (!sheet) {
      sheet = book.insertSheet(name);
      sheet.appendRow(['id', 'tool_json']);
      sheet.setFrozenRows(1);
    }
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
    if (request.action === 'list') {
      return { email: identity.email, tools: rows.map(function (row) { return JSON.parse(row[1]); }) };
    }
    var index = rows.findIndex(function (row) { return row[0] === request.id; });
    if (request.action !== 'create' && index < 0) throw new Error('NOT_FOUND');
    if (request.action === 'delete') {
      sheet.deleteRow(index + 2);
      return { id: request.id };
    }
    var tool = validateTool_(request.tool);
    tool.id = request.action === 'create' ? Utilities.getUuid() : request.id;
    tool.updatedAt = new Date().toISOString();
    tool.createdAt = request.action === 'create' ? tool.updatedAt : JSON.parse(rows[index][1]).createdAt;
    var values = [tool.id, JSON.stringify(tool)];
    if (request.action === 'create') sheet.appendRow(values);
    else sheet.getRange(index + 2, 1, 1, 2).setValues([values]);
    return tool;
  } finally {
    lock.releaseLock();
  }
}

function validateTool_(input) {
  if (!input || typeof input !== 'object') throw new Error('BAD_REQUEST');
  var tool = {};
  var limits = { name: 100, category: 40, description: 1000, condition: 40 };
  Object.keys(limits).forEach(function (key) {
    if (typeof input[key] !== 'string' || input[key].trim().length > limits[key]) throw new Error('BAD_REQUEST');
    tool[key] = input[key].trim();
  });
  if (!tool.name || ['Percage', 'Decoupe', 'Jardin', 'Mesure', 'A main', 'Autre'].indexOf(tool.category) < 0 ||
      ['Tres bon', 'Bon', 'Usage'].indexOf(tool.condition) < 0 || typeof input.shared !== 'boolean') {
    throw new Error('BAD_REQUEST');
  }
  tool.shared = input.shared;
  return tool;
}