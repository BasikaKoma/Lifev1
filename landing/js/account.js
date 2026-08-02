import {
  getUser,
  signOut,
  fetchLatestInstaller,
  getUserInitial,
  formatMemberSince,
  logSiteEvent,
  isAdmin,
} from '/js/site.js';

document.getElementById('year').textContent = new Date().getFullYear();

const loadingEl = document.getElementById('account-loading');
const dashboardEl = document.getElementById('account-dashboard');
const errorEl = document.getElementById('account-error');
const errorText = document.getElementById('account-error-text');
const signOutBtn = document.getElementById('sign-out');
const profileAvatar = document.getElementById('profile-avatar');
const profileEmail = document.getElementById('profile-email');
const profileSince = document.getElementById('profile-since');
const releaseVersion = document.getElementById('release-version');
const releaseSize = document.getElementById('release-size');
const downloadBtn = document.getElementById('download-btn');
const downloadError = document.getElementById('download-error');

function redirectToLogin() {
  const next = encodeURIComponent('/account');
  window.location.replace(`/login?next=${next}`);
}

function showDashboard() {
  loadingEl.hidden = true;
  loadingEl.classList.remove('is-active');
  errorEl.hidden = true;
  dashboardEl.hidden = false;
  dashboardEl.classList.add('is-active');
}

function showError(message) {
  loadingEl.hidden = true;
  loadingEl.classList.remove('is-active');
  dashboardEl.hidden = true;
  dashboardEl.classList.remove('is-active');
  errorText.textContent = message;
  errorEl.hidden = false;
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

  const adminLink = document.getElementById('admin-link');
  if (adminLink) adminLink.hidden = !isAdmin(user);

  showDashboard();
  loadRelease();
}

signOutBtn.addEventListener('click', async () => {
  try {
    await signOut();
  } finally {
    redirectToLogin();
  }
});

downloadBtn.addEventListener('click', async () => {
  await logSiteEvent('download', {
    version: releaseVersion.textContent,
    file: downloadBtn.getAttribute('download') || null,
  });
});

async function init() {
  loadingEl.classList.add('is-active');
  try {
    const user = await getUser({ refresh: true });
    if (!user) {
      redirectToLogin();
      return;
    }
    await renderDashboard(user);
  } catch (error) {
    if (error?.message === 'Site configuration is missing.') {
      showError('Site configuration is missing. Run npm run landing:config locally.');
      return;
    }
    showError(error.message || 'Could not load your account.');
  }
}

init();
