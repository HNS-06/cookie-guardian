// Enhanced content script for monitoring cookie access attempts

class CookieAccessMonitor {
    constructor() {
        this.init();
    }

    init() {
        this.interceptCookieAccess();
        this.monitorDocumentCookies();
        this.monitorStorage();
        this.monitorNetworkRequests();
        this.setupMutationObserver();
    }

    interceptCookieAccess() {
        // Store original cookie methods
        const originalDocumentCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
        
        if (originalDocumentCookie) {
            Object.defineProperty(document, 'cookie', {
                get: function() {
                    this.logCookieAccess('GET', document.location.hostname, 'document.cookie');
                    return originalDocumentCookie.get.call(this);
                },
                set: function(value) {
                    const cookieName = value.split('=')[0].trim();
                    this.logCookieAccess('SET', document.location.hostname, cookieName);
                    return originalDocumentCookie.set.call(this, value);
                }
            });
        }
    }

    monitorDocumentCookies() {
        // Monitor cookie changes via mutation observer
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'cookie') {
                    this.logCookieAccess('CHANGE', document.location.hostname, 'attribute');
                }
            });
        });
        
        observer.observe(document, { attributes: true, attributeFilter: ['cookie'] });
    }

    monitorStorage() {
        // Monitor localStorage and sessionStorage
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
            if (key.includes('cookie') || key.includes('token') || key.includes('session')) {
                this.logStorageAccess('SET', key, document.location.hostname);
            }
            return originalSetItem.call(this, key, value);
        };
        
        const originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function(key) {
            if (key.includes('cookie') || key.includes('token') || key.includes('session')) {
                this.logStorageAccess('GET', key, document.location.hostname);
            }
            return originalGetItem.call(this, key);
        };
    }

    monitorNetworkRequests() {
        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const [resource, config] = args;
            
            // Check for cookie-related headers
            if (config && config.headers) {
                const cookieHeader = config.headers.get ? config.headers.get('Cookie') : config.headers.Cookie;
                if (cookieHeader) {
                    this.logNetworkAccess('FETCH', resource, cookieHeader);
                }
            }
            
            return originalFetch.apply(this, args);
        };
        
        // Intercept XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return originalXHROpen.apply(this, arguments);
        };
        
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            // Check for cookies in request headers
            const cookies = this.getResponseHeader ? this.getResponseHeader('Set-Cookie') : null;
            if (cookies) {
                this.logNetworkAccess('XHR', this._url, cookies);
            }
            
            return originalXHRSend.apply(this, arguments);
        };
    }

    setupMutationObserver() {
        // Monitor for scripts that might access cookies
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.tagName === 'SCRIPT' && node.src) {
                            this.logScriptAccess(node.src);
                        }
                    });
                }
            });
        });
        
        observer.observe(document.documentElement, { 
            childList: true, 
            subtree: true 
        });
    }

    logCookieAccess(action, domain, cookieName) {
        chrome.runtime.sendMessage({
            action: 'LOG_COOKIE_ACCESS',
            data: {
                timestamp: new Date().toISOString(),
                action,
                domain,
                cookieName,
                url: window.location.href,
                userAgent: navigator.userAgent
            }
        }).catch(() => {
            // Extension context might be invalidated
        });
    }

    logStorageAccess(action, key, domain) {
        chrome.runtime.sendMessage({
            action: 'LOG_STORAGE_ACCESS',
            data: {
                timestamp: new Date().toISOString(),
                action,
                key,
                domain,
                url: window.location.href
            }
        }).catch(() => {
            // Extension context might be invalidated
        });
    }

    logNetworkAccess(type, url, cookieData) {
        chrome.runtime.sendMessage({
            action: 'LOG_NETWORK_ACCESS',
            data: {
                timestamp: new Date().toISOString(),
                type,
                url,
                cookieData: cookieData.substring(0, 100), // Limit size
                domain: window.location.hostname
            }
        }).catch(() => {
            // Extension context might be invalidated
        });
    }

    logScriptAccess(src) {
        // Check for known tracking scripts
        const trackingPatterns = [
            /google-analytics/i,
            /facebook\.net/i,
            /doubleclick\.net/i,
            /hotjar/i,
            /amplitude/i,
            /mixpanel/i
        ];
        
        for (const pattern of trackingPatterns) {
            if (pattern.test(src)) {
                chrome.runtime.sendMessage({
                    action: 'LOG_TRACKING_SCRIPT',
                    data: {
                        timestamp: new Date().toISOString(),
                        src,
                        domain: window.location.hostname,
                        type: 'tracking_script'
                    }
                }).catch(() => {
                    // Extension context might be invalidated
                });
                break;
            }
        }
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            new CookieAccessMonitor();
        } catch (error) {
            console.error('Failed to initialize CookieAccessMonitor:', error);
        }
    });
} else {
    try {
        new CookieAccessMonitor();
    } catch (error) {
        console.error('Failed to initialize CookieAccessMonitor:', error);
    }
}