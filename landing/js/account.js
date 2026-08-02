import {
  getUser,
  signIn,
  signUp,
  signOut,
  formatAuthError,
  fetchLatestInstaller,
  getUserInitial,
  formatMemberSince,
  subscribeToAuth,
} from '/js/site.js';

document.getElementById('year').textContent = new Date().getFullYear();

const loadingEl = document.getElementById('account-loading');
const guestEl = document.getElementById('account-guest');
const dashboardEl = document.getElementById('account-dashboard');
const form = document.getElementById('auth-form');
const guestTitle = document.getElementById('guest-title');
const guestLead = document.getElementById('guest-lead');
const submitBtn = document.getElementById('auth-submit');
const errorEl = document.getElementById('auth-error');
const infoEl = document.getElementById('auth-info');
const tabButtons = document.querySelectorAll('[data-mode]');
const signOutBtn = document.getElementById('sign-out');
const profileAvatar = document.getElementById('profile-avatar');
const profileEmail = document.getElementById('profile-email');
const profileSince = document.getElementById('profile-since');
const releaseVersion = document.getElementById('release-version');
const releaseSize = document.getElementById('release-size');
const downloadBtn = document.getElementById('download-btn');
const downloadError = document.getElementById('download-error');

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
    ? 'Access your account and download the lifev1 desktop app.'
    : 'Set up your account to unlock downloads and cloud sync.';
  submitBtn.textContent = isSignIn ? 'Sign in' : 'Create account';
  errorEl.hidden = true;
  infoEl.hidden = true;
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

function showGuest() {
  loadingEl.hidden = true;
  dashboardEl.hidden = true;
  guestEl.hidden = false;
}

function showDashboard() {
  loadingEl.hidden = true;
  guestEl.hidden = true;
  dashboardEl.hidden = false;
}

async function loadRelease() {
  downloadError.hidden = true;
  downloadBtn.hidden = true;

  try {
    const release = await fetchLatestInstaller();
    releaseVersion.textContent = release.version;
    releaseSize.textContent = release.sizeMb ? `${release.sizeMb} MB` : '—';
    downloadBtn.href = release.url;
    downloadBtn.setAttribute('download', release.name);
    downloadBtn.hidden = false;

    if (window.location.hash === '#download') {
      document.getElementById('download-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    downloadError.textContent = error.message || 'Could not load the installer.';
    downloadError.hidden = false;
  }
}

async function renderDashboard(user) {
  profileAvatar.textContent = getUserInitial(user);
  profileEmail.textContent = user.email;
  profileSince.textContent = formatMemberSince(user);
  showDashboard();
  await loadRelease();
}

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
      await renderDashboard(result.user);
      form.reset();
      return;
    }

    const result = await signIn(email, password);
    await renderDashboard(result.user);
    form.reset();
  } catch (error) {
    errorEl.textContent = formatAuthError(error);
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
  showGuest();
});

async function init() {
  const user = await getUser();
  if (user) {
    await renderDashboard(user);
  } else {
    showGuest();
  }
}

subscribeToAuth(async (user) => {
  if (user && dashboardEl.hidden) {
    await renderDashboard(user);
  }
  if (!user && !guestEl.hidden) {
    showGuest();
  }
});

init();
