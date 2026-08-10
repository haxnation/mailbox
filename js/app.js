// =============================================================
// PWA INSTALL PROMPT
// =============================================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showPwaToast();
});

function showPwaToast() {
    if (document.getElementById('pwa-install-toast')) return;
    
    const toastHtml = `
        <div id="pwa-install-toast" style="position: fixed; bottom: 20px; left: 50%; transform: translate(-50%, 150%); opacity: 0; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); z-index: 99999; background: #fff; border: 2px solid #0b0b0b; box-shadow: 4px 4px 0 0 #0b0b0b; padding: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 90vw; width: 350px; font-family: 'JetBrains Mono', monospace, sans-serif;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="/logo.png" alt="Logo" style="width: 32px; height: 32px; object-fit: contain;">
                <div>
                    <h4 style="margin: 0; font-size: 14px; font-weight: bold; color: #0b0b0b;">Install App</h4>
                    <p style="margin: 4px 0 0; font-size: 11px; color: #666;">Add to Home Screen</p>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="btn-pwa-dismiss" style="background: transparent; border: none; font-size: 20px; cursor: pointer; color: #666;">&times;</button>
                <button id="btn-pwa-install" style="background: #5ce1e6; color: #0b0b0b; border: 2px solid #0b0b0b; padding: 6px 12px; font-weight: bold; font-size: 12px; cursor: pointer; box-shadow: 2px 2px 0 0 #0b0b0b;">Install</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', toastHtml);
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const toast = document.getElementById('pwa-install-toast');
            if (toast) {
                toast.style.transform = 'translate(-50%, 0)';
                toast.style.opacity = '1';
            }
        });
    });

    document.getElementById('btn-pwa-dismiss').addEventListener('click', () => {
        const toast = document.getElementById('pwa-install-toast');
        toast.style.transform = 'translate(-50%, 150%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    });

    document.getElementById('btn-pwa-install').addEventListener('click', async () => {
        document.getElementById('pwa-install-toast').remove();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
        }
    });
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
        const emails = (await apiCall(`/emails/${encodeURIComponent(state.currentMailbox)}?folder=inbox`)) || [];
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
// WIRING UP DOM EVENTS
// =============================================================
function initEvents() {

    window.addEventListener('popstate', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view') || 'inbox';
        
        if (view === 'inbox') {
            const folder = urlParams.get('folder') || 'inbox';
            state.currentFolder = folder;
            const titles = { inbox: 'Inbox', starred: 'Starred', sent: 'Sent', trash: 'Trash' };
            document.getElementById('inbox-title').textContent = titles[folder] || folder;
            
            document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => {
                el.classList.toggle('active', el.dataset.folder === folder);
            });
            loadEmails();
        }
        
        // Temporarily bypass showView's pushState for popstate
        VIEW_IDS.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.add('hidden');
        });
        const target = document.getElementById(`view-${view}`);
        if (target) {
            target.classList.remove('hidden');
        }
    });

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
    // Note: btn-view-text, btn-view-html, btn-reply, btn-forward, btn-delete, btn-star-detail
    // are wired dynamically per email card in emailList.js — no static wiring needed here.

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

    // ---- Select All & Trash Selected ----
    document.getElementById('select-all-checkbox').addEventListener('change', e => {
        const checked = e.target.checked;
        document.querySelectorAll('.email-select-cb').forEach(cb => {
            cb.checked = checked;
        });
        toggleTrashSelectedBtn();
    });

    document.getElementById('trash-selected-btn').addEventListener('click', async () => {
        const checked = document.querySelectorAll('.email-select-cb:checked');
        if (checked.length === 0) return;
        const ids = Array.from(checked).map(cb => cb.dataset.id);
        const toDelete = state.currentEmails.filter(e => ids.includes(emailId(e)));
        try {
            await apiCall(`/emails/${encodeURIComponent(state.currentMailbox)}/bulk-delete`, {
                method: 'POST',
                body: JSON.stringify({ timestamps: toDelete.map(e => e.timestamp) })
            });
            state.currentEmails = state.currentEmails.filter(e => !ids.includes(emailId(e)));
            renderEmailList();
            updateBadges();
            showToast('Trash', `Moved ${ids.length} emails to trash`);
        } catch (err) {
            showToast('Error', 'Failed to move some emails to trash', true);
        }
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

    // ---- Mobile Menu ----
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const sidebar = document.getElementById('sidebar');
    if (btnMobileMenu && sidebar) {
        btnMobileMenu.onclick = () => {
            sidebar.classList.toggle('mobile-hidden');
        };
        document.getElementById('content-area').addEventListener('click', (e) => {
            if (window.innerWidth < 768 && !sidebar.classList.contains('mobile-hidden')) {
                if (!sidebar.contains(e.target) && !btnMobileMenu.contains(e.target)) {
                    sidebar.classList.add('mobile-hidden');
                }
            }
        });
    }

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
        const currentPath = window.location.hash || window.location.search || '#/';
        window.location.href = `${AUTH_URL}/auth/login?returnTo=${encodeURIComponent(currentPath)}`;
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
        document.getElementById('top-nav').classList.remove('hidden');
        document.getElementById('sidebar').classList.remove('hidden');

        // Avatar
        const avatar = document.getElementById('user-avatar');
        const initial = (userData.name || userData.email || 'U')[0].toUpperCase();
        avatar.textContent = initial;
        avatar.title       = userData.name || userData.email || '';

        // Admin link
        if (userData.platformRole === 'SUPER_ADMIN') {
            document.getElementById('nav-admin-link').classList.remove('hidden');
        }

        // Request notification permission
        requestNotificationPermission();

        // Load mailboxes (auto-selects first one)
        await loadMailboxes();

    } catch {
        state.user = null;
        showView('login');
        showView('login');
    }
}

// Add spin animation for loading
const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
document.head.appendChild(spinStyle);

init();

