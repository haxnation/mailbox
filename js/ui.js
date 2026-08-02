// =============================================================
// DARK MODE (Phase 5)
// =============================================================
function applyDarkMode(dark) {
    document.body.classList.toggle('dark', dark);
    const icon = document.getElementById('dark-icon');
    if (icon) icon.textContent = dark ? 'light_mode' : 'dark_mode';
    lsSet('wm_dark', dark);
}

function toggleDarkMode() {
    applyDarkMode(!document.body.classList.contains('dark'));
}


// =============================================================
// DENSITY (Phase 5)
// =============================================================
function applyDensity(d) {
    ['compact','comfortable','cozy'].forEach(c => document.body.classList.remove(`density-${c}`));
    document.body.classList.add(`density-${d}`);
    document.querySelectorAll('.density-opt').forEach(el => {
        el.classList.toggle('active', el.dataset.density === d);
    });
    lsSet('wm_density', d);
}


// =============================================================
// VIEW SYSTEM
// =============================================================
const VIEW_IDS = ['login', 'inbox', 'detail', 'settings', 'admin'];

function showView(name) {
    VIEW_IDS.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(`view-${name}`);
    if (target) {
        target.classList.remove('hidden');
    }

    // Update sidebar active
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => el.classList.remove('active'));

    if (name === 'inbox') {
        const folderEl = document.getElementById(`folder-${state.currentFolder}`);
        if (folderEl) folderEl.classList.add('active');
    }
}


// =============================================================
// UNREAD BADGES (Phase 1)
// =============================================================
function updateBadges() {
    // Inbox unread
    const inboxEmails  = state.currentEmails.filter(e => !e.trashedAt && e.folder !== 'sent');
    const inboxUnread  = inboxEmails.filter(e => !isRead(emailId(e))).length;
    const badgeEl      = document.getElementById('badge-inbox');
    if (badgeEl) badgeEl.textContent = inboxUnread > 0 ? inboxUnread : '';

    // Starred
    const starredCount = state.currentEmails.filter(e => isStarred(emailId(e))).length;
    const starBadge    = document.getElementById('badge-starred');
    if (starBadge) starBadge.textContent = starredCount > 0 ? starredCount : '';

    // Sent count
    const sentCount = state.currentEmails.filter(e => e.folder === 'sent' && !e.trashedAt).length;
    const sentBadge = document.getElementById('badge-sent');
    if (sentBadge) sentBadge.textContent = sentCount > 0 ? sentCount : '';

    // Mailbox badge
    const mbxKey   = `mbx-badge-${(state.currentMailbox || '').replace(/[@.]/g, '_')}`;
    const mbxBadge = document.getElementById(mbxKey);
    if (mbxBadge) mbxBadge.textContent = inboxUnread > 0 ? inboxUnread : '';
}


