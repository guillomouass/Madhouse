/* =========================================================
   MADHOUSE — script du site
   1. Configuration (à renseigner)
   2. Animations légères (respect de prefers-reduced-motion)
   3. Formulaire de préinscription : validation, envoi, états
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURATION — à renseigner avant la mise en ligne
   --------------------------------------------------------- */
const CONFIG = {
  // URL du déploiement "Application Web" Google Apps Script.
  // Elle ressemble à : https://script.google.com/macros/s/XXXXXXXX/exec
  // Voir README.md, partie C. Tant qu'elle est vide, le formulaire
  // affiche "Pre-registration isn't open yet" et n'envoie rien.
  ENDPOINT_URL: 'https://script.google.com/macros/s/AKfycbwVnNnUSmAuBBeMm30Gq9sRmy_SBaGSEbVu4Ajtxvxw8eI0hUkxCvHByVnk5Ih6pSo/exec',

  // Domaines e-mail acceptés. Doit être IDENTIQUE à ALLOWED_EMAIL_DOMAINS dans Code.gs.
  ALLOWED_EMAIL_DOMAINS: ['student.usm.my'],

  // Délai maximum d'attente de la réponse du serveur.
  REQUEST_TIMEOUT_MS: 20000,
};

// Liste fermée des campus (identique à Code.gs).
const CAMPUSES = [
  'Main Campus (Penang)',
  'Engineering Campus',
  'Health Campus',
  'Other USM Campus',
];

