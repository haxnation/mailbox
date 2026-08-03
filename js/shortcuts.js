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
            if (!document.getElementById('view-detail').classList.contains('hidden')) {
                showView('inbox');
                return;
            }
            return;
        }

        if (isInput) return;

        // Ignore if modifier keys are pressed (e.g., Ctrl+C for copy)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

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


