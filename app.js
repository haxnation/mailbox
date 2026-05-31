// =============================================================
// HAXMAIL — Full Gmail-like Frontend
// Phases 1-5: Core UX, Actions, Labels/Threads, Notifications, Polish
// =============================================================

// --- CONFIGURATION ---
const API_URL          = 'https://api.haxnation.org/mail/api';
const OIDC_REDIRECT_URI = 'https://api.haxnation.org/mail/auth/callback';

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

// =============================================================
// EMAIL ID (unique per email)
// =============================================================
function emailId(email) {
    return email.messageId || `${email.mailbox}__${email.timestamp}`;
}

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
// SIGNATURES (Phase 5)
// =============================================================
function getSignatures() { return lsGet('wm_sigs', []); }
function saveSignatures(sigs) { lsSet('wm_sigs', sigs); }
function getActiveSig() { return lsGet('wm_active_sig', null); }
function setActiveSig(id) { lsSet('wm_active_sig', id); }

// =============================================================
// TOAST SYSTEM (Phase 4)
// =============================================================
function showToast(msg, type = 'default', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast${type !== 'default' ? ` ${type}` : ''}`;
    toast.innerHTML = `
        <span class="material-icons-round" style="font-size:18px">${
            type === 'success' ? 'check_circle'
          : type === 'error'   ? 'error'
          : type === 'warning' ? 'warning'
          : 'info'
        }</span>
        <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// =============================================================
// API HELPER
// =============================================================
async function apiCall(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (options.body) options.headers['Content-Type'] = 'application/json';
    options.credentials = 'include';

    const res = await fetch(`${API_URL}${endpoint}`, options);

    if (res.status === 401 || res.status === 403) {
        state.user = null;
        showView('login');
        throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'API request failed');
    }
    return res.json();
}

// =============================================================
// VIEW SYSTEM
// =============================================================
const VIEW_IDS = ['login', 'inbox', 'detail', 'settings', 'admin'];

function showView(name) {
    VIEW_IDS.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(`view-${name}`);
    if (target) {
        target.style.display = 'flex';
        // Ensure flex layout is correct for non-inbox views
        if (name === 'inbox')    target.style.flexDirection = 'column';
        if (name === 'login')    { target.style.alignItems = 'center'; target.style.justifyContent = 'center'; }
    }

    // Update sidebar active
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => el.classList.remove('active'));

    if (name === 'inbox') {
        const folderEl = document.getElementById(`folder-${state.currentFolder}`);
        if (folderEl) folderEl.classList.add('active');
    }
}

// =============================================================
// SAFE HTML EMAIL RENDERING
// =============================================================
function renderSafeHtmlEmail(containerEl, rawHtml) {
    containerEl.innerHTML = '';
    const clean = DOMPurify.sanitize(rawHtml, {
        ALLOW_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','div','span',
                     'a','img','ul','ol','li','table','thead','tbody','tr','td','th',
                     'strong','em','b','i','u','blockquote','pre','code','sup','sub',
                     'style','font','center'],
        ALLOW_ATTR: ['href','src','alt','style','class','width','height','align',
                     'valign','bgcolor','color','border','cellpadding','cellspacing',
                     'colspan','rowspan','face','size'],
        FORBID_TAGS: ['script','iframe','object','embed','form','input','textarea','button'],
        FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur'],
        ALLOW_DATA_ATTR: false
    });

    const htmlDoc = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src * data:;">
