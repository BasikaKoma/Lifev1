import { getUser, signIn, signUp, formatAuthError, logSiteEvent } from '/js/site.js';

document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('auth-form');
const guestTitle = document.getElementById('guest-title');
const guestLead = document.getElementById('guest-lead');
const submitBtn = document.getElementById('auth-submit');
const errorEl = document.getElementById('auth-error');
const infoEl = document.getElementById('auth-info');
const tabButtons = document.querySelectorAll('[data-mode]');

const params = new URLSearchParams(window.location.search);
const nextUrl = params.get('next') || '/account';
if (params.get('taken') === '1') {
  errorEl.textContent = 'You were signed out because this account signed in from another device or app.';
  errorEl.hidden = false;
}

let mode = 'signin';

function setMode(nextMode) {
  mode = nextMode;
  const isSignIn = mode === 'signin';

  tabButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  guestTitle.textContent = isSignIn ? 'Welcome back' : 'Create your account';
  guestLead.textContent = isSignIn
    ? 'Enter your credentials to continue.'
    : 'Set up your account to unlock downloads and cloud sync.';
  submitBtn.textContent = isSignIn ? 'Sign in' : 'Create account';
  errorEl.hidden = true;
  infoEl.hidden = true;
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  infoEl.hidden = true;
  submitBtn.disabled = true;

  const data = new FormData(form);
  const email = data.get('email');
  const password = data.get('password');

  try {
    if (mode === 'signup') {
      const result = await signUp(email, password);
      if (!result.session) {
        infoEl.textContent = 'Check your email to confirm your account, then sign in.';
        infoEl.hidden = false;
        setMode('signin');
        return;
      }
      await logSiteEvent('login');
      window.location.href = nextUrl;
      return;
    }

    await signIn(email, password);
    await logSiteEvent('login');
    window.location.href = nextUrl;
  } catch (error) {
    errorEl.textContent = formatAuthError(error);
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

getUser()
  .then((user) => {
    if (user) window.location.replace(nextUrl);
  })
  .catch(() => {
    /* show login form */
  });
