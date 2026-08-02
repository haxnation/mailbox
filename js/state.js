// =============================================================
// STATE
// =============================================================
const state = {
    user:             null,
    currentMailbox:   null,
    currentFolder:    'inbox',       // inbox | starred | sent | trash
    currentEmails:    [],            // raw emails from API
    displayEmails:    [],            // after filter/sort/group
    selectedIndex:    -1,            // keyboard nav index
    openEmail:        null,          // currently open email object
    searchQuery:      '',
    sortKey:          'timestamp-desc',
    autoRefreshTimer: null,
    lastEmailIds:     new Set(),
    mailboxes:        [],
    // Attachment state for compose
    pendingAttachments: [],  // [{ key, filename, size, status: 'uploading'|'done'|'error' }]
    composePreviewMode: false,
};


// =============================================================
// LOCALSTORAGE HELPERS (Phases 1, 3, 5)
// =============================================================
function lsGet(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Read state
function markRead(id) {
    const r = lsGet('wm_read', {});
    r[id] = true;
    lsSet('wm_read', r);
}
function isRead(id) {
    return lsGet('wm_read', {})[id] === true;
}

// Star state
function toggleStar(id) {
    const s = lsGet('wm_starred', {});
    if (s[id]) delete s[id]; else s[id] = true;
    lsSet('wm_starred', s);
    return !!lsGet('wm_starred', {})[id];
}
function isStarred(id) {
    return lsGet('wm_starred', {})[id] === true;
}

// Labels
const LABEL_DEFS = [
    { id: 'work',      name: 'Work',      color: '#1a73e8' },
    { id: 'personal',  name: 'Personal',  color: '#34a853' },
    { id: 'finance',   name: 'Finance',   color: '#e37400' },
    { id: 'important', name: 'Important', color: '#d93025' },
    { id: 'later',     name: 'Later',     color: '#9c27b0' },
    { id: 'follow-up', name: 'Follow-up', color: '#00acc1' },
];

function getLabels(id) {
    return lsGet('wm_labels', {})[id] || [];
}
function addLabel(id, labelId) {
    const all = lsGet('wm_labels', {});
    if (!all[id]) all[id] = [];
    if (!all[id].includes(labelId)) all[id].push(labelId);
    lsSet('wm_labels', all);
}
function removeLabel(id, labelId) {
    const all = lsGet('wm_labels', {});
    if (all[id]) all[id] = all[id].filter(l => l !== labelId);
    lsSet('wm_labels', all);
}


