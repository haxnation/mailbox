// =============================================================
// API HELPER
// =============================================================
const API_URL = 'https://api.haxnation.org/mail/api';
const AUTH_URL = 'https://api.haxnation.org/mail';

async function apiCall(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (options.body) options.headers['Content-Type'] = 'application/json';
    options.credentials = 'include';

    const baseUrl = endpoint.startsWith('/auth') ? AUTH_URL : API_URL;
    const res = await fetch(`${baseUrl}${endpoint}`, options);

    if (res.status === 401 || res.status === 403) {
        state.user = null;
        showView('login');
        throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const err = new Error(errData.error || 'API request failed');
        err.status = res.status;
        throw err;
    }
    return res.json();
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
            const urlParams = new URLSearchParams(window.location.search);
            let view = urlParams.get('view');
            let folder = urlParams.get('folder');
            
            // If the URL asks for login but we are already authenticated, default to inbox
            if (view === 'login') {
                view = 'inbox';
                window.history.replaceState({ view: 'inbox', folder: folder || 'inbox' }, '', `?view=inbox&folder=${folder || 'inbox'}`);
            }

            selectMailbox(mailboxes[0].address, folder || 'inbox', view !== 'inbox' && view ? false : true);

            if (view && view !== 'inbox') {
                if (view === 'settings') renderSignaturesList();
                showView(view);
            }
        }

        renderSidebarLabels();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function selectMailbox(address, folder = 'inbox', doShowView = true) {
    state.currentMailbox = address;
    state.currentFolder  = folder;

    // Update sidebar active
    document.querySelectorAll('.mailbox-item').forEach(el => {
        el.classList.toggle('active', el.dataset.mailbox === address);
    });
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => {
        el.classList.toggle('active', el.dataset.folder === folder);
    });

    const titles = { inbox: 'Inbox', starred: 'Starred', sent: 'Sent', trash: 'Trash' };
    document.getElementById('inbox-title').textContent = titles[folder] || folder;
    
    if (doShowView) {
        showView('inbox');
    }
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
        const emails = (await apiCall(`/emails/${encodeURIComponent(mailbox)}?folder=${folder}`)) || [];
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


