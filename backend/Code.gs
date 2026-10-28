function doPost(event) {
  var result;
  try {
    if (!event || !event.postData || event.postData.contents.length > 20000) {
      throw new Error('BAD_REQUEST');
    }
    result = { ok: true, data: dispatch_(JSON.parse(event.postData.contents)) };
  } catch (error) {
    var allowed = ['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BUSY', 'CONFIGURATION', 'PROFILE_REQUIRED'];
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
  var actions = [
    'list', 'create', 'update', 'delete', 'getProfile', 'saveProfile', 'deleteProfile',
    'getFriendStatus', 'listFriends', 'sendFriendRequest', 'respondFriendRequest',
    'removeFriendship', 'listNeighborhoodTools'
  ];
  var profiles;
  if (actions.indexOf(request.action) < 0) throw new Error('BAD_REQUEST');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('BUSY');
  try {
    var book = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    if (['getProfile', 'saveProfile', 'deleteProfile'].indexOf(request.action) >= 0) {
      profiles = profileSheet_(book);
      if (request.action === 'getProfile') return getProfile_(profiles, identity.email);
      if (request.action === 'saveProfile') return saveProfile_(profiles, identity.email, request.profile);
      deleteProfile_(book, profiles, identity.email);
      return { deleted: true };
    }
    profiles = profileSheet_(book);
    if (!profileRow_(profiles, identity.email)) throw new Error('PROFILE_REQUIRED');
    if (['getFriendStatus', 'listFriends', 'sendFriendRequest', 'respondFriendRequest', 'removeFriendship', 'listNeighborhoodTools'].indexOf(request.action) >= 0) {
      var friendships = friendSheet_(book);
      if (request.action === 'getFriendStatus') return getFriendStatus_(friendships, identity.email);
      if (request.action === 'listFriends') return listFriends_(profiles, friendships, identity.email);
      if (request.action === 'sendFriendRequest') return sendFriendRequest_(profiles, friendships, identity.email, request.email);
      if (request.action === 'respondFriendRequest') {
        return respondFriendRequest_(friendships, identity.email, request.email, request.decision);
      }
      if (request.action === 'removeFriendship') {
        return removeFriendship_(friendships, identity.email, request.email);
      }
      return listNeighborhoodTools_(profiles, friendships, identity.email, book);
    }
    var sheetName = userSheetName_(identity.email);
    var sheet = book.getSheetByName(sheetName);
    if (!sheet && request.action === 'list') return { email: identity.email, tools: [] };
    if (!sheet && request.action === 'create') {
      sheet = book.insertSheet(sheetName);
      sheet.appendRow(['id', 'tool_json']);
      sheet.setFrozenRows(1);
    }
    if (!sheet) throw new Error('NOT_FOUND');
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

function userSheetName_(email) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email);
  return 'u_' + digest.map(function (byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function profileSheet_(book) {
  var sheet = book.getSheetByName('Profils');
  if (!sheet) {
    sheet = book.insertSheet('Profils');
    sheet.appendRow(['email', 'nom prénom', 'numéro de téléphone', 'adresse physique']);
    sheet.setFrozenRows(1);
  }
  var headers = sheet.getRange(1, 1, 1, 4).getValues()[0];
  if (headers.join('|') !== 'email|nom prénom|numéro de téléphone|adresse physique') {
    throw new Error('CONFIGURATION');
  }
  return sheet;
}

function profileRow_(sheet, email) {
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  var matches = [];
  rows.forEach(function (row, index) {
    if (profileValue_(row[0]) === email) matches.push(index + 2);
  });
  if (matches.length > 1) throw new Error('INTERNAL');
  return matches.length ? matches[0] : 0;
}

function getProfile_(sheet, email) {
  var row = profileRow_(sheet, email);
  if (!row) return { exists: false, name: '', phone: '', address: '' };
  var values = sheet.getRange(row, 2, 1, 3).getValues()[0];
  return {
    exists: true,
    name: profileValue_(values[0]),
    phone: profileValue_(values[1]),
    address: profileValue_(values[2])
  };
}

function saveProfile_(sheet, email, input) {
  var profile = validateProfile_(input);
  var row = profileRow_(sheet, email);
  var values = [email, profile.name, profile.phone, profile.address].map(sheetText_);
  if (row) sheet.getRange(row, 1, 1, 4).setValues([values]);
  else sheet.appendRow(values);
  profile.exists = true;
  return profile;
}

function deleteProfile_(book, profiles, email) {
  var row = profileRow_(profiles, email);
  var friendships = book.getSheetByName('Amities');
  if (friendships) {
    friendships = friendSheet_(book);
    friendRows_(friendships).filter(function (friendship) {
      return friendship.email1 === email || friendship.email2 === email;
    }).map(function (friendship) { return friendship.row; }).sort(function (a, b) { return b - a; })
      .forEach(function (friendRow) { friendships.deleteRow(friendRow); });
  }
  if (row) profiles.deleteRow(row);
  var tools = book.getSheetByName(userSheetName_(email));
  if (tools) book.deleteSheet(tools);
}

function friendSheet_(book) {
  var sheet = book.getSheetByName('Amities');
  if (!sheet) {
    sheet = book.insertSheet('Amities');
    sheet.appendRow(['email_1', 'email_2', 'demandeur', 'statut']);
    sheet.setFrozenRows(1);
  }
  var headers = sheet.getRange(1, 1, 1, 4).getValues()[0];
  if (headers.join('|') !== 'email_1|email_2|demandeur|statut') throw new Error('CONFIGURATION');
  return sheet;
}

function normalizedEmail_(value) {
  if (typeof value !== 'string' || value.length > 254) throw new Error('BAD_REQUEST');
  var email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BAD_REQUEST');
  return email;
}

function friendPair_(email1, email2) {
  return email1 < email2 ? [email1, email2] : [email2, email1];
}

function friendRows_(sheet) {
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
  var seen = {};
  return rows.map(function (row, index) {
    var email1;
    var email2;
    var requester;
    try {
      email1 = normalizedEmail_(row[0]);
      email2 = normalizedEmail_(row[1]);
      requester = normalizedEmail_(row[2]);
    } catch (error) {
      throw new Error('INTERNAL');
    }
    var pair = friendPair_(email1, email2);
    var key = pair[0] + '\n' + pair[1];
    if (row[0] !== email1 || row[1] !== email2 || row[2] !== requester ||
        email1 === email2 || pair[0] !== email1 || pair[1] !== email2 ||
        (requester !== email1 && requester !== email2) ||
        ['en attente', 'accepté'].indexOf(row[3]) < 0 || seen[key]) {
      throw new Error('INTERNAL');
    }
    seen[key] = true;
    return { row: index + 2, email1: email1, email2: email2, requester: requester, status: row[3] };
  });
}

function getFriendStatus_(sheet, email) {
  var incoming = friendRows_(sheet).filter(function (friendship) {
    return friendship.status === 'en attente' && friendship.requester !== email &&
      (friendship.email1 === email || friendship.email2 === email);
  }).length;
  return { incomingCount: incoming };
}

function listFriends_(profiles, sheet, email) {
  var result = { friends: [], sent: [], received: [] };
  friendRows_(sheet).forEach(function (friendship) {
    if (friendship.email1 !== email && friendship.email2 !== email) return;
    var other = friendship.email1 === email ? friendship.email2 : friendship.email1;
    if (friendship.status === 'accepté') {
      var profile = getProfile_(profiles, other);
      if (!profile.exists) throw new Error('INTERNAL');
      result.friends.push({ email: other, name: profile.name, phone: profile.phone, address: profile.address });
    } else if (friendship.requester === email) {
      result.sent.push({ email: other });
    } else {
      result.received.push({ email: other });
    }
  });
  return result;
}

function sendFriendRequest_(profiles, sheet, sender, recipientValue) {
  var recipient = normalizedEmail_(recipientValue);
  if (recipient === sender) throw new Error('BAD_REQUEST');
  var recipientRow = profileRow_(profiles, recipient);
  if (recipientRow) {
    var pair = friendPair_(sender, recipient);
    var exists = friendRows_(sheet).some(function (friendship) {
      return friendship.email1 === pair[0] && friendship.email2 === pair[1];
    });
    if (!exists) sheet.appendRow([pair[0], pair[1], sender, 'en attente']);
  }
  return { submitted: true };
}

function respondFriendRequest_(sheet, recipient, requesterValue, decision) {
  var requester = normalizedEmail_(requesterValue);
  if (requester === recipient || ['accept', 'decline'].indexOf(decision) < 0) throw new Error('BAD_REQUEST');
  var pair = friendPair_(recipient, requester);
  var friendship = friendRows_(sheet).filter(function (item) {
    return item.email1 === pair[0] && item.email2 === pair[1];
  })[0];
  if (!friendship) throw new Error('NOT_FOUND');
  if (friendship.requester === recipient) throw new Error('FORBIDDEN');
  if (friendship.status !== 'en attente') throw new Error('NOT_FOUND');
  if (decision === 'accept') {
    sheet.getRange(friendship.row, 1, 1, 4).setValues([[
      friendship.email1, friendship.email2, friendship.requester, 'accepté'
    ]]);
    return { status: 'accepté' };
  }
  sheet.deleteRow(friendship.row);
  return { status: 'refusé' };
}

function removeFriendship_(sheet, actor, otherValue) {
  var other = normalizedEmail_(otherValue);
  if (other === actor) throw new Error('BAD_REQUEST');
  var pair = friendPair_(actor, other);
  var friendship = friendRows_(sheet).filter(function (item) {
    return item.email1 === pair[0] && item.email2 === pair[1];
  })[0];
  if (!friendship) throw new Error('NOT_FOUND');
  if (friendship.email1 !== actor && friendship.email2 !== actor) throw new Error('FORBIDDEN');
  sheet.deleteRow(friendship.row);
  return { removed: true };
}

function listNeighborhoodTools_(profiles, friendships, email, book) {
  var tools = [];
  friendRows_(friendships).forEach(function (friendship) {
    if (friendship.status !== 'accepté' || (friendship.email1 !== email && friendship.email2 !== email)) return;
    var ownerEmail = friendship.email1 === email ? friendship.email2 : friendship.email1;
    var profile = getProfile_(profiles, ownerEmail);
    if (!profile.exists) throw new Error('INTERNAL');
    var sheet = book.getSheetByName(userSheetName_(ownerEmail));
    if (!sheet || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (row) {
      var tool = JSON.parse(row[1]);
      if (tool.shared !== true) return;
      tools.push({
        id: tool.id, name: tool.name, category: tool.category, description: tool.description,
        condition: tool.condition, shared: true, ownerEmail: ownerEmail, ownerName: profile.name
      });
    });
  });
  return { tools: tools };
}

function validateProfile_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BAD_REQUEST');
  var limits = { name: 120, phone: 50, address: 500 };
  var profile = {};
  Object.keys(limits).forEach(function (key) {
    var supplied = input[key] === undefined ? '' : input[key];
    if (typeof supplied !== 'string' || /[\u0000-\u001f\u007f\u2028\u2029]/.test(supplied)) {
      throw new Error('BAD_REQUEST');
    }
    var value = supplied.trim();
    if (value.length > limits[key]) throw new Error('BAD_REQUEST');
    profile[key] = value;
  });
  return profile;
}

function sheetText_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function profileValue_(value) {
  var text = String(value || '');
  return /^'(?=[=+\-@])/.test(text) ? text.slice(1) : text;
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