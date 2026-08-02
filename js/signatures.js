// =============================================================
// SIGNATURES (Phase 5)
// =============================================================
function getSignatures() { return lsGet('wm_sigs', []); }
function saveSignatures(sigs) { lsSet('wm_sigs', sigs); }
function getActiveSig() { return lsGet('wm_active_sig', null); }
function setActiveSig(id) { lsSet('wm_active_sig', id); }


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