<style>body { font-family: Arial, sans-serif; font-size: 14px; color: #333; margin: 8px; }</style>
</head><body>${clean}</body></html>`;

    const blob    = new Blob([htmlDoc], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const iframe  = document.createElement('iframe');
    iframe.src       = blobUrl;
    iframe.sandbox   = '';
    iframe.className = 'email-html-frame';
    iframe.style.width = '100%';
    iframe.style.minHeight = '300px';
    iframe.style.border = 'none';
    iframe.onload = () => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            iframe.style.height = (doc.body.scrollHeight + 20) + 'px';
        } catch { iframe.style.height = '500px'; }
        URL.revokeObjectURL(blobUrl);
    };
    containerEl.appendChild(iframe);
}

// =============================================================
// RELATIVE TIME FORMATTER
// =============================================================
function relativeTime(ts) {
    const now  = Date.now();
    const date = new Date(ts);
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (days < 7) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// =============================================================
// MAILBOX LOADING
// =============================================================
async function loadMailboxes() {
    try {
        const mailboxes = await apiCall('/mailboxes');
        state.mailboxes = mailboxes;

        const list   = document.getElementById('mailbox-list');
        const fromSel = document.getElementById('compose-from');
        list.innerHTML  = '';
        fromSel.innerHTML = '';

        mailboxes.forEach(mbx => {
            // Sidebar entry
            const item = document.createElement('div');
            item.className = 'mailbox-item';
            item.dataset.mailbox = mbx.address;
            const initial = mbx.address[0].toUpperCase();
            item.innerHTML = `
                <div class="mailbox-icon">${initial}</div>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${mbx.address}</span>
                <span class="sidebar-badge" id="mbx-badge-${mbx.address.replace(/[@.]/g,'_')}"></span>`;
            item.onclick = () => selectMailbox(mbx.address);
            list.appendChild(item);

            // Compose from
            if (mbx.canCrud) {
                const opt = document.createElement('option');
                opt.value = mbx.address;
                opt.textContent = mbx.address;
                fromSel.appendChild(opt);
            }
        });

        // Auto-select first mailbox
        if (mailboxes.length > 0) {
            selectMailbox(mailboxes[0].address);
        }

        renderSidebarLabels();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function selectMailbox(address) {
    state.currentMailbox = address;
    state.currentFolder  = 'inbox';

    // Update sidebar active
    document.querySelectorAll('.mailbox-item').forEach(el => {
        el.classList.toggle('active', el.dataset.mailbox === address);
    });
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => {
        el.classList.toggle('active', el.dataset.folder === 'inbox');
    });

    document.getElementById('inbox-title').textContent = 'Inbox';
    showView('inbox');
    loadEmails();
}

// =============================================================
// LOAD EMAILS (with folder support)
// =============================================================
async function loadEmails() {
    if (!state.currentMailbox) return;

    const folder  = state.currentFolder;
    const mailbox = state.currentMailbox;
    const listEl  = document.getElementById('emails-list');
    const emptyEl = document.getElementById('empty-state');

    listEl.innerHTML = '<li style="padding:20px;text-align:center;color:var(--text-muted)"><span class="material-icons-round" style="animation:spin 1s linear infinite;font-size:24px">refresh</span></li>';
    emptyEl.classList.add('hidden');

    try {
        const emails = await apiCall(`/emails/${encodeURIComponent(mailbox)}?folder=${folder}`);
        state.currentEmails = emails;

        // Track IDs for auto-refresh diffing
        state.lastEmailIds = new Set(emails.map(e => emailId(e)));

        renderEmailList();
        updateBadges();
        startAutoRefresh();
    } catch (e) {
        listEl.innerHTML = `<li style="padding:20px;text-align:center;color:var(--danger)">${e.message}</li>`;
    }
}

// =============================================================
// RENDER EMAIL LIST (Phase 1 + 3)
// =============================================================
function renderEmailList() {
    const listEl  = document.getElementById('emails-list');
    const emptyEl = document.getElementById('empty-state');
    const query   = state.searchQuery.toLowerCase();
    const sortKey = state.sortKey;

    // 1. Filter by search
    let emails = state.currentEmails.filter(e => {
        if (!query) return true;
        return (e.from    || '').toLowerCase().includes(query)
            || (e.subject || '').toLowerCase().includes(query)
            || (e.text    || '').toLowerCase().includes(query);
    });

    // 2. Filter by sub-folder (starred)
    if (state.currentFolder === 'starred') {
        emails = emails.filter(e => isStarred(emailId(e)));
    }

    // 3. Sort
    const [field, dir] = sortKey.split('-');
    emails = [...emails].sort((a, b) => {
        let av = a[field] || '', bv = b[field] || '';
        if (field === 'timestamp') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
        else { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    state.displayEmails = emails;

    listEl.innerHTML = '';

    if (emails.length === 0) {
        emptyEl.classList.remove('hidden');
        const icon = emptyEl.querySelector('.empty-icon .material-icons-round');
        if (state.currentFolder === 'trash')   icon && (icon.textContent = 'delete');
        if (state.currentFolder === 'starred')  icon && (icon.textContent = 'star');
        if (state.currentFolder === 'inbox')    icon && (icon.textContent = 'inbox');
        return;
    }

    emptyEl.classList.add('hidden');

    // 4. Group by thread (subject) — Phase 3
    const threads = groupByThread(emails);

    threads.forEach(group => {
        if (group.length === 1) {
            listEl.appendChild(buildEmailRow(group[0], state.displayEmails.indexOf(group[0])));
        } else {
            // Thread group
            const primary = group[0];
            const threadWrap = document.createElement('li');
            threadWrap.style.borderBottom = '1px solid var(--border)';

            const headerEl = document.createElement('div');
            headerEl.className = 'thread-group-header';

            const unreadInThread = group.filter(e => !isRead(emailId(e))).length;
            const starredInThread = group.some(e => isStarred(emailId(e)));

            headerEl.innerHTML = `
                <span class="material-icons-round" style="font-size:18px;color:var(--text-muted);transition:transform 0.2s" data-expanded="false">chevron_right</span>
                <span style="font-weight:${unreadInThread > 0 ? '700' : '400'};color:${unreadInThread > 0 ? 'var(--text-primary)' : 'var(--text-read)'}">
                    ${escHtml(primary.from || 'Unknown')}
                </span>
                <span class="thread-count-badge">${group.length}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:8px;font-size:0.8125rem;color:var(--text-muted)">${escHtml(primary.subject || '(no subject)')}</span>
                ${starredInThread ? '<span class="material-icons-round" style="color:var(--star-color);font-size:18px">star</span>' : ''}
                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px">${relativeTime(primary.timestamp)}</span>`;

            const childrenWrap = document.createElement('ul');
            childrenWrap.style.display = 'none';
            childrenWrap.style.listStyle = 'none';
            childrenWrap.style.margin = '0';
            childrenWrap.style.padding = '0';

            let expanded = false;
            headerEl.onclick = (e) => {
                e.stopPropagation();
                expanded = !expanded;
                childrenWrap.style.display = expanded ? 'block' : 'none';
                const chevron = headerEl.querySelector('.material-icons-round');
                chevron.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
                if (expanded) {
                    // Open the first unread or the first email
                    const first = group.find(e => !isRead(emailId(e))) || group[0];
                    openEmailDetail(first);
                }
            };

            group.forEach(email => {
                const row = buildEmailRow(email, state.displayEmails.indexOf(email));
                row.classList.add('thread-child');
                childrenWrap.appendChild(row);
            });

            threadWrap.appendChild(headerEl);
            threadWrap.appendChild(childrenWrap);
            listEl.appendChild(threadWrap);
        }
    });

    // Restore keyboard selection highlight
    highlightSelectedRow();
}

