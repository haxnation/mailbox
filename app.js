// --- CONFIGURATION ---
// Change these to match your deployment
const API_URL = 'https://api.haxnation.org/mail/api'; // Pointing directly to the /api routes
const OIDC_ISSUER_URL = 'https://api.haxnation.org/auth';
const OIDC_CLIENT_ID = 'webmail-app'; // Set this to your hax-auth client ID
const OIDC_REDIRECT_URI = 'https://api.haxnation.org/mail/auth/callback'; // The backend callback URL

// --- STATE ---
let token = localStorage.getItem('access_token') || null;
let refreshToken = localStorage.getItem('refresh_token') || null;
let user = null;
let currentMailbox = null;
let currentEmails = [];

// --- DOM ELEMENTS ---
const views = {
    login: document.getElementById('view-login'),
    webmail: document.getElementById('view-webmail'),
    settings: document.getElementById('view-settings'),
    admin: document.getElementById('view-admin')
};

const nav = {
    actions: document.getElementById('nav-actions'),
    webmail: document.getElementById('nav-webmail'),
    settings: document.getElementById('nav-settings'),
    admin: document.getElementById('nav-admin'),
    logout: document.getElementById('nav-logout')
};

// --- JWT DECODE (for UI routing only — backend validates the real signature) ---
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// --- NAVIGATION ---
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    if (viewName === 'webmail') loadWebmail();
}

nav.webmail.onclick = () => showView('webmail');
nav.settings.onclick = () => showView('settings');
nav.admin.onclick = () => showView('admin');
nav.logout.onclick = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    token = null;
    refreshToken = null;
    user = null;
    window.location.reload();
};

// --- OIDC LOGIN ---
document.getElementById('btn-login').onclick = () => {
    // Generate a random state for CSRF protection
    const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
        client_id: OIDC_CLIENT_ID,
        redirect_uri: OIDC_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email',
        state: state
    });

    window.location.href = `${OIDC_ISSUER_URL}/authorize?${params.toString()}`;
};

// --- HANDLE CALLBACK (from backend redirect) ---
async function handleOAuthCallback() {
    // Check if tokens are in the URL hash (from backend redirect)
    if (window.location.hash.includes('access_token=')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshTokenHash = hashParams.get('refresh_token');
        
        if (accessToken) {
            localStorage.setItem('access_token', accessToken);
            if (refreshTokenHash) {
                localStorage.setItem('refresh_token', refreshTokenHash);
            }
            
            // Clean the URL to hide the tokens from the address bar
            window.history.replaceState({}, document.title, window.location.pathname);
            
            token = accessToken;
            refreshToken = refreshTokenHash;
            return true; // Tokens acquired successfully
        }
    }
    
    // Check for errors passed from backend redirect
    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.get('error')) {
        alert('Login failed: ' + queryParams.get('error'));
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
    }

    return false;
}

// --- API HELPER ---
async function apiCall(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (options.body) options.headers['Content-Type'] = 'application/json';

    let res = await fetch(`${API_URL}${endpoint}`, options);

    // If token expired, try to refresh
    if (res.status === 403 && refreshToken) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            options.headers['Authorization'] = `Bearer ${token}`;
            res = await fetch(`${API_URL}${endpoint}`, options);
        }
    }

    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        token = null;
        user = null;
        showView('login');
        throw new Error('Session expired. Please log in again.');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'API Request failed');
    }
    return res.json();
}

async function tryRefreshToken() {
    try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!res.ok) return false;
        const tokens = await res.json();
        token = tokens.access_token;
        localStorage.setItem('access_token', tokens.access_token);
        if (tokens.refresh_token) {
            refreshToken = tokens.refresh_token;
            localStorage.setItem('refresh_token', tokens.refresh_token);
        }
        return true;
    } catch (e) {
        return false;
    }
}

// --- SAFE HTML RENDERING ---
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

    const blob = new Blob([htmlDoc], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.src = blobUrl;
    iframe.sandbox = '';
    iframe.className = 'email-html-frame';
    iframe.style.width = '100%';
    iframe.style.minHeight = '300px';
    iframe.style.border = '1px solid #e5e7eb';
    iframe.style.borderRadius = '0.375rem';

    iframe.onload = () => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            iframe.style.height = doc.body.scrollHeight + 20 + 'px';
        } catch (e) {
            iframe.style.height = '500px';
        }
        URL.revokeObjectURL(blobUrl);
    };

    containerEl.appendChild(iframe);
}

