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
    state.displayThreads = threads;

    threads.forEach((group, index) => {
        listEl.appendChild(buildThreadRow(group, index));
    });

    // Restore keyboard selection highlight
    highlightSelectedRow();

    // Clear selection state
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
    }
    toggleTrashSelectedBtn();
}

function toggleTrashSelectedBtn() {
    const btn = document.getElementById('trash-selected-btn');
    if (!btn) return;
    const checked = document.querySelectorAll('.email-select-cb:checked');
    if (checked.length > 0) {
        btn.classList.remove('hidden');
        btn.classList.add('flex');
    } else {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
    }
}

function updateSelectAllState() {
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (!selectAllCb) return;
    const cbs = document.querySelectorAll('.email-select-cb');
    const checked = document.querySelectorAll('.email-select-cb:checked');
    selectAllCb.checked = cbs.length > 0 && checked.length === cbs.length;
    selectAllCb.indeterminate = checked.length > 0 && checked.length < cbs.length;
}

function buildThreadRow(group, index) {
    // The most recent email (first in group, assuming pre-sorted or we just use the first)
    const primary = group[0];
    const id = emailId(primary);

    // Unread if ANY email in thread is unread
    const isUnread = group.some(e => !isRead(emailId(e)));
    const read = !isUnread;

    // Starred if ANY email in thread is starred
    const starred = group.some(e => isStarred(emailId(e)));

    // Aggregate labels across the thread
    const allLabels = new Set();
    group.forEach(e => getLabels(emailId(e)).forEach(l => allLabels.add(l)));
    const labelsHtml = Array.from(allLabels).map(lid => {
        const def = LABEL_DEFS.find(l => l.id === lid);
        return def ? `<span class="label-chip-mini" style="background:${def.color}">${def.name}</span>` : '';
    }).join('');

    // Summarize senders
    let sendersStr = '';
    if (group.length === 1) {
        sendersStr = formatSenderName(primary.from);
    } else {
        // Collect unique senders
        const uniqueSenders = new Set(group.map(e => formatSenderName(e.from)));
        sendersStr = Array.from(uniqueSenders).join(', ');
    }

    const li = document.createElement('li');
    li.className   = `email-row${read ? ' read' : ''}`;
    li.dataset.idx = index;
    li.setAttribute('role', 'listitem');

    const previewText = (primary.text || '').slice(0, 100).replace(/\s+/g, ' ');

    li.innerHTML = `
        <div class="row-checkbox" style="padding-left: 16px; display: flex; align-items: center;">
            <input type="checkbox" class="email-select-cb" data-id="${escHtml(id)}" style="cursor:pointer;" />
        </div>
        <div class="row-star">
            <button class="star-btn${starred ? ' starred' : ''}" data-id="${escHtml(id)}" title="Star">
                <span class="material-icons-round">${starred ? 'star' : 'star_border'}</span>
            </button>
        </div>
        <div class="row-from flex items-center gap-1">
            <span class="email-row-from flex-1 truncate">${escHtml(sendersStr)}</span>
            ${group.length > 1 ? `<span class="text-xs bg-border px-1.5 rounded text-text-secondary">${group.length}</span>` : ''}
        </div>
        <div class="row-content">
            <span class="email-row-subject">${escHtml(primary.subject || '(no subject)')}</span>
            <span class="email-row-preview"> — ${escHtml(previewText)}</span>
            <div class="row-labels">${labelsHtml}</div>
        </div>
        <span class="row-time">${relativeTime(primary.timestamp)}</span>
        <div class="row-actions">
            ${state.currentFolder === 'trash' ? `
                <button class="row-action-btn" data-action="recover" data-id="${escHtml(id)}" data-ts="${escHtml(String(primary.timestamp))}" title="Recover">
                    <span class="material-icons-round">restore</span>
                </button>
                <button class="row-action-btn" data-action="perm-delete" data-id="${escHtml(id)}" data-ts="${escHtml(String(primary.timestamp))}" title="Permanently Delete">
                    <span class="material-icons-round">delete_forever</span>
                </button>
            ` : `
                <button class="row-action-btn" data-action="trash" data-id="${escHtml(id)}" data-ts="${escHtml(String(primary.timestamp))}" title="Move to Trash">
                    <span class="material-icons-round">delete_outline</span>
                </button>
            `}
        </div>`;

    // Checkbox click
    const cb = li.querySelector('.email-select-cb');
    if (cb) {
        cb.addEventListener('click', e => {
            e.stopPropagation();
            toggleTrashSelectedBtn();
            updateSelectAllState();
        });
    }

    // Star click (stars all emails in the thread)
    li.querySelector('.star-btn').addEventListener('click', e => {
        e.stopPropagation();
        let nowStarred = false;
        group.forEach(e => {
            nowStarred = toggleStar(emailId(e)) || nowStarred;
        });
        const btn = e.currentTarget;
        btn.classList.toggle('starred', nowStarred);
        btn.querySelector('.material-icons-round').textContent = nowStarred ? 'star' : 'star_border';
        updateBadges();
    });

    // Trash click (trashes all emails in thread)
    const trashBtn = li.querySelector('[data-action="trash"]');
    if (trashBtn) {
        trashBtn.addEventListener('click', async e => {
            e.stopPropagation();
            for (const email of group) {
                await moveToTrash(state.currentMailbox, email.timestamp, emailId(email));
            }
        });
    }

    // Recover click (recovers all emails in thread)
    const recoverBtn = li.querySelector('[data-action="recover"]');
    if (recoverBtn) {
        recoverBtn.addEventListener('click', async e => {
            e.stopPropagation();
            for (const email of group) {
                await recoverEmail(state.currentMailbox, email.timestamp, emailId(email));
            }
        });
    }

    // Permanent Delete click (deletes all emails in thread)
    const permDelBtn = li.querySelector('[data-action="perm-delete"]');
    if (permDelBtn) {
        permDelBtn.addEventListener('click', async e => {
            e.stopPropagation();
            if (confirm("Are you sure you want to permanently delete this entire thread? This cannot be undone.")) {
                for (const email of group) {
                    await permDeleteEmail(state.currentMailbox, email.timestamp, emailId(email));
                }
            }
        });
    }

    // Row click → open detail view with the full thread group
    li.addEventListener('click', () => {
        state.selectedIndex = index;
        openEmailDetail(group);
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

async function openEmailDetail(group) {
    state.openEmail = group; // store the whole group

    // 1. Sort chronologically (oldest first, so the newest is at the bottom like Gmail)
    const sortedGroup = [...group].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const primary = sortedGroup[sortedGroup.length - 1]; // most recent email

    // Mark all as read immediately
    sortedGroup.forEach(e => {
        const id = emailId(e);
        markRead(id);
        const row = document.querySelector(`.email-row[data-id="${id}"]`);
        if (row) row.classList.add('read');
    });

    showView('detail');
    updateBadges();

    // Set Subject at the very top of the thread view
    document.getElementById('detail-subject').textContent = primary.subject || '(no subject)';

    // Set Back label
    const folderNames = { inbox: 'Inbox', starred: 'Starred', sent: 'Sent', trash: 'Trash' };
    document.getElementById('detail-back-label').textContent = folderNames[state.currentFolder] || 'Inbox';

    const container = document.getElementById('thread-messages-container');
    container.innerHTML = '';

    // Render each email as a card
    sortedGroup.forEach((email, index) => {
        const id = emailId(email);
        const isLast = index === sortedGroup.length - 1;
        // Default to collapsed unless it's the very last email in the thread, or it's unread
        // (Wait, we just marked them all as read above, so we should have checked unread state before...
        // Let's just always expand the last email for simplicity)
        const expanded = isLast; 

        const card = document.createElement('div');
        card.className = 'email-detail-card border border-border rounded-xl bg-bg-card mb-4 overflow-hidden';
        
        // Header
        const header = document.createElement('div');
        header.className = 'email-card-header p-4 flex items-center justify-between cursor-pointer hover:bg-bg-hover transition-colors';
        const toAddr = email.to || state.currentMailbox || '';
        
        header.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="mailbox-icon shadow-sm w-8 h-8 flex-shrink-0" style="background: var(--accent); color: white;">
                    ${(email.from || '?').charAt(0).toUpperCase()}
                </div>
                <div class="flex flex-col truncate">
                    <span class="font-bold text-text-primary text-sm truncate">${escHtml(email.from || 'Unknown')}</span>
                    <span class="text-xs text-text-muted truncate">to ${escHtml(toAddr)}</span>
                </div>
            </div>
            <div class="flex items-center gap-4 flex-shrink-0">
                <span class="text-xs text-text-muted">${relativeTime(email.timestamp)}</span>
                <div class="flex items-center gap-1 text-text-muted">
                    <button class="card-star-btn border-none bg-transparent cursor-pointer hover:text-text-primary transition-colors flex items-center justify-center p-1" title="Star">
                        <span class="material-icons-round text-[18px] ${isStarred(id) ? 'text-[#f4b400]' : ''}">${isStarred(id) ? 'star' : 'star_border'}</span>
                    </button>
                    <button class="card-reply-btn border-none bg-transparent cursor-pointer hover:text-text-primary transition-colors flex items-center justify-center p-1" title="Reply">
                        <span class="material-icons-round text-[18px]">reply</span>
                    </button>
                    ${state.currentFolder === 'trash' ? '' : `
                        <button class="card-trash-btn border-none bg-transparent cursor-pointer hover:text-danger transition-colors flex items-center justify-center p-1" title="Trash">
                            <span class="material-icons-round text-[18px]">delete</span>
                        </button>
                    `}
                </div>
            </div>
        `;

        // Body container
        const bodyContainer = document.createElement('div');
        bodyContainer.className = `email-card-body border-t border-border ${expanded ? 'block' : 'hidden'}`;

        const SPINNER = `<div class="p-8 text-center text-text-muted flex flex-col items-center">
            <span class="material-icons-round animate-spin text-[32px] mb-2">refresh</span>
            Loading message...
        </div>`;
        bodyContainer.innerHTML = SPINNER;

        card.appendChild(header);
        card.appendChild(bodyContainer);
        container.appendChild(card);

        // Click header to toggle expand/collapse
        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // ignore clicks on buttons
            const isHidden = bodyContainer.classList.contains('hidden');
            if (isHidden) {
                bodyContainer.classList.remove('hidden');
                if (bodyContainer.innerHTML === SPINNER) {
                    loadEmailBody(email, bodyContainer);
                }
            } else {
                bodyContainer.classList.add('hidden');
            }
        });

        // Setup actions
        header.querySelector('.card-star-btn').onclick = (e) => {
            e.stopPropagation();
            const nowStarred = toggleStar(id);
            const icon = e.currentTarget.querySelector('span');
            icon.textContent = nowStarred ? 'star' : 'star_border';
            icon.className = `material-icons-round text-[18px] ${nowStarred ? 'text-[#f4b400]' : ''}`;
            updateBadges();
        };

        header.querySelector('.card-reply-btn').onclick = (e) => {
            e.stopPropagation();
            replyToEmail(email);
        };

        const trashBtn = header.querySelector('.card-trash-btn');
        if (trashBtn) {
            trashBtn.onclick = async (e) => {
                e.stopPropagation();
                await moveToTrash(state.currentMailbox, email.timestamp, id);
                card.remove();
                if (container.children.length === 0) {
                    showView('inbox');
                }
            };
        }

        // If initially expanded, load body immediately
        if (expanded) {
            loadEmailBody(email, bodyContainer);
        }
    });
}

async function loadEmailBody(email, container) {
    try {
        let body;
        if (email.messageId) {
            try {
                body = await apiCall(`/emails/${encodeURIComponent(state.currentMailbox)}/${encodeURIComponent(email.messageId)}/body`);
            } catch (s3Err) {
                if (s3Err.status === 404 || s3Err.message?.includes('404')) {
                    body = { text: email.text || '', html: email.html || '' };
                } else {
                    throw s3Err;
                }
            }
        } else {
            body = { text: email.text || '', html: email.html || '' };
        }

        // Check for rich attachments
        const attachments = body.attachments?.length > 0 ? body.attachments : (email.attachments || []);

        let attHtml = '';
        if (attachments.length > 0) {
            attHtml = `
                <div class="px-6 py-3 border-b border-border bg-bg-page flex flex-wrap gap-2">
                    ${attachments.map(a => `
                        <div class="inline-flex items-center gap-1 px-2 py-1 bg-bg-hover border border-border rounded-lg text-xs text-text-secondary whitespace-nowrap">
                            <span class="material-icons-round text-[14px]">attach_file</span>
                            <span>${escHtml(a.filename)}</span>
                            <span class="text-text-muted ml-1">${formatBytes(a.size)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Content tabs
        const hasHtml = !!body.html;
        const htmlContent = body.html || `<p style="color:var(--text-muted);padding:16px">${body.text ? escHtml(body.text).replace(/\\n/g, '<br>') : '(No content)'}</p>`;
        const textContent = body.text || '(No text content)';

        container.innerHTML = `
            ${attHtml}
            <div class="px-6 pt-3 flex gap-4 border-b border-border bg-bg-card">
                <button class="body-toggle-btn active bg-transparent border-none border-b-2 border-accent pb-2 font-medium text-accent cursor-pointer" data-target="html">HTML</button>
                <button class="body-toggle-btn bg-transparent border-none border-b-2 border-transparent pb-2 font-medium text-text-secondary cursor-pointer hover:text-text-primary" data-target="text">Plain Text</button>
            </div>
            <div class="body-html p-6 text-[0.9375rem] leading-relaxed text-text-primary bg-white [&>iframe]:w-full [&>iframe]:border-none [&>iframe]:min-h-[300px]"></div>
            <div class="body-text hidden p-6 text-[0.9375rem] leading-relaxed text-text-primary whitespace-pre-wrap font-mono bg-bg-page">${escHtml(textContent)}</div>
        `;

        // Render HTML securely
        if (hasHtml) {
            renderSafeHtmlEmail(container.querySelector('.body-html'), body.html);
        } else {
            container.querySelector('.body-html').innerHTML = htmlContent;
        }

        // Toggles
        const htmlBtn = container.querySelector('.body-toggle-btn[data-target="html"]');
        const textBtn = container.querySelector('.body-toggle-btn[data-target="text"]');
        const htmlDiv = container.querySelector('.body-html');
        const textDiv = container.querySelector('.body-text');

        htmlBtn.onclick = () => {
            htmlBtn.className = 'body-toggle-btn active bg-transparent border-none border-b-2 border-accent pb-2 font-medium text-accent cursor-pointer';
            textBtn.className = 'body-toggle-btn bg-transparent border-none border-b-2 border-transparent pb-2 font-medium text-text-secondary cursor-pointer hover:text-text-primary';
            htmlDiv.classList.remove('hidden');
            textDiv.classList.add('hidden');
        };
        textBtn.onclick = () => {
            textBtn.className = 'body-toggle-btn active bg-transparent border-none border-b-2 border-accent pb-2 font-medium text-accent cursor-pointer';
            htmlBtn.className = 'body-toggle-btn bg-transparent border-none border-b-2 border-transparent pb-2 font-medium text-text-secondary cursor-pointer hover:text-text-primary';
            textDiv.classList.remove('hidden');
            htmlDiv.classList.add('hidden');
        };

    } catch (err) {
        container.innerHTML = `<div class="p-6 text-danger flex items-center gap-2">
            <span class="material-icons-round">error_outline</span> Failed to load message body.
        </div>`;
        console.error('Body load error:', err);
    }
}

function formatBytes(b) {
    if (b < 1024)      return b + ' B';
    if (b < 1048576)   return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
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



        showToast('Moved to Trash. Emails permanently delete after 30 days.', 'default');
    } catch (e) {
        showToast('Failed to move to trash: ' + e.message, 'error');
    }
}

async function recoverEmail(mailbox, timestamp, id) {
    try {
        await apiCall(`/emails/${encodeURIComponent(mailbox)}/${encodeURIComponent(timestamp)}/recover`, { method: 'PATCH' });

        state.currentEmails = state.currentEmails.filter(e => emailId(e) !== id);
        renderEmailList();
        updateBadges();



        showToast('Email recovered to Inbox.', 'default');
    } catch (e) {
        showToast('Failed to recover email: ' + e.message, 'error');
    }
}

async function permDeleteEmail(mailbox, timestamp, id) {
    try {
        await apiCall(`/emails/${encodeURIComponent(mailbox)}/${encodeURIComponent(timestamp)}/permanent`, { method: 'DELETE' });

        state.currentEmails = state.currentEmails.filter(e => emailId(e) !== id);
        renderEmailList();
        updateBadges();



        showToast('Email permanently deleted.', 'default');
    } catch (e) {
        showToast('Failed to delete email: ' + e.message, 'error');
    }
}


