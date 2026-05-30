/**
 * AWS CloudFront SHA-256 Interceptor
 * Intercepts POST/PUT requests to add the required content hash header.
 */
(function() {
    // Guard: crypto.subtle is only available in secure contexts (HTTPS/localhost)
    if (!window.crypto?.subtle) {
        console.warn("AWS SHA-256 Interceptor: crypto.subtle unavailable (requires HTTPS). Skipping.");
        return;
    }

    // Helper to calculate SHA-256 hash
    async function getSHA256(body) {
        let buffer;
        if (!body) {
            buffer = new TextEncoder().encode("");
        } else if (typeof body === 'string') {
            buffer = new TextEncoder().encode(body);
        } else if (body instanceof Blob) {
            buffer = await body.arrayBuffer();
        } else if (body instanceof ArrayBuffer) {
            buffer = body;
        } else {
            console.warn("Unsupported body type for SHA-256 calculation.");
            buffer = new TextEncoder().encode("");
        }

        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- 1. Intercept Fetch API ---
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [resource, config] = args;

        if (config && ['POST', 'PUT'].includes(config.method?.toUpperCase())) {
            const hash = await getSHA256(config.body);
            
            config.headers = config.headers || {};
            
            if (config.headers instanceof Headers) {
                config.headers.set('x-amz-content-sha256', hash);
            } else {
                config.headers['x-amz-content-sha256'] = hash;
            }
        }

        return originalFetch.apply(this, args);
    };

    // --- 2. Intercept XMLHttpRequest (XHR) ---
    // Use a synchronous approach: compute hash in open(), apply in send()
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._method = method.toUpperCase();
        return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (['POST', 'PUT'].includes(this._method)) {
            // For XHR, compute hash asynchronously then send
            const xhr = this;
            getSHA256(body).then(hash => {
                xhr.setRequestHeader('x-amz-content-sha256', hash);
                originalSend.call(xhr, body);
            }).catch(() => {
                // Fallback: send without hash rather than breaking the request
                originalSend.call(xhr, body);
            });
            return; // Don't call originalSend synchronously
        }
        return originalSend.apply(this, [body]);
    };

    console.log("AWS SHA-256 Interceptor initialized.");
})();