function buildEmailRow(email, index) {
    const id      = emailId(email);
    const read    = isRead(id);
    const starred = isStarred(id);
    const labels  = getLabels(id);

    const li = document.createElement('li');
    li.className   = `email-row${read ? ' read' : ''}`;
    li.dataset.idx = index;
    li.setAttribute('role', 'listitem');

    const labelsHtml = labels.map(lid => {
        const def = LABEL_DEFS.find(l => l.id === lid);
        return def ? `<span class="label-chip-mini" style="background:${def.color}">${def.name}</span>` : '';
    }).join('');

    const previewText = (email.text || '').slice(0, 100).replace(/\s+/g, ' ');

    li.innerHTML = `
        <div class="row-star">
            <button class="star-btn${starred ? ' starred' : ''}" data-id="${escHtml(id)}" title="Star">
                <span class="material-icons-round">${starred ? 'star' : 'star_border'}</span>
            </button>
        </div>
        <div class="row-from">
            <span class="email-row-from">${escHtml(formatSenderName(email.from))}</span>
        </div>
        <div class="row-content">
            <span class="email-row-subject">${escHtml(email.subject || '(no subject)')}</span>
            <span class="email-row-preview"> — ${escHtml(previewText)}</span>
            <div class="row-labels">${labelsHtml}</div>
        </div>
        <span class="row-time">${relativeTime(email.timestamp)}</span>
        <div class="row-actions">
            <button class="row-action-btn" data-action="trash" data-id="${escHtml(id)}" data-ts="${escHtml(String(email.timestamp))}" title="Move to Trash">
                <span class="material-icons-round">delete_outline</span>
            </button>
        </div>`;

    // Star click
    li.querySelector('.star-btn').addEventListener('click', e => {
        e.stopPropagation();
        const nowStarred = toggleStar(id);
        const btn = e.currentTarget;
        btn.classList.toggle('starred', nowStarred);
        btn.querySelector('.material-icons-round').textContent = nowStarred ? 'star' : 'star_border';
        updateBadges();
    });

    // Trash click
    li.querySelector('[data-action="trash"]').addEventListener('click', async e => {
        e.stopPropagation();
        await moveToTrash(state.currentMailbox, email.timestamp, id);
    });

    // Row click → open detail
    li.addEventListener('click', () => {
        state.selectedIndex = index;
        openEmailDetail(email);
    });

    return li;
}

// =============================================================
// THREAD GROUPING (Phase 3)
// =============================================================
function normalizeSubject(subj) {
    return (subj || '').toLowerCase()
        .replace(/^(re|fwd?|fw):\s*/gi, '')
        .trim();
}

function groupByThread(emails) {
    const groups = new Map();
    const order  = [];

    emails.forEach(email => {
        const key = normalizeSubject(email.subject);
        if (!groups.has(key)) {
            groups.set(key, []);
            order.push(key);
        }
        groups.get(key).push(email);
    });

    return order.map(k => groups.get(k));
}

// =============================================================
// OPEN EMAIL DETAIL (Phase 1 + 2)
// =============================================================
function openEmailDetail(email) {
    const id = emailId(email);
    state.openEmail = email;

    // Mark as read
    markRead(id);
    // Update row styling live
    const row = document.querySelector(`.email-row[data-idx="${state.displayEmails.indexOf(email)}"]`);
    if (row) row.classList.add('read');

    showView('detail');
    updateBadges();

    // Subject
    document.getElementById('detail-subject').textContent = email.subject || '(no subject)';

    // Back label
    const folderNames = { inbox: 'Inbox', starred: 'Starred', sent: 'Sent', trash: 'Trash' };
    document.getElementById('detail-back-label').textContent = folderNames[state.currentFolder] || 'Inbox';

    // Meta — show To: recipient for sent emails, mailbox for received
    const metaEl = document.getElementById('detail-meta');
    const toAddr = email.to || state.currentMailbox || '';
    metaEl.innerHTML = `
        <div class="meta-row"><span class="meta-label">From</span><span>${escHtml(email.from || 'Unknown')}</span></div>
        <div class="meta-row"><span class="meta-label">To</span><span>${escHtml(toAddr)}</span></div>
        <div class="meta-row"><span class="meta-label">Date</span><span>${new Date(email.timestamp).toLocaleString()}</span></div>`;

    // Star button state
    const starred = isStarred(id);
    document.getElementById('star-detail-icon').textContent = starred ? 'star' : 'star_border';
    const starLbl = document.getElementById('star-detail-label');
    if (starLbl) starLbl.textContent = starred ? 'Unstar' : 'Star';

    // Labels row
    renderDetailLabels(id);

    // Attachments (Phase 5)
    renderAttachments(email);

    // Body
    document.getElementById('detail-text').textContent = email.text || '(No text content)';
    const htmlEl = document.getElementById('detail-html');
    if (email.html) {
        renderSafeHtmlEmail(htmlEl, email.html);
    } else {
        htmlEl.innerHTML = '<p style="color:var(--text-muted)">(No HTML content available)</p>';
    }

    // Default text view
    showBodyView('text');
}

