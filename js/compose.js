// =============================================================
// REPLY / FORWARD (Phase 2)
// =============================================================
function replyToEmail(email) {
    const fromSel = document.getElementById('compose-from');
    const toInput  = document.getElementById('compose-to');
    const subjInp  = document.getElementById('compose-subject');
    const bodyEl   = document.getElementById('compose-body');

    // Try to use the email it was received in as the sender
    const options = Array.from(fromSel.options).map(o => o.value);
    const preferredFrom = email.to || email.mailbox || state.currentMailbox;
    if (preferredFrom && options.includes(preferredFrom)) {
        fromSel.value = preferredFrom;
    } else if (state.currentMailbox && options.includes(state.currentMailbox)) {
        fromSel.value = state.currentMailbox;
    }

    // Extract reply-to address
    const isSent = email.folder === 'sent';
    const replyTo = extractEmail(isSent ? email.to : email.from);
    toInput.value  = replyTo;
    
    const subj = email.subject || '';
    subjInp.value  = /^re:\s*/i.test(subj) ? subj : `Re: ${subj}`;


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
    const subj = email.subject || '';
    subjInp.value  = /^fwd?:\s*/i.test(subj) ? subj : `Fwd: ${subj}`;
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


