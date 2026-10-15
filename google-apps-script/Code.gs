/**
 * =========================================================
 * MADHOUSE — backend de préinscription (Google Apps Script)
 * =========================================================
 *
 * Ce script reçoit les préinscriptions envoyées par le site
 * (GitHub Pages) et les enregistre dans l'onglet
 * MADHOUSE_REGISTRATIONS du Google Sheet auquel il est rattaché.
 *
 * Installation : voir README.md (parties B et C).
 *
 * Ce que fait le script :
 *  - revalide TOUTES les données (la validation du navigateur ne suffit pas) ;
 *  - nettoie les entrées et empêche l'injection de formules dans le Sheet ;
 *  - génère l'identifiant et la date d'inscription côté serveur ;
 *  - détecte les doublons (e-mail / numéro étudiant) sans révéler les données des autres ;
 *  - bloque les envois simultanés (LockService) et limite le débit global ;
 *  - ne propose AUCUNE route permettant de lire les inscriptions ;
 *  - ne journalise aucune donnée personnelle.
 */

/* ---------------------------------------------------------
   PARAMÈTRES — à vérifier avant le déploiement
   --------------------------------------------------------- */

/** Nom de l'onglet du Google Sheet. */
var SHEET_NAME = 'MADHOUSE_REGISTRATIONS';

/**
 * ID du Google Sheet. À renseigner UNIQUEMENT si le script n'a pas été créé via
 * "Extensions > Apps Script" depuis le Sheet (par ex. projet "Projet sans titre"
 * créé sur script.google.com). Laissez '' si le script est rattaché au Sheet.
 * L'ID est la partie entre /d/ et /edit dans l'URL du Sheet :
 *   https://docs.google.com/spreadsheets/d/<ID>/edit
 * Collez-le seulement dans l'éditeur Apps Script : ne le publiez pas sur GitHub.
 */
var SPREADSHEET_ID = '';

/** Passer à false pour fermer les préinscriptions (le site affichera "closed"). */
var REGISTRATION_OPEN = true;

/** Domaines e-mail acceptés. Doit être IDENTIQUE à CONFIG.ALLOWED_EMAIL_DOMAINS dans script.js. */
var ALLOWED_EMAIL_DOMAINS = ['student.usm.my'];

/** Liste fermée des campus (identique au menu déroulant du site). */
var CAMPUSES = [
  'Main Campus (Penang)',
  'Engineering Campus',
  'Health Campus',
  'Other USM Campus'
];

/** Un humain met plus de 2 secondes à remplir 6 champs : en dessous, c'est un robot. */
var MIN_FILL_TIME_MS = 2000;

/** Limite globale d'inscriptions acceptées par minute (protection contre les abus). */
var MAX_SUBMISSIONS_PER_MINUTE = 30;

/** Statut par défaut d'une nouvelle ligne. */
var DEFAULT_STATUS = 'PRE-REGISTERED';

/** En-têtes des colonnes (ordre obligatoire). */
var HEADERS = [
  'Registration ID',
  'Registration Date',
  'First Name',
  'Last Name',
  'Student Email',
  'Phone Number',
  'USM Student ID',
  'Campus',
  'Consent',
  'Registration Status'
];

/* ---------------------------------------------------------
   POINTS D'ENTRÉE WEB
   --------------------------------------------------------- */

/**
 * GET : simple vérification que le déploiement répond.
 * Ne renvoie JAMAIS de données d'inscription.
 */
function doGet() {
  return jsonResponse_({ ok: true, service: 'madhouse-preregistration', open: REGISTRATION_OPEN });
}

/**
 * POST : réception d'une préinscription.
 * Le site envoie du JSON avec Content-Type text/plain (requête "simple",
 * sans pré-requête CORS). La réponse est toujours du JSON :
 *   { ok: true,  status: 'registered' | 'already_registered' }
 *   { ok: false, error: 'validation', fields: { email: '...' } }
 *   { ok: false, error: 'closed' | 'rejected' | 'conflict' | 'busy' | 'rate_limited' | 'server' }
 */