function renderDetailLabels(id) {
    const labels   = getLabels(id);
    const labelsEl = document.getElementById('detail-labels-row');
    labelsEl.innerHTML = '';

    labels.forEach(lid => {
        const def = LABEL_DEFS.find(l => l.id === lid);
        if (!def) return;
        const chip = document.createElement('span');
        chip.className = 'label-chip';
        chip.style.background = def.color;
        chip.innerHTML = `${escHtml(def.name)}<span class="material-icons-round remove-label" title="Remove label">close</span>`;
        chip.querySelector('.remove-label').onclick = () => {
            removeLabel(id, lid);
            renderDetailLabels(id);
            renderEmailList();
        };
        labelsEl.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.id = 'btn-add-label';
    addBtn.innerHTML = `<span class="material-icons-round" style="font-size:14px">add</span> Add label`;
    addBtn.onclick = () => openLabelPicker(id);
    labelsEl.appendChild(addBtn);
}

function renderAttachments(email) {
    const el = document.getElementById('detail-attachments');
    el.innerHTML = '';
    const atts = email.attachments || [];
    if (atts.length === 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    atts.forEach(a => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';
        chip.innerHTML = `<span class="material-icons-round">attach_file</span>
            <span>${escHtml(a.filename)}</span>
            <span style="color:var(--text-muted);font-size:0.75rem">${formatBytes(a.size)}</span>`;
        el.appendChild(chip);
    });
}

function formatBytes(b) {
    if (b < 1024)      return b + ' B';
    if (b < 1048576)   return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

function showBodyView(which) {
    const textEl = document.getElementById('detail-text');
    const htmlEl = document.getElementById('detail-html');
    const txtBtn = document.getElementById('btn-view-text');
    const htmBtn = document.getElementById('btn-view-html');

    if (which === 'text') {
        textEl.style.display = 'block';
        htmlEl.style.display = 'none';
        txtBtn.classList.add('active');
        htmBtn.classList.remove('active');
    } else {
        textEl.style.display = 'none';
        htmlEl.style.display = 'block';
        txtBtn.classList.remove('active');
        htmBtn.classList.add('active');
    }
}

// =============================================================
// DELETE / TRASH (Phase 2)
// =============================================================
async function moveToTrash(mailbox, timestamp, id) {
    try {
        await apiCall(`/emails/${encodeURIComponent(mailbox)}/${encodeURIComponent(timestamp)}`, { method: 'DELETE' });

        // Remove from current display
        state.currentEmails = state.currentEmails.filter(e => emailId(e) !== id);
        renderEmailList();
        updateBadges();

        // If we were viewing detail, go back
        if (state.openEmail && emailId(state.openEmail) === id) {
            showView('inbox');
            state.openEmail = null;
        }

        showToast('Moved to Trash. Emails permanently delete after 30 days.', 'default');
    } catch (e) {
        showToast('Failed to move to trash: ' + e.message, 'error');
    }
}

// =============================================================
// REPLY / FORWARD (Phase 2)
// =============================================================
function replyToEmail(email) {
    const fromSel = document.getElementById('compose-from');
    const toInput  = document.getElementById('compose-to');
    const subjInp  = document.getElementById('compose-subject');
    const bodyEl   = document.getElementById('compose-body');

    // Try to use current mailbox as from
    const options = Array.from(fromSel.options).map(o => o.value);
    if (state.currentMailbox && options.includes(state.currentMailbox)) {
        fromSel.value = state.currentMailbox;
    }

    // Extract reply-to address
    const replyTo = extractEmail(email.from);
    toInput.value  = replyTo;
    subjInp.value  = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`;

    // Quoted body
    const quoted = buildQuoteHtml(email);
    bodyEl.innerHTML = `<br>${quoted}`;
    applySignatureToCompose();
    moveCursorToStart(bodyEl);
    document.getElementById('compose-title').textContent = 'Reply';
    openCompose();
}

function forwardEmail(email) {
    const subjInp = document.getElementById('compose-subject');
    const bodyEl  = document.getElementById('compose-body');
    const toInput = document.getElementById('compose-to');

    toInput.value  = '';
    subjInp.value  = email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`;
    bodyEl.innerHTML = buildQuoteHtml(email);
    applySignatureToCompose();
    document.getElementById('compose-title').textContent = 'Forward';
    openCompose();
}

function buildQuoteHtml(email) {
    const date    = new Date(email.timestamp).toLocaleString();
    const from    = escHtml(email.from || '');
    const content = email.html
        ? DOMPurify.sanitize(email.html, { USE_PROFILES: { html: true } })
        : `<pre style="white-space:pre-wrap">${escHtml(email.text || '')}</pre>`;
    return `<blockquote style="margin:8px 0 8px 16px;padding-left:12px;border-left:3px solid #dadce0;color:#5f6368;">
        <div style="margin-bottom:8px;font-size:0.875rem">On ${date}, <b>${from}</b> wrote:</div>
        ${content}
    </blockquote>`;
}

function extractEmail(str) {
    const match = (str || '').match(/<(.+?)>/);
    return match ? match[1] : (str || '').trim();
}

function moveCursorToStart(el) {
    const range = document.createRange();
    const sel   = window.getSelection();
    range.setStart(el, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
}

// =============================================================
// COMPOSE (Phase 2 + Rich Text + Fullscreen + Phase 4)
// =============================================================
function openCompose(reset = false) {
    const overlay = document.getElementById('compose-overlay');
    overlay.classList.remove('hidden');

    if (reset) {
        document.getElementById('compose-title').textContent = 'New Message';
        document.getElementById('compose-to').value       = '';
        document.getElementById('compose-subject').value  = '';
        document.getElementById('compose-body').innerHTML = '';
        // Reset preview mode
        exitPreviewMode();
        // Reset attachments
        state.pendingAttachments = [];
        renderAttachmentChips();
        applySignatureToCompose();
    }

    document.getElementById('compose-to').focus();
}

function closeCompose() {
    document.getElementById('compose-overlay').classList.add('hidden');
    document.getElementById('compose-overlay').classList.remove('fullscreen');
    document.getElementById('fullscreen-icon').textContent = 'open_in_full';
    exitPreviewMode();
    state.pendingAttachments = [];
    renderAttachmentChips();
}

function applySignatureToCompose() {
    const activeId = getActiveSig();
    if (!activeId) return;
    const sigs = getSignatures();
    const sig  = sigs.find(s => s.id === activeId);
    if (!sig) return;
    const bodyEl = document.getElementById('compose-body');
    // Append signature
    const sigDiv = document.createElement('div');
    sigDiv.className = 'compose-signature';
    sigDiv.textContent = sig.content;
    bodyEl.appendChild(sigDiv);
}

// HTML preview mode (Phase new)
function enterPreviewMode() {
    const bodyEl    = document.getElementById('compose-body');
    const previewEl = document.getElementById('compose-preview');
    const previewHtml = bodyEl.innerHTML;

    // Render the HTML safely inside a sandboxed iframe
    renderSafeHtmlEmail(previewEl, previewHtml);

    bodyEl.style.display    = 'none';
    previewEl.classList.remove('hidden');
    previewEl.style.display = 'block';
    state.composePreviewMode = true;

    const previewBtn = document.getElementById('rb-preview');
    if (previewBtn) previewBtn.style.background = 'var(--accent-light)';
}

function exitPreviewMode() {
    const bodyEl    = document.getElementById('compose-body');
    const previewEl = document.getElementById('compose-preview');

    bodyEl.style.display    = '';
    previewEl.classList.add('hidden');
    previewEl.style.display = 'none';
    previewEl.innerHTML     = '';
    state.composePreviewMode = false;

    const previewBtn = document.getElementById('rb-preview');
    if (previewBtn) previewBtn.style.background = '';
}

// --- ATTACHMENT SYSTEM ---
const ATTACH_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

async function handleFileSelection(files) {
    for (const file of Array.from(files)) {
        if (file.size > ATTACH_MAX_BYTES) {
            showToast(`"${file.name}" exceeds the 5 MB limit.`, 'error');
            continue;
        }

        // Add chip in 'uploading' state
        const chipId = `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        state.pendingAttachments.push({
            chipId,
            key:      null,
            filename: file.name,
            size:     file.size,
            status:   'uploading'
        });
        renderAttachmentChips();

        try {
            // 1. Get presigned upload URL from backend
            const { uploadUrl, attachmentKey } = await apiCall('/attachments/upload-url', {
                method: 'POST',
                body: JSON.stringify({
                    filename:    file.name,
                    contentType: file.type || 'application/octet-stream',
                    size:        file.size
                })
            });

            // 2. Upload directly to S3 via presigned PUT URL
            const uploadRes = await fetch(uploadUrl, {
                method:  'PUT',
                body:    file,
                headers: { 'Content-Type': file.type || 'application/octet-stream' }
            });

            if (!uploadRes.ok) throw new Error('Upload failed');

            // 3. Mark as done
            const att = state.pendingAttachments.find(a => a.chipId === chipId);
            if (att) { att.key = attachmentKey; att.status = 'done'; }

        } catch (err) {
            const att = state.pendingAttachments.find(a => a.chipId === chipId);
            if (att) att.status = 'error';
            showToast(`Failed to upload "${file.name}": ${err.message}`, 'error');
        }

        renderAttachmentChips();
    }
}

function renderAttachmentChips() {
    const container  = document.getElementById('compose-attachments');
    const dropzone   = document.getElementById('compose-dropzone');
    if (!container) return;

    container.innerHTML = '';

    state.pendingAttachments.forEach(att => {
        const chip = document.createElement('div');
        chip.style.cssText = `
            display:inline-flex;align-items:center;gap:6px;
            padding:4px 10px;border-radius:16px;
            background:var(--bg-hover);border:1px solid var(--border);
            font-size:0.8125rem;color:var(--text-secondary);`;

        const icon = att.status === 'uploading' ? 'hourglass_empty'
                   : att.status === 'error'     ? 'error_outline'
                   : 'attach_file';
        const color = att.status === 'error' ? 'var(--danger)' : 'var(--accent)';

        chip.innerHTML = `
            <span class="material-icons-round" style="font-size:16px;color:${color}">${icon}</span>
            <span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(att.filename)}</span>
            <span style="color:var(--text-muted);font-size:0.75rem">(${formatBytes(att.size)})</span>
            ${ att.status !== 'uploading' ? `<button data-chipid="${att.chipId}" style="background:none;border:none;cursor:pointer;padding:0;color:var(--text-muted);display:flex;align-items:center;" title="Remove"><span class="material-icons-round" style="font-size:16px;">close</span></button>` : '' }`;

        if (att.status !== 'uploading') {
            chip.querySelector('button')?.addEventListener('click', () => {
                state.pendingAttachments = state.pendingAttachments.filter(a => a.chipId !== att.chipId);
                renderAttachmentChips();
            });
        }

        container.appendChild(chip);
    });

    // Show/hide drop zone based on whether there are attachments in progress
    const hasAtts = state.pendingAttachments.length > 0;
    if (dropzone) dropzone.classList.toggle('hidden', hasAtts);
}

// Rich text toolbar (Phase 2)
function initRichToolbar() {
    const actions = [
        ['rb-bold',      () => document.execCommand('bold')],
        ['rb-italic',    () => document.execCommand('italic')],
        ['rb-underline', () => document.execCommand('underline')],
        ['rb-ul',        () => document.execCommand('insertUnorderedList')],
        ['rb-ol',        () => document.execCommand('insertOrderedList')],
        ['rb-quote',     () => document.execCommand('formatBlock', false, 'blockquote')],
        ['rb-clear',     () => document.execCommand('removeFormat')],
        ['rb-link',      () => {
            const url = prompt('Enter URL:');
            if (url) document.execCommand('createLink', false, url);
        }],
        ['rb-preview',   () => {
            if (state.composePreviewMode) exitPreviewMode();
            else enterPreviewMode();
        }],
    ];

    actions.forEach(([id, fn]) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
    });
}

// Send compose
async function sendCompose() {
    const from    = document.getElementById('compose-from').value;
    const to      = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const bodyEl  = document.getElementById('compose-body');
    const html    = bodyEl.innerHTML;
    const text    = bodyEl.innerText;

    if (!to || !subject) { showToast('To and Subject are required.', 'warning'); return; }

    // Ensure all attachments are done uploading
    const uploading = state.pendingAttachments.filter(a => a.status === 'uploading');
    if (uploading.length > 0) {
        showToast('Please wait for all attachments to finish uploading.', 'warning');
        return;
    }
    const failedAtts = state.pendingAttachments.filter(a => a.status === 'error');
    if (failedAtts.length > 0) {
        showToast('Remove failed attachments before sending.', 'warning');
        return;
    }

    const attachmentKeys = state.pendingAttachments
        .filter(a => a.status === 'done' && a.key)
        .map(a => a.key);

    // Disable send button during submission
    const sendBtn = document.getElementById('btn-send-compose');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite">refresh</span> Sending...';

    try {
        await apiCall('/emails/send', {
            method: 'POST',
            body: JSON.stringify({ from, to, subject, text, html, attachmentKeys })
        });
        showToast('Email sent!', 'success');
        closeCompose();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="material-icons-round">send</span> Send';
    }
}

// =============================================================
// LABEL PICKER (Phase 3)
// =============================================================
let _labelPickerTargetId = null;

function openLabelPicker(emailIdStr) {
    _labelPickerTargetId = emailIdStr;
    const grid = document.getElementById('label-picker-grid');
    grid.innerHTML = '';
    const current = getLabels(emailIdStr);

    LABEL_DEFS.forEach(def => {
        const item = document.createElement('div');
        item.className = `label-picker-item${current.includes(def.id) ? ' selected' : ''}`;
        item.innerHTML = `<span style="width:14px;height:14px;border-radius:50%;background:${def.color};flex-shrink:0;display:inline-block"></span>${escHtml(def.name)}`;
        item.onclick = () => {
            if (current.includes(def.id)) {
                removeLabel(emailIdStr, def.id);
                item.classList.remove('selected');
                current.splice(current.indexOf(def.id), 1);
            } else {
                addLabel(emailIdStr, def.id);
                item.classList.add('selected');
                current.push(def.id);
            }
            renderDetailLabels(emailIdStr);
            renderEmailList();
            renderSidebarLabels();
        };
        grid.appendChild(item);
    });

    document.getElementById('modal-label-picker').classList.remove('hidden');
}

// =============================================================
// SIDEBAR LABELS (Phase 3)
// =============================================================
function renderSidebarLabels() {
    const container = document.getElementById('labels-sidebar-list');
    container.innerHTML = '';
    LABEL_DEFS.forEach(def => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.innerHTML = `<span class="sidebar-label-dot" style="background:${def.color}"></span>${escHtml(def.name)}`;
        item.onclick = () => filterByLabel(def.id, def.name);
        container.appendChild(item);
    });
}

function filterByLabel(labelId, labelName) {
    state.searchQuery = '';
    document.getElementById('global-search').value = '';
    document.getElementById('inbox-title').textContent = labelName;
    state.currentFolder = 'inbox'; // use inbox emails but filter by label
    loadEmails().then(() => {
        state.currentEmails = state.currentEmails.filter(e => getLabels(emailId(e)).includes(labelId));
        renderEmailList();
    });
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

// =============================================================
// AUTO-REFRESH + BROWSER NOTIFICATIONS (Phase 4)
// =============================================================
function startAutoRefresh() {
    stopAutoRefresh();
    state.autoRefreshTimer = setInterval(checkNewEmails, 60_000);
}

function stopAutoRefresh() {
    if (state.autoRefreshTimer) {
        clearInterval(state.autoRefreshTimer);
        state.autoRefreshTimer = null;
    }
}

async function checkNewEmails() {
    if (!state.currentMailbox || state.currentFolder !== 'inbox') return;
    try {
        const emails = await apiCall(`/emails/${encodeURIComponent(state.currentMailbox)}?folder=inbox`);
        const newIds = new Set(emails.map(e => emailId(e)));

        // Find genuinely new emails
        const fresh = emails.filter(e => !state.lastEmailIds.has(emailId(e)));

        if (fresh.length > 0) {
            // Show refresh bar
            const bar = document.getElementById('refresh-bar');
            bar.textContent = `${fresh.length} new email${fresh.length > 1 ? 's' : ''} — click to reload`;
            bar.classList.remove('hidden');

            // Browser notification
            if (Notification.permission === 'granted') {
                fresh.forEach(e => {
                    new Notification(`New email from ${formatSenderName(e.from)}`, {
                        body:    e.subject || '(no subject)',
                        icon:    '/favicon.ico',
                        tag:     emailId(e),
                        silent:  false
                    });
                });
            }

            state.lastEmailIds = newIds;
        }
    } catch {}
}

async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

// =============================================================
// KEYBOARD SHORTCUTS (Phase 1 + 4)
// =============================================================
function highlightSelectedRow() {
    document.querySelectorAll('.email-row.selected-kb').forEach(el => el.classList.remove('selected-kb'));
    if (state.selectedIndex >= 0) {
        const row = document.querySelector(`.email-row[data-idx="${state.selectedIndex}"]`);
        if (row) {
            row.classList.add('selected-kb');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        // Don't intercept when typing in inputs
        const tag = document.activeElement?.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                      || document.activeElement?.isContentEditable;

        // Allow Escape anywhere
        if (e.key === 'Escape') {
            if (!document.getElementById('modal-shortcuts').classList.contains('hidden')) {
                document.getElementById('modal-shortcuts').classList.add('hidden');
                return;
            }
            if (!document.getElementById('modal-label-picker').classList.contains('hidden')) {
                document.getElementById('modal-label-picker').classList.add('hidden');
                return;
            }
            if (!document.getElementById('compose-overlay').classList.contains('hidden')) {
                closeCompose();
                return;
            }
            if (document.getElementById('view-detail').style.display !== 'none') {
                showView('inbox');
                return;
            }
            return;
        }

        if (isInput) return;

        const emails = state.displayEmails;

        switch (e.key) {
            case 'j':
                state.selectedIndex = Math.min(state.selectedIndex + 1, emails.length - 1);
                highlightSelectedRow();
                break;
            case 'k':
                state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
                highlightSelectedRow();
                break;
            case 'Enter':
                if (state.selectedIndex >= 0 && emails[state.selectedIndex]) {
                    openEmailDetail(emails[state.selectedIndex]);
                }
                break;
            case 'c':
                openCompose(true);
                break;
            case 'r':
                loadEmails();
                showToast('Refreshed', 'default', 1500);
                break;
            case 's':
                if (state.selectedIndex >= 0 && emails[state.selectedIndex]) {
                    const id = emailId(emails[state.selectedIndex]);
                    const nowStarred = toggleStar(id);
                    renderEmailList();
                    updateBadges();
                    showToast(nowStarred ? 'Starred' : 'Unstarred', 'default', 1500);
                }
                break;
            case '#':
                if (state.selectedIndex >= 0 && emails[state.selectedIndex]) {
                    const email = emails[state.selectedIndex];
                    moveToTrash(state.currentMailbox, email.timestamp, emailId(email));
                }
                break;
            case 'd':
                toggleDarkMode();
                break;
            case '?':
                document.getElementById('modal-shortcuts').classList.remove('hidden');
                break;
        }
    });
}

// =============================================================
// SETTINGS — SIGNATURES (Phase 5)
// =============================================================
function renderSignaturesList() {
    const container = document.getElementById('signatures-list');
    const sigs = getSignatures();
    const active = getActiveSig();
    container.innerHTML = '';

    if (sigs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:12px">No signatures yet.</p>';
        return;
    }

    sigs.forEach(sig => {
        const item = document.createElement('div');
        item.className = 'signature-item';
        item.innerHTML = `
            <div style="flex:1">
                <div style="font-weight:600;font-size:0.875rem;margin-bottom:4px;color:var(--text-primary)">
                    ${escHtml(sig.name)}
                    ${sig.id === active ? '<span class="sig-active-badge">Active</span>' : ''}
                </div>
                <div class="signature-content">${escHtml(sig.content)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                <button class="settings-btn${sig.id === active ? '' : ' primary'}" data-action="activate" data-id="${sig.id}">
                    ${sig.id === active ? 'Deactivate' : 'Activate'}
                </button>
                <button class="settings-btn danger" data-action="delete" data-id="${sig.id}">Delete</button>
            </div>`;
        item.querySelector('[data-action="activate"]').onclick = () => {
            setActiveSig(sig.id === active ? null : sig.id);
            renderSignaturesList();
        };
        item.querySelector('[data-action="delete"]').onclick = () => {
            const updated = getSignatures().filter(s => s.id !== sig.id);
            saveSignatures(updated);
            if (active === sig.id) setActiveSig(null);
            renderSignaturesList();
        };
        container.appendChild(item);
    });
}

// =============================================================
// UTIL
// =============================================================
function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatSenderName(from) {
    if (!from) return 'Unknown';
    const match = from.match(/^"?(.+?)"?\s*<.+>/);
    return match ? match[1].trim() : from.split('@')[0];
}

// =============================================================
// WIRING UP DOM EVENTS
// =============================================================
function initEvents() {

    // ---- Compose buttons ----
    document.getElementById('btn-compose-main').onclick  = () => openCompose(true);
    document.getElementById('btn-compose-close').onclick  = closeCompose;
    document.getElementById('btn-compose-discard').onclick = closeCompose;
    document.getElementById('btn-send-compose').onclick   = sendCompose;

    document.getElementById('btn-compose-fullscreen').onclick = () => {
        const overlay = document.getElementById('compose-overlay');
        const isFs    = overlay.classList.toggle('fullscreen');
        document.getElementById('fullscreen-icon').textContent = isFs ? 'close_fullscreen' : 'open_in_full';
    };

    // ---- Detail view buttons ----
    document.getElementById('detail-back-btn').onclick = () => {
        state.openEmail = null;
        showView('inbox');
    };
    document.getElementById('btn-view-text').onclick = () => showBodyView('text');
    document.getElementById('btn-view-html').onclick = () => showBodyView('html');
    document.getElementById('btn-reply').onclick   = () => state.openEmail && replyToEmail(state.openEmail);
    document.getElementById('btn-forward').onclick = () => state.openEmail && forwardEmail(state.openEmail);
    document.getElementById('btn-delete').onclick  = async () => {
        if (!state.openEmail) return;
        const id = emailId(state.openEmail);
        await moveToTrash(state.currentMailbox, state.openEmail.timestamp, id);
    };
    document.getElementById('btn-star-detail').onclick = () => {
        if (!state.openEmail) return;
        const id = emailId(state.openEmail);
        const nowStarred = toggleStar(id);
        document.getElementById('star-detail-icon').textContent = nowStarred ? 'star' : 'star_border';
        const lbl = document.getElementById('star-detail-label');
        if (lbl) lbl.textContent = nowStarred ? 'Unstar' : 'Star';
        updateBadges();
        renderEmailList();
    };

    // ---- Folder navigation ----
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => {
        el.onclick = () => {
            const folder = el.dataset.folder;
            state.currentFolder = folder;
            state.searchQuery   = '';
            document.getElementById('global-search').value = '';

            const titles = { inbox: 'Inbox', starred: 'Starred', sent: 'Sent', trash: 'Trash' };
            document.getElementById('inbox-title').textContent = titles[folder] || folder;

            document.querySelectorAll('.sidebar-item[data-folder]').forEach(s => s.classList.remove('active'));
            el.classList.add('active');

            showView('inbox');
            loadEmails();
        };
    });

    // ---- Nav links ----
    document.getElementById('nav-settings-link').onclick = () => {
        renderSignaturesList();
        showView('settings');
    };
    document.getElementById('nav-admin-link').onclick = () => showView('admin');
    document.getElementById('nav-logout-link').onclick = async () => {
        try { await apiCall('/auth/logout', { method: 'POST' }); } catch {}
        state.user = null;
        window.location.reload();
    };

    // ---- Search ----
    document.getElementById('global-search').addEventListener('input', e => {
        state.searchQuery = e.target.value;
        renderEmailList();
    });

    // ---- Sort ----
    document.getElementById('sort-select').addEventListener('change', e => {
        state.sortKey = e.target.value;
        renderEmailList();
    });

    // ---- Refresh ----
    document.getElementById('btn-refresh-nav').onclick = () => {
        loadEmails();
        showToast('Refreshed', 'default', 1500);
    };
    document.getElementById('refresh-bar').onclick = () => {
        document.getElementById('refresh-bar').classList.add('hidden');
        loadEmails();
    };

    // ---- Dark mode ----
    document.getElementById('btn-dark-toggle').onclick = toggleDarkMode;

    // ---- Shortcuts ----
    document.getElementById('btn-shortcuts-help').onclick = () =>
        document.getElementById('modal-shortcuts').classList.remove('hidden');
    document.getElementById('btn-close-shortcuts').onclick = () =>
        document.getElementById('modal-shortcuts').classList.add('hidden');
    document.getElementById('modal-shortcuts').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // ---- Label picker ----
    document.getElementById('btn-close-label-picker').onclick = () =>
        document.getElementById('modal-label-picker').classList.add('hidden');
    document.getElementById('modal-label-picker').addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // ---- Login ----
    document.getElementById('btn-login').onclick = () => {
        window.location.href = `${API_URL}/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    };

    // ---- Settings ----
    document.getElementById('btn-generate-smtp').onclick = async () => {
        try {
            const creds = await apiCall('/smtp-credentials', { method: 'POST' });
            const box   = document.getElementById('smtp-credentials');
            box.classList.remove('hidden');
            box.textContent = [
                `SMTP Server:  ${creds.smtpServer}`,
                `Port:         ${creds.port}`,
                `Username:     ${creds.smtpUsername}`,
                `Password:     ${creds.smtpPassword}`
            ].join('\n');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    document.getElementById('btn-save-signature').onclick = () => {
        const name    = document.getElementById('signature-name-input').value.trim();
        const content = document.getElementById('signature-textarea').value.trim();
        if (!name || !content) { showToast('Enter both a name and content.', 'warning'); return; }
        const sigs = getSignatures();
        sigs.push({ id: `sig_${Date.now()}`, name, content });
        saveSignatures(sigs);
        document.getElementById('signature-name-input').value = '';
        document.getElementById('signature-textarea').value   = '';
        renderSignaturesList();
        showToast('Signature saved.', 'success');
    };

    // Density
    document.querySelectorAll('.density-opt').forEach(el => {
        el.onclick = () => applyDensity(el.dataset.density);
    });

    // ---- Attachment button + file input ----
    const attachBtn   = document.getElementById('btn-attach');
    const fileInput   = document.getElementById('attach-file-input');
    const dropzone    = document.getElementById('compose-dropzone');

    if (attachBtn) {
        attachBtn.onclick = () => {
            if (dropzone) dropzone.classList.toggle('hidden');
            if (fileInput) fileInput.click();
        };
    }

    if (fileInput) {
        fileInput.addEventListener('change', e => {
            handleFileSelection(e.target.files);
            e.target.value = '';
        });
    }

    // Drag-and-drop onto compose overlay
    const composeOverlay = document.getElementById('compose-overlay');
    if (composeOverlay) {
        composeOverlay.addEventListener('dragover', e => {
            e.preventDefault();
            if (dropzone) dropzone.classList.remove('hidden');
            dropzone && (dropzone.style.background = 'var(--accent-light)');
        });
        composeOverlay.addEventListener('dragleave', () => {
            dropzone && (dropzone.style.background = '');
        });
        composeOverlay.addEventListener('drop', e => {
            e.preventDefault();
            dropzone && (dropzone.style.background = '');
            if (e.dataTransfer?.files?.length) {
                handleFileSelection(e.dataTransfer.files);
            }
        });
    }

    // ---- Admin ----
    document.getElementById('btn-admin-create-mbx').onclick = async () => {
        const address = document.getElementById('admin-new-mailbox').value.trim();
        if (!address) return;
        try {
            await apiCall('/admin/mailboxes', { method: 'POST', body: JSON.stringify({ address }) });
            showToast('Mailbox created', 'success');
            document.getElementById('admin-new-mailbox').value = '';
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    document.getElementById('admin-assign-form').onsubmit = async e => {
        e.preventDefault();
        const payload = {
            userId:  document.getElementById('assign-user-id').value.trim(),
            address: document.getElementById('assign-address').value.trim(),
            canRead: document.getElementById('assign-read').checked,
            canCrud: document.getElementById('assign-write').checked
        };
        try {
            await apiCall('/admin/assignments', { method: 'POST', body: JSON.stringify(payload) });
            showToast('User assigned successfully', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // ---- Rich toolbar ----
    initRichToolbar();
}

// =============================================================
// INITIALIZATION
// =============================================================
async function init() {
    // Restore preferences (Phase 5)
    const savedDark    = lsGet('wm_dark', false);
    const savedDensity = lsGet('wm_density', 'comfortable');
    applyDarkMode(savedDark);
    applyDensity(savedDensity);

    // Wire up all DOM events
    initEvents();
    initKeyboardShortcuts();

    try {
        const userData = await apiCall('/users/me');
        state.user = userData;

        // Show authed UI
        document.getElementById('top-nav').style.display    = 'flex';
        document.getElementById('sidebar').style.display    = 'flex';
        document.getElementById('sidebar').style.flexDirection = 'column';
        document.getElementById('sidebar').classList.remove('hidden');

        // Avatar
        const avatar = document.getElementById('user-avatar');
        const initial = (userData.name || userData.email || 'U')[0].toUpperCase();
        avatar.textContent = initial;
        avatar.title       = userData.name || userData.email || '';

        // Admin link
        if (userData.userType === 'superadmin') {
            document.getElementById('nav-admin-link').classList.remove('hidden');
        }

        // Request notification permission
        requestNotificationPermission();

        // Load mailboxes (auto-selects first one)
        await loadMailboxes();

    } catch {
        state.user = null;
        showView('login');
        document.getElementById('view-login').style.display = 'flex';
        document.getElementById('view-login').style.alignItems = 'center';
        document.getElementById('view-login').style.justifyContent = 'center';
    }
}

// Add spin animation for loading
const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
document.head.appendChild(spinStyle);

init();
