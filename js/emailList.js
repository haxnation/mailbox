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
        <div class="row-checkbox" style="padding-left: 16px; display: flex; align-items: center;">
            <input type="checkbox" class="email-select-cb" data-id="${escHtml(id)}" style="cursor:pointer;" />
        </div>
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

    // Checkbox click
    const cb = li.querySelector('.email-select-cb');
    if (cb) {
        cb.addEventListener('click', e => {
            e.stopPropagation();
            toggleTrashSelectedBtn();
            updateSelectAllState();
        });
    }

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

async function openEmailDetail(email) {
    const id = emailId(email);
    state.openEmail = email;

    // Mark as read
    markRead(id);
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

    // Attachments (metadata from DynamoDB, always available immediately)
    renderAttachments(email);

    // ── Body: lazy-load from S3 ──────────────────────────────────────────────
    // Show spinner immediately so the user sees something while the fetch runs
    const htmlEl   = document.getElementById('detail-html');
    const textEl   = document.getElementById('detail-text');
    const SPINNER  = `<div style="padding:32px;text-align:center;color:var(--text-muted)">
        <span class="material-icons-round" style="font-size:32px;animation:spin 1s linear infinite;display:block;margin-bottom:8px">refresh</span>
        Loading message…</div>`;

    htmlEl.innerHTML = SPINNER;
    textEl.textContent = '';
    showBodyView('html'); // show HTML pane while loading

    try {
        let body;

        if (email.messageId) {
            // Try the S3 body endpoint first (new emails)
            try {
                body = await apiCall(
                    `/emails/${encodeURIComponent(state.currentMailbox)}/${encodeURIComponent(email.messageId)}/body`
                );
            } catch (s3Err) {
                // 404 = old email whose body is still in DynamoDB (pre-migration)
                // Fall back to fields already on the email object
                if (s3Err.status === 404 || s3Err.message?.includes('404')) {
                    body = { text: email.text || '', html: email.html || '' };
                } else {
                    throw s3Err;
                }
            }
        } else {
            // No messageId — shouldn't happen, but handle gracefully
            body = { text: email.text || '', html: email.html || '' };
        }

        // Render body
        document.getElementById('detail-text').textContent = body.text || '(No text content)';
        if (body.html) {
            renderSafeHtmlEmail(htmlEl, body.html);
        } else {
            htmlEl.innerHTML = `<p style="color:var(--text-muted);padding:16px">${body.text
                ? escHtml(body.text).replace(/\n/g, '<br>')
                : '(No content available)'}</p>`;
        }

        // Update attachment metadata if the S3 body includes richer info
        if (body.attachments?.length > 0 && (!email.attachments || email.attachments.length === 0)) {
            renderAttachments({ ...email, attachments: body.attachments });
        }

        showBodyView(body.html ? 'html' : 'text');
    } catch (err) {
        htmlEl.innerHTML = `<div style="color:var(--danger);padding:24px">
            <span class="material-icons-round" style="vertical-align:middle">error_outline</span>
            Failed to load message body.</div>`;
        console.error('Body load error:', err);
    }
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


