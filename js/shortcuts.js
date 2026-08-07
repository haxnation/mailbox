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

        const threads = state.displayThreads || [];

        switch (e.key) {
            case 'j':
                state.selectedIndex = Math.min(state.selectedIndex + 1, threads.length - 1);
                highlightSelectedRow();
                break;
            case 'k':
                state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
                highlightSelectedRow();
                break;
            case 'Enter':
                if (state.selectedIndex >= 0 && threads[state.selectedIndex]) {
                    openEmailDetail(threads[state.selectedIndex]);
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
                if (state.selectedIndex >= 0 && threads[state.selectedIndex]) {
                    const group = threads[state.selectedIndex];
                    let nowStarred = false;
                    group.forEach(email => {
                        nowStarred = toggleStar(emailId(email)) || nowStarred;
                    });
                    renderEmailList();
                    updateBadges();
                    showToast(nowStarred ? 'Starred' : 'Unstarred', 'default', 1500);
                }
                break;
            case '#':
                if (state.selectedIndex >= 0 && threads[state.selectedIndex]) {
                    const group = threads[state.selectedIndex];
                    group.forEach(email => {
                        moveToTrash(state.currentMailbox, email.timestamp, emailId(email));
                    });
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