/* ---------------------------------------------------------
   2. ANIMATIONS
   --------------------------------------------------------- */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupReveal() {
  const items = document.querySelectorAll('.reveal');
  if (prefersReducedMotion || !('IntersectionObserver' in window)) return; // tout reste visible

  document.documentElement.classList.add('js-motion');

  // Le hero apparaît en cascade dès le chargement.
  document.querySelectorAll('.hero .reveal').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 90, 700)}ms`;
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  items.forEach((el) => observer.observe(el));
}

/* ---------------------------------------------------------
   3. FORMULAIRE
   --------------------------------------------------------- */
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;           // format international E.164
const STUDENT_ID_RE = /^[A-Za-z0-9/-]{4,20}$/;

// Nettoyage identique à celui du serveur.
const clean = {
  name: (v) => v.normalize('NFC').replace(/\s+/g, ' ').trim(),
  email: (v) => v.trim().toLowerCase(),
  phone: (v) => v.replace(/[\s().-]/g, ''),
  studentId: (v) => v.replace(/\s+/g, '').toUpperCase(),
};

// Chaque règle renvoie un message d'erreur, ou '' si la valeur est correcte.
const validators = {
  firstName(v) {
    v = clean.name(v);
    if (!v) return 'Please enter your first name.';
    if (v.length > 50) return 'Your first name must be 50 characters or fewer.';
    if (!NAME_RE.test(v)) return 'Please use letters only (spaces, hyphens and apostrophes are fine).';
    return '';
  },
  lastName(v) {
    v = clean.name(v);
    if (!v) return 'Please enter your last name.';
    if (v.length > 50) return 'Your last name must be 50 characters or fewer.';
    if (!NAME_RE.test(v)) return 'Please use letters only (spaces, hyphens and apostrophes are fine).';
    return '';
  },
  email(v) {
    v = clean.email(v);
    if (!v) return 'Please enter your USM student email address.';
    if (v.length > 100 || !EMAIL_RE.test(v)) return 'Please enter a valid email address.';
    const domain = v.split('@')[1];
    if (!CONFIG.ALLOWED_EMAIL_DOMAINS.includes(domain)) {
      return `Please use your USM student email (@${CONFIG.ALLOWED_EMAIL_DOMAINS.join(' or @')}).`;
    }
    return '';
  },
  phone(v) {
    v = clean.phone(v);
    if (!v) return 'Please enter your phone number.';
    if (!v.startsWith('+')) return 'Please start with + and your country code (e.g. +60).';
    if (!PHONE_RE.test(v)) return 'Please enter a valid phone number with country code (e.g. +60 12 345 6789).';
    return '';
  },
  studentId(v) {
    v = clean.studentId(v);
    if (!v) return 'Please enter your USM student ID.';
    if (!STUDENT_ID_RE.test(v)) return 'Please enter a valid student ID (4–20 letters or numbers).';
    return '';
  },
  campus(v) {
    if (!v) return 'Please select your campus.';
    if (!CAMPUSES.includes(v)) return 'Please select a campus from the list.';
    return '';
  },
  consent(_, input) {
    return input.checked ? '' : 'Please tick the box to agree before registering.';
  },
};

// Messages affichés selon le code d'erreur renvoyé par le serveur
// (ou détecté côté navigateur). Aucun ne contient de donnée personnelle.
const ERROR_MESSAGES = {
  not_configured: "Pre-registration isn't open yet. Please check back soon or follow @madhouse.penang on Instagram.",
  closed: 'Pre-registration is currently closed. Follow @madhouse.penang on Instagram for updates.',
  validation: 'Some details need fixing. Please check the highlighted fields.',
  conflict: 'This email address or student ID has already been used for a pre-registration. If you think this is a mistake, message us on Instagram @madhouse.penang.',
  rate_limited:'Lots of people are registering right now. Please wait a minute and try again.',
  busy: 'Lots of people are registering right now. Please wait a minute and try again.',
  rejected: "We couldn't process this registration. Please reload the page and try again.",
  timeout: "The server took too long to answer. Please try again — if your first attempt went through, you won't be registered twice.",
  network: "We couldn't reach our server. Check your internet connection and try again.",
  server: "Something went wrong on our side and your registration couldn't be confirmed. Please try again in a few minutes — you won't be registered twice.",
};

class SubmitError extends Error {
  constructor(code, fields) {
    super(code);
    this.code = code;
    this.fields = fields || null;
  }
}

/** Envoie les données au backend Apps Script et renvoie sa réponse JSON.
 *  - Content-Type text/plain : requête "simple", donc pas de pré-requête CORS
 *    (Apps Script ne sait pas répondre aux requêtes OPTIONS).
 *  - Apps Script répond par une redirection 302 vers script.googleusercontent.com,
 *    qui renvoie le JSON avec l'en-tête Access-Control-Allow-Origin: *.
 *    fetch suit la redirection et le navigateur peut LIRE la réponse :
 *    on sait donc réellement si la ligne a été enregistrée. */
async function sendRegistration(payload) {
  if (!CONFIG.ENDPOINT_URL) throw new SubmitError('not_configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(CONFIG.ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    throw new SubmitError(err.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new SubmitError('server');

  let data;
  try {
    data = await response.json();
  } catch {
    throw new SubmitError('server'); // réponse non JSON (page d'erreur Google, etc.)
  }

  if (data && data.ok === true && (data.status === 'registered' || data.status === 'already_registered')) {
    return data;
  }
  const code = data && typeof data.error === 'string' && ERROR_MESSAGES[data.error] ? data.error : 'server';
  throw new SubmitError(code, data && data.fields);
}

function newSubmissionId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function setupForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  const button = document.getElementById('submit-btn');
  const buttonLabel = button.querySelector('.btn__label');
  const status = document.getElementById('form-status');
  const summary = document.getElementById('form-summary');
  const success = document.getElementById('success');
  const loadedAt = Date.now();

  const fieldNames = Object.keys(validators);
  const touched = new Set();
  let isSubmitting = false;
  let lastPayloadKey = '';
  let submissionId = newSubmissionId();

  const inputOf = (name) => form.elements[name];
  const valueOf = (name) => {
    const input = inputOf(name);
    return input.type === 'checkbox' ? input.checked : input.value;
  };

  function showFieldError(name, message) {
    const input = inputOf(name);
    const wrapper = input.closest('.field');
    const errorEl = document.getElementById(`${name}-error`);
    errorEl.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    wrapper.classList.toggle('is-invalid', Boolean(message));
    wrapper.classList.toggle('is-valid', !message && touched.has(name) && input.type !== 'checkbox');
  }

  function validateField(name) {
    const message = validators[name](valueOf(name), inputOf(name));
    showFieldError(name, message);
    return message;
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function setLoading(loading) {
    isSubmitting = loading;
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    button.setAttribute('aria-busy', String(loading));
    buttonLabel.textContent = loading ? 'Sending…' : 'Register my interest';
  }

  function showSummary(message, moveFocus) {
    summary.textContent = message;
    summary.hidden = false;
    if (moveFocus) summary.focus();
  }

  // Validation en direct : au départ du champ, puis à chaque frappe une fois touché.
  fieldNames.forEach((name) => {
    const input = inputOf(name);
    input.addEventListener('blur', () => {
      if (input.type === 'checkbox') return;
      if (input.value !== '' || touched.has(name)) {
        touched.add(name);
        validateField(name);
      }
    });
    input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', () => {
      if (input.tagName === 'SELECT' || input.type === 'checkbox') touched.add(name);
      if (touched.has(name)) validateField(name);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return; // protection contre le double envoi

    summary.hidden = true;
    setStatus('', false);

    // 1. Validation complète côté navigateur (confort uniquement : le serveur revalide tout).
    fieldNames.forEach((name) => touched.add(name));
    const errors = fieldNames.filter((name) => validateField(name));
    if (errors.length) {
      showSummary(errors.length === 1
        ? 'Please fix 1 field before registering.'
        : `Please fix ${errors.length} fields before registering.`);
      inputOf(errors[0]).focus({ preventScroll: true });
      inputOf(errors[0]).scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      return;
    }

    // 2. Données nettoyées.
    const payload = {
      firstName: clean.name(valueOf('firstName')),
      lastName: clean.name(valueOf('lastName')),
      email: clean.email(valueOf('email')),
      phone: clean.phone(valueOf('phone')),
      studentId: clean.studentId(valueOf('studentId')),
      campus: valueOf('campus'),
      consent: valueOf('consent') === true,
      website: inputOf('website').value, // honeypot (doit rester vide)
      elapsedMs: Date.now() - loadedAt,
    };

    // Même contenu renvoyé après un échec = même identifiant de soumission :
    // le serveur reconnaît alors un renvoi et n'ajoute pas de seconde ligne.
    const payloadKey = JSON.stringify(payload, ['firstName', 'lastName', 'email', 'phone', 'studentId', 'campus']);
    if (payloadKey !== lastPayloadKey) {
      submissionId = newSubmissionId();
      lastPayloadKey = payloadKey;
    }
    payload.submissionId = submissionId;

    // 3. Envoi.
    setLoading(true);
    setStatus('Sending your registration…', false);

    try {
      const result = await sendRegistration(payload);
      // 4. Confirmation UNIQUEMENT après la réponse positive du serveur.
      setStatus('', false);
      form.hidden = true;
      document.getElementById('success-already').hidden = result.status !== 'already_registered';
      success.hidden = false;
      success.classList.add('is-shown');
      success.focus();
    } catch (err) {
      const code = err instanceof SubmitError ? err.code : 'server';
      if (code === 'validation' && err.fields) {
        Object.entries(err.fields).forEach(([name, message]) => {
          if (validators[name]) showFieldError(name, String(message));
        });
      }
      setStatus('', false);
      showSummary(ERROR_MESSAGES[code] || ERROR_MESSAGES.server, true);
      if (code === 'not_configured') {
        // Message technique pour la personne qui déploie le site (aucune donnée personnelle).
        console.warn('MADHOUSE: CONFIG.ENDPOINT_URL is empty in script.js — see README, section D.');
      }
    } finally {
      setLoading(false);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  window.MADHOUSE_READY = true;
  setupReveal();
  setupForm();
});
