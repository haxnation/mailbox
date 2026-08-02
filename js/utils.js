// =============================================================
// EMAIL ID (unique per email)
// =============================================================
function emailId(email) {
    return email.messageId || `${email.mailbox}__${email.timestamp}`;
}


// =============================================================
// TOAST SYSTEM (Phase 4)
// =============================================================
function showToast(msg, type = 'default', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast${type !== 'default' ? ` ${type}` : ''}`;

    const icon = document.createElement('span');
    icon.className = 'material-icons-round';
    icon.style.fontSize = '18px';
    icon.textContent =
        type === 'success' ? 'check_circle'
      : type === 'error'   ? 'error'
      : type === 'warning' ? 'warning'
      : 'info';

    const text = document.createElement('span');
    text.textContent = msg;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}


// =============================================================
// SAFE HTML EMAIL RENDERING
// =============================================================
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

    const blob    = new Blob([htmlDoc], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const iframe  = document.createElement('iframe');
    iframe.src       = blobUrl;
    iframe.sandbox   = '';
    iframe.className = 'email-html-frame';
    iframe.style.width = '100%';
    iframe.style.minHeight = '300px';
    iframe.style.border = 'none';
    iframe.onload = () => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            iframe.style.height = (doc.body.scrollHeight + 20) + 'px';
        } catch { iframe.style.height = '500px'; }
        URL.revokeObjectURL(blobUrl);
    };
    containerEl.appendChild(iframe);
}


// =============================================================
// RELATIVE TIME FORMATTER
// =============================================================
function relativeTime(ts) {
    const now  = Date.now();
    const date = new Date(ts);
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (days < 7) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}


// =============================================================
// UTIL
// =============================================================
function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatSenderName(from) {
    if (!from) return 'Unknown';
    const match = from.match(/^"?(.+?)"?\s*<.+>/);
    return match ? match[1].trim() : from.split('@')[0];
}


