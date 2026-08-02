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