// --- WEBMAIL LOGIC ---
async function loadWebmail() {
    try {
        const mailboxes = await apiCall('/mailboxes');
        const list = document.getElementById('mailbox-list');
        const select = document.getElementById('compose-from');
        list.innerHTML = '';
        select.innerHTML = '';

        mailboxes.forEach(mbx => {
            const li = document.createElement('li');
            li.className = 'cursor-pointer p-2 rounded hover:bg-gray-100';
            li.textContent = mbx.address;
            li.onclick = () => loadEmails(mbx.address);
            list.appendChild(li);

            if (mbx.canCrud) {
                const opt = document.createElement('option');
                opt.value = mbx.address;
                opt.textContent = mbx.address;
                select.appendChild(opt);
            }
        });
    } catch (e) {
        alert(e.message);
    }
}

async function loadEmails(mailbox) {
    currentMailbox = mailbox;
    document.getElementById('current-mailbox-title').textContent = mailbox;
    document.getElementById('email-inbox').classList.remove('hidden');
    document.getElementById('email-compose').classList.add('hidden');
    document.getElementById('email-detail').classList.add('hidden');

    const container = document.getElementById('emails-container');
    container.textContent = 'Loading...';

    try {
        const emails = await apiCall(`/emails/${encodeURIComponent(mailbox)}`);
        currentEmails = emails;
        container.innerHTML = '';
        if (emails.length === 0) {
            const p = document.createElement('p');
            p.className = 'text-gray-500';
            p.textContent = 'No emails found.';
            container.appendChild(p);
            return;
        }

        emails.forEach((email, index) => {
            const div = document.createElement('div');
            div.className = 'border p-3 rounded bg-gray-50 hover:bg-white shadow-sm transition cursor-pointer';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'flex justify-between text-sm mb-1';

            const fromSpan = document.createElement('span');
            fromSpan.className = 'font-bold';
            fromSpan.textContent = email.from;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'text-gray-500';
            timeSpan.textContent = new Date(email.timestamp).toLocaleString();

            headerDiv.appendChild(fromSpan);
            headerDiv.appendChild(timeSpan);

            const subjectDiv = document.createElement('div');
            subjectDiv.className = 'font-semibold';
            subjectDiv.textContent = email.subject;

            const previewDiv = document.createElement('div');
            previewDiv.className = 'text-gray-500 text-sm truncate';
            previewDiv.textContent = (email.text || '').slice(0, 120);

            div.appendChild(headerDiv);
            div.appendChild(subjectDiv);
            div.appendChild(previewDiv);
            div.onclick = () => openEmailDetail(index);

            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'text-red-500';
        p.textContent = 'Error: ' + e.message;
        container.appendChild(p);
    }
}

// --- EMAIL DETAIL VIEW ---
function openEmailDetail(index) {
    const email = currentEmails[index];
    if (!email) return;

    document.getElementById('email-inbox').classList.add('hidden');
    document.getElementById('email-detail').classList.remove('hidden');

    const headerEl = document.getElementById('email-detail-header');
    headerEl.innerHTML = '';

    const subjectH = document.createElement('h2');
    subjectH.className = 'text-xl font-bold mb-2';
    subjectH.textContent = email.subject;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'text-sm text-gray-600';

    const fromLine = document.createElement('div');
    const fromLabel = document.createElement('strong');
    fromLabel.textContent = 'From: ';
    const fromValue = document.createElement('span');
    fromValue.textContent = email.from;
    fromLine.appendChild(fromLabel);
    fromLine.appendChild(fromValue);

    const dateLine = document.createElement('div');
    const dateLabel = document.createElement('strong');
    dateLabel.textContent = 'Date: ';
    const dateValue = document.createElement('span');
    dateValue.textContent = new Date(email.timestamp).toLocaleString();
    dateLine.appendChild(dateLabel);
    dateLine.appendChild(dateValue);

    metaDiv.appendChild(fromLine);
    metaDiv.appendChild(dateLine);
    headerEl.appendChild(subjectH);
    headerEl.appendChild(metaDiv);

    const textEl = document.getElementById('email-detail-text');
    textEl.textContent = email.text || '(No text content)';

    const htmlEl = document.getElementById('email-detail-html');
    if (email.html) {
        renderSafeHtmlEmail(htmlEl, email.html);
    } else {
        htmlEl.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'text-gray-500';
        p.textContent = '(No HTML content available)';
        htmlEl.appendChild(p);
    }

    showTextView();
}

function showTextView() {
    document.getElementById('email-detail-text').classList.remove('hidden');
    document.getElementById('email-detail-html').classList.add('hidden');
    document.getElementById('btn-view-text').className = 'px-3 py-1 rounded bg-blue-600 text-white text-sm';
    document.getElementById('btn-view-html').className = 'px-3 py-1 rounded bg-gray-300 text-sm';
}

function showHtmlView() {
    document.getElementById('email-detail-text').classList.add('hidden');
    document.getElementById('email-detail-html').classList.remove('hidden');
    document.getElementById('btn-view-text').className = 'px-3 py-1 rounded bg-gray-300 text-sm';
    document.getElementById('btn-view-html').className = 'px-3 py-1 rounded bg-blue-600 text-white text-sm';
}

document.getElementById('btn-view-text').onclick = showTextView;
document.getElementById('btn-view-html').onclick = showHtmlView;

document.getElementById('btn-back-to-inbox').onclick = () => {
    document.getElementById('email-detail').classList.add('hidden');
    document.getElementById('email-inbox').classList.remove('hidden');
};

// --- COMPOSE ---
document.getElementById('btn-compose').onclick = () => {
    document.getElementById('email-inbox').classList.add('hidden');
    document.getElementById('email-detail').classList.add('hidden');
    document.getElementById('email-compose').classList.remove('hidden');
};

document.getElementById('btn-cancel-compose').onclick = () => {
    document.getElementById('email-inbox').classList.remove('hidden');
    document.getElementById('email-compose').classList.add('hidden');
};

document.getElementById('compose-form').onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
        from: document.getElementById('compose-from').value,
        to: document.getElementById('compose-to').value,
        subject: document.getElementById('compose-subject').value,
        text: document.getElementById('compose-body').value
    };
    try {
        await apiCall('/emails/send', { method: 'POST', body: JSON.stringify(payload) });
        alert('Email sent!');
        document.getElementById('btn-cancel-compose').click();
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

// --- SETTINGS ---
document.getElementById('btn-generate-smtp').onclick = async () => {
    try {
        const creds = await apiCall('/smtp-credentials', { method: 'POST' });
        const box = document.getElementById('smtp-credentials');
        box.classList.remove('hidden');
        box.textContent = `SMTP Server: ${creds.smtpServer}\nPort: ${creds.port}\nUsername: ${creds.smtpUsername}\nPassword: ${creds.smtpPassword}`;
    } catch (err) {
        alert(err.message);
    }
};

// --- ADMIN ---
document.getElementById('btn-admin-create-mbx').onclick = async () => {
    const address = document.getElementById('admin-new-mailbox').value.trim();
    if (!address) return;
    try {
        await apiCall('/admin/mailboxes', { method: 'POST', body: JSON.stringify({ address }) });
        alert('Mailbox created');
        document.getElementById('admin-new-mailbox').value = '';
    } catch (err) {
        alert(err.message);
    }
};

document.getElementById('admin-assign-form').onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
        userId: document.getElementById('assign-user-id').value.trim(),
        address: document.getElementById('assign-address').value.trim(),
        canRead: document.getElementById('assign-read').checked,
        canCrud: document.getElementById('assign-write').checked
    };
    try {
        await apiCall('/admin/assignments', { method: 'POST', body: JSON.stringify(payload) });
        alert('User assigned successfully');
    } catch (err) {
        alert(err.message);
    }
};

// --- INITIALIZATION ---
async function init() {
    // Check if this is an OAuth callback with a ?code= parameter
    await handleOAuthCallback();

    if (token) {
        user = parseJwt(token);
        if (user && (user.sub || user.id || user.user_id)) {
            nav.actions.classList.remove('hidden');
            if (user.userType === 'superadmin') {
                nav.admin.classList.remove('hidden');
            }
            showView('webmail');
        } else {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            token = null;
            showView('login');
        }
    } else {
        showView('login');
    }
}

init();
