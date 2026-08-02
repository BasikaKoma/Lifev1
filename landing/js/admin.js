import {
  getUser,
  isAdmin,
  fetchAdminUserActivity,
  fetchAdminRecentEvents,
  formatDateTime,
  signOut,
} from '/js/site.js';

document.getElementById('year').textContent = new Date().getFullYear();

const loadingEl = document.getElementById('admin-loading');
const contentEl = document.getElementById('admin-content');
const deniedEl = document.getElementById('admin-denied');
const usersBody = document.getElementById('users-body');
const eventsBody = document.getElementById('events-body');
const statUsers = document.getElementById('stat-users');
const statLogins = document.getElementById('stat-logins');
const statDownloads = document.getElementById('stat-downloads');
const signOutBtn = document.getElementById('sign-out');

function showContent() {
  loadingEl.hidden = true;
  deniedEl.hidden = true;
  contentEl.hidden = false;
}

function showDenied() {
  loadingEl.hidden = true;
  contentEl.hidden = true;
  deniedEl.hidden = false;
}

function renderUsers(rows) {
  usersBody.innerHTML = rows
    .map(
      (row) => `
    <tr>
      <td>${row.email}</td>
      <td>${formatDateTime(row.registered_at)}</td>
      <td>${formatDateTime(row.last_login_at)}</td>
      <td>${row.login_count ?? 0}</td>
      <td><span class="admin-pill ${row.has_downloaded ? 'admin-pill--yes' : 'admin-pill--no'}">${row.has_downloaded ? 'Yes' : 'No'}</span></td>
      <td>${formatDateTime(row.last_download_at)}</td>
    </tr>`
    )
    .join('');
}

function renderEvents(rows) {
  eventsBody.innerHTML = rows
    .map(
      (row) => `
    <tr>
      <td>${formatDateTime(row.created_at)}</td>
      <td>${row.email}</td>
      <td><span class="admin-pill admin-pill--${row.event_type}">${row.event_type}</span></td>
    </tr>`
    )
    .join('');
}

function renderStats(users) {
  statUsers.textContent = String(users.length);
  statLogins.textContent = String(
    users.reduce((sum, row) => sum + Number(row.login_count || 0), 0)
  );
  statDownloads.textContent = String(
    users.filter((row) => row.has_downloaded).length
  );
}

async function loadDashboard() {
  const [users, events] = await Promise.all([
    fetchAdminUserActivity(),
    fetchAdminRecentEvents(30),
  ]);
  renderStats(users);
  renderUsers(users);
  renderEvents(events);
  showContent();
}

signOutBtn.addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login';
});

async function init() {
  try {
    const user = await getUser({ refresh: true });
    if (!user) {
      window.location.replace('/login?next=/admin');
      return;
    }
    if (!isAdmin(user)) {
      showDenied();
      return;
    }
    await loadDashboard();
  } catch (error) {
    loadingEl.hidden = false;
    loadingEl.innerHTML = `<p class="account-message account-message--error">${error.message || 'Could not load admin panel.'}</p>`;
  }
}

init();