function doPost(e) {
  try {
    return jsonResponse_(handleRegistration_(e));
  } catch (err) {
    // Uniquement le type d'erreur technique : jamais le contenu de la requête.
    console.error('MADHOUSE doPost failure: ' + (err && err.name) + ' - ' + (err && err.message));
    return jsonResponse_({ ok: false, error: 'server' });
  }
}

/* ---------------------------------------------------------
   TRAITEMENT
   --------------------------------------------------------- */

function handleRegistration_(e) {
  if (!REGISTRATION_OPEN) return { ok: false, error: 'closed' };

  var raw = e && e.postData && e.postData.contents;
  if (!raw || raw.length > 5000) return { ok: false, error: 'rejected' };

  var data;
  try {
    data = JSON.parse(raw);
  } catch (parseError) {
    return { ok: false, error: 'rejected' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'rejected' };

  // Anti-robots : honeypot rempli ou formulaire envoyé trop vite.
  if (data.website) return { ok: false, error: 'rejected' };
  if (typeof data.elapsedMs !== 'number' || data.elapsedMs < MIN_FILL_TIME_MS) return { ok: false, error: 'rejected' };

  var submissionId = String(data.submissionId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(submissionId)) return { ok: false, error: 'rejected' };

  // Validation et nettoyage serveur.
  var result = validateRegistration_(data);
  if (result.errors) return { ok: false, error: 'validation', fields: result.errors };
  var reg = result.values;

  // Verrou : une seule écriture à la fois (évite doublons et lignes écrasées).
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };

  try {
    var cache = CacheService.getScriptCache();

    // Renvoi du même formulaire (double clic, réseau coupé puis nouvel essai) :
    // on renvoie la réponse déjà donnée, sans nouvelle ligne.
    var previous = cache.get('sub:' + submissionId);
    if (previous) return { ok: true, status: previous };

    // Limite de débit globale (Apps Script ne fournit pas l'adresse IP du visiteur).
    var bucket = 'rate:' + Math.floor(Date.now() / 60000);
    var count = Number(cache.get(bucket) || 0);
    if (count >= MAX_SUBMISSIONS_PER_MINUTE) return { ok: false, error: 'rate_limited' };
    cache.put(bucket, String(count + 1), 120);

    var sheet = getRegistrationSheet_();
    var duplicate = findDuplicate_(sheet, reg.email, reg.studentId);

    var status;
    if (duplicate === 'both') {
      // Même personne déjà inscrite : on confirme sans rien ajouter.
      status = 'already_registered';
    } else if (duplicate === 'partial') {
      // E-mail OU numéro étudiant déjà utilisé avec d'autres informations :
      // on refuse sans dire lequel, pour ne rien révéler sur les autres inscrits.
      return { ok: false, error: 'conflict' };
    } else {
      sheet.appendRow([
        'MH-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(),
        new Date(),
        asText_(reg.firstName),
        asText_(reg.lastName),
        asText_(reg.email),
        asText_(reg.phone),
        asText_(reg.studentId),
        asText_(reg.campus),
        'YES',
        DEFAULT_STATUS
      ]);
      SpreadsheetApp.flush(); // écriture effective AVANT de confirmer au site
      status = 'registered';
    }

    cache.put('sub:' + submissionId, status, 21600); // 6 h
    return { ok: true, status: status };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Valide et nettoie les champs. Renvoie { values } ou { errors }.
 * Les messages sont en anglais car affichés tels quels sur le site.
 */
function validateRegistration_(data) {
  var NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var PHONE_RE = /^\+[1-9]\d{7,14}$/;
  var STUDENT_ID_RE = /^[A-Za-z0-9/-]{4,20}$/;

  var str = function (v) { return typeof v === 'string' ? v : ''; };
  var name = function (v) { return str(v).normalize('NFC').replace(/\s+/g, ' ').trim(); };

  var values = {
    firstName: name(data.firstName),
    lastName: name(data.lastName),
    email: str(data.email).trim().toLowerCase(),
    phone: str(data.phone).replace(/[\s().-]/g, ''),
    studentId: str(data.studentId).replace(/\s+/g, '').toUpperCase(),
    campus: str(data.campus)
  };
  var errors = {};

  ['firstName', 'lastName'].forEach(function (key) {
    var label = key === 'firstName' ? 'first name' : 'last name';
    if (!values[key]) errors[key] = 'Please enter your ' + label + '.';
    else if (values[key].length > 50) errors[key] = 'Your ' + label + ' must be 50 characters or fewer.';
    else if (!NAME_RE.test(values[key])) errors[key] = 'Please use letters only (spaces, hyphens and apostrophes are fine).';
  });

  if (!values.email) {
    errors.email = 'Please enter your USM student email address.';
  } else if (values.email.length > 100 || !EMAIL_RE.test(values.email)) {
    errors.email = 'Please enter a valid email address.';
  } else if (ALLOWED_EMAIL_DOMAINS.indexOf(values.email.split('@')[1]) === -1) {
    errors.email = 'Please use your USM student email (@' + ALLOWED_EMAIL_DOMAINS.join(' or @') + ').';
  }

  if (!PHONE_RE.test(values.phone)) {
    errors.phone = 'Please enter a valid phone number with country code (e.g. +60 12 345 6789).';
  }

  if (!STUDENT_ID_RE.test(values.studentId)) {
    errors.studentId = 'Please enter a valid student ID (4–20 letters or numbers).';
  }

  if (CAMPUSES.indexOf(values.campus) === -1) {
    errors.campus = 'Please select a campus from the list.';
  }

  // Le consentement doit être explicitement true (pas "true", pas 1).
  if (data.consent !== true) {
    errors.consent = 'Please tick the box to agree before registering.';
  }

  return Object.keys(errors).length ? { errors: errors } : { values: values };
}

/**
 * Cherche si l'e-mail et/ou le numéro étudiant existent déjà.
 * Renvoie 'both', 'partial' ou null. Ne renvoie jamais les données trouvées.
 */
function findDuplicate_(sheet, email, studentId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  // Colonnes E (Student Email) à G (USM Student ID).
  var rows = sheet.getRange(2, 5, lastRow - 1, 3).getDisplayValues();
  var partial = false;
  for (var i = 0; i < rows.length; i++) {
    var sameEmail = String(rows[i][0]).trim().toLowerCase() === email;
    var sameId = String(rows[i][2]).trim().toUpperCase() === studentId;
    if (sameEmail && sameId) return 'both';
    if (sameEmail || sameId) partial = true;
  }
  return partial ? 'partial' : null;
}

/** Force le stockage en texte brut : pas de formule (=, +, -, @), pas de zéros perdus. */
function asText_(value) {
  return "'" + String(value);
}

/** Renvoie le classeur : par ID si renseigné, sinon celui auquel le script est rattaché. */
function getSpreadsheet_() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet: script is not bound to a Sheet. Set SPREADSHEET_ID.');
  return ss;
}

function getRegistrationSheet_() {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab ' + SHEET_NAME + ' not found. Run setupSheet() once.');
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------
   OUTILS À LANCER À LA MAIN DEPUIS L'ÉDITEUR APPS SCRIPT
   --------------------------------------------------------- */

/**
 * À exécuter UNE fois (menu "Exécuter") : crée l'onglet
 * MADHOUSE_REGISTRATIONS et ses en-têtes s'ils n'existent pas.
 * Sans danger si relancé : n'efface jamais de données.
 */
function setupSheet() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setFontWeight('bold').setBackground('#014F2C').setFontColor('#F3E3BC');
  sheet.setFrozenRows(1);
  sheet.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.setColumnWidths(1, HEADERS.length, 160);

  checkSetup();
}

/**
 * Vérifie la configuration sans rien écrire et sans afficher de données personnelles.
 * Résultat visible dans "Journal d'exécution".
 */
function checkSetup() {
  var sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!sheet) {
    console.log('ERROR: tab "' + SHEET_NAME + '" not found. Run setupSheet().');
    return;
  }
  var headers = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  var mismatch = HEADERS.filter(function (h, i) { return headers[i] !== h; });
  if (mismatch.length) {
    console.log('ERROR: row 1 headers do not match. Expected: ' + HEADERS.join(' | '));
    return;
  }
  console.log('OK: tab "' + SHEET_NAME + '" ready. Registrations stored: ' + Math.max(0, sheet.getLastRow() - 1) +
    '. Registration open: ' + REGISTRATION_OPEN + '.');
}
