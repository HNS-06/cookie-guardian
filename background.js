// Background service worker for enhanced Cookie Guardian
// Load required modules
importScripts('categories.js', 'encryption.js', 'sync-manager.js', 'badge-manager.js');

class CookieGuardianBackground {
    constructor() {
        this.auditLog = [];
        this.siteRules = {};
        this.whitelist = [];
        this.blacklist = [];
        this.encryption = null;
        this.categorizer = null;
        this.syncManager = null;
        this.badgeManager = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        try {
            await this.loadSavedData();
            this.setupListeners();
            this.setupAlarms();
            this.startMonitoring();
            this.initializeModules();
            this.isInitialized = true;
        } catch (error) {
            console.error('Fatal initialization error:', error);
        }
    }

    async loadSavedData() {
        try {
            const data = await chrome.storage.local.get([
                'siteRules', 
                'auditLog', 
                'whitelist', 
                'blacklist',
                'encryptionKey',
                'syncSettings'
            ]);
            
            this.siteRules = data.siteRules || this.getDefaultRules();
            this.auditLog = data.auditLog || [];
            this.whitelist = data.whitelist || [];
            this.blacklist = data.blacklist || [];
        } catch (error) {
            console.error('Error loading saved data:', error);
            this.siteRules = this.getDefaultRules();
        }
    }

    getDefaultRules() {
        return {
            '*': { 
                expiration: 30, 
                encrypt: false,
                priority: 'medium'
            },
            'banking': { 
                expiration: 15, 
                encrypt: true, 
                pattern: /(bank|credit|paypal|stripe)/i,
                priority: 'high'
            },
            'social': { 
                expiration: 60, 
                encrypt: false, 
                pattern: /(facebook|twitter|instagram|linkedin)/i,
                priority: 'medium'
            },
            'shopping': { 
                expiration: 120, 
                encrypt: false, 
                pattern: /(amazon|ebay|shopify|alibaba)/i,
                priority: 'medium'
            }
        };
    }

    async initializeModules() {
        // Initialize categorizer
        if (typeof CookieCategorizer !== 'undefined') {
            try {
                this.categorizer = new CookieCategorizer();
            } catch (error) {
                console.error('Failed to initialize categorizer:', error);
                this.categorizer = null;
            }
        }

        // Initialize encryption module
        if (typeof CookieEncryption !== 'undefined') {
            try {
                this.encryption = new CookieEncryption();
            } catch (error) {
                console.error('Failed to initialize encryption:', error);
                this.encryption = null;
            }
        }
        
        // Initialize sync manager
        if (typeof SyncManager !== 'undefined') {
            try {
                this.syncManager = new SyncManager();
            } catch (error) {
                console.error('Failed to initialize sync manager:', error);
                this.syncManager = null;
            }
        }
        
        // Initialize badge manager
        if (typeof BadgeManager !== 'undefined') {
            try {
                this.badgeManager = new BadgeManager();
            } catch (error) {
                console.error('Failed to initialize badge manager:', error);
                this.badgeManager = null;
            }
        }
    }

    setupListeners() {
        // Monitor cookie changes
        chrome.cookies.onChanged.addListener((changeInfo) => {
            this.handleCookieChange(changeInfo);
        });

        // Monitor tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.checkTabCookies(tab);
            }
        });

        // Handle messages from popup and options
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        // Monitor storage changes for sync
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && this.syncManager?.syncEnabled) {
                this.syncManager.syncChanges(changes);
            }
        });
    }

    setupAlarms() {
        // Create alarms for various tasks
        chrome.alarms.create('checkExpiringCookies', { periodInMinutes: 1 });
        chrome.alarms.create('cleanOldCookies', { periodInMinutes: 60 });
        chrome.alarms.create('updateBadge', { periodInMinutes: 5 });
        
        chrome.alarms.onAlarm.addListener((alarm) => {
            switch (alarm.name) {
                case 'checkExpiringCookies':
                    this.checkExpiringCookies();
                    break;
                case 'cleanOldCookies':
                    this.cleanOldCookies();
                    break;
                case 'updateBadge':
                    this.badgeManager?.updateBadge();
                    break;
            }
        });
    }

    startMonitoring() {
        // Initial checks
        this.checkExpiringCookies();
        this.cleanOldCookies();
    }

    async handleCookieChange(changeInfo) {
        await this.logCookieChange(changeInfo);
        
        const cookie = changeInfo.cookie;
        
        // Apply whitelist/blacklist first
        const listResult = await this.applyWhitelistBlacklist(cookie);
        if (listResult === false) return; // Cookie was blacklisted and deleted
        
        // Apply rules
        await this.applyRules(cookie);
        
        // Apply encryption if needed
        await this.applyEncryption(cookie);
    }

    async applyWhitelistBlacklist(cookie) {
        // Check blacklist first
        for (const pattern of this.blacklist) {
            try {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                if (regex.test(cookie.domain)) {
                    // Delete blacklisted cookie
                    await chrome.cookies.remove({
                        url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
                        name: cookie.name
                    });
                    
                    this.logAudit('BLACKLIST_DELETED', {
                        cookie: cookie.name,
                        domain: cookie.domain,
                        pattern: pattern
                    });
                    
                    return false;
                }
            } catch (error) {
                console.error('Error checking blacklist pattern:', error);
            }
        }
        
        // Check whitelist
        for (const pattern of this.whitelist) {
            try {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                if (regex.test(cookie.domain)) {
                    // Apply special rules for whitelisted domains
                    const whitelistRules = await chrome.storage.local.get(['whitelistRules']);
                    const rule = whitelistRules[cookie.domain];
                    
                    if (rule) {
                        await this.applyWhitelistRule(cookie, rule);
                    }
                    return true;
                }
            } catch (error) {
                console.error('Error checking whitelist pattern:', error);
            }
        }
        
        return null; // Neither whitelisted nor blacklisted
    }

    async applyWhitelistRule(cookie, rule) {
        const updatedCookie = { ...cookie };
        
        if (rule.expiration) {
            updatedCookie.expirationDate = Math.floor(
                (Date.now() + (rule.expiration * 60 * 1000)) / 1000
            );
        }
        
        if (rule.encrypt && this.encryption) {
            try {
                const encrypted = await this.encryption.encryptCookie(cookie.value, cookie.domain);
                
                // Store encrypted version
                await chrome.storage.local.set({
                    [`encrypted_${cookie.domain}_${cookie.name}`]: encrypted
                });
                
                // Replace cookie value with reference
                updatedCookie.value = `ENCRYPTED_REF_${cookie.domain}_${cookie.name}`;
                
                this.logAudit('ENCRYPTED', {
                    cookie: cookie.name,
                    domain: cookie.domain,
                    type: 'whitelist_rule'
                });
            } catch (error) {
                console.error('Error encrypting whitelisted cookie:', error);
            }
        }
        
        try {
            await chrome.cookies.set(updatedCookie);
        } catch (error) {
            console.error('Error applying whitelist rule:', error);
        }
    }

    async applyRules(cookie) {
        const domain = cookie.domain;
        let matchedRule = this.siteRules['*'];
        
        // Find matching rule for domain
        for (const [key, rule] of Object.entries(this.siteRules)) {
            if (key === '*') continue;
            
            if (rule.pattern && rule.pattern.test(domain)) {
                matchedRule = rule;
                break;
            }
            
            if (domain.includes(key)) {
                matchedRule = rule;
                break;
            }
        }
        
        // Apply expiration rule
        if (matchedRule.expiration && !cookie.expirationDate) {
            const expirationDate = Date.now() + (matchedRule.expiration * 60 * 1000);
            const updatedCookie = {
                ...cookie,
                expirationDate: Math.floor(expirationDate / 1000)
            };
            
            try {
                await chrome.cookies.set(updatedCookie);
                this.logAudit('RULE_APPLIED', {
                    cookie: cookie.name,
                    domain: cookie.domain,
                    expiration: matchedRule.expiration,
                    rule: matchedRule
                });
            } catch (error) {
                console.error('Error applying rule:', error);
            }
        }
    }

    async applyEncryption(cookie) {
        // Check if this cookie should be encrypted based on rules
        const domain = cookie.domain;
        let shouldEncrypt = false;
        
        for (const [key, rule] of Object.entries(this.siteRules)) {
            if (key === '*') {
                if (rule.encrypt) {
                    shouldEncrypt = true;
                }
                continue;
            }
            
            if (rule.pattern && rule.pattern.test(domain)) {
                shouldEncrypt = rule.encrypt;
                break;
            }
            
            if (domain.includes(key) && rule.encrypt) {
                shouldEncrypt = true;
                break;
            }
        }
        
        if (shouldEncrypt && this.encryption && cookie.value && !cookie.value.startsWith('ENCRYPTED_REF_')) {
            try {
                const encrypted = await this.encryption.encryptCookie(cookie.value, cookie.domain);
                
                // Store encrypted version
                await chrome.storage.local.set({
                    [`encrypted_${cookie.domain}_${cookie.name}`]: encrypted
                });
                
                // Update cookie with encrypted reference
                const updatedCookie = {
                    ...cookie,
                    value: `ENCRYPTED_REF_${cookie.domain}_${cookie.name}`
                };
                
                await chrome.cookies.set(updatedCookie);
                
                this.logAudit('ENCRYPTED', {
                    cookie: cookie.name,
                    domain: cookie.domain,
                    type: 'auto_encryption'
                });
            } catch (error) {
                console.error('Error auto-encrypting cookie:', error);
            }
        }
    }

    async checkExpiringCookies() {
        try {
            const allCookies = await chrome.cookies.getAll({});
            const now = Date.now() / 1000;
            const expiringSoon = allCookies.filter(cookie => {
                if (!cookie.expirationDate) return false;
                const timeLeft = cookie.expirationDate - now;
                return timeLeft > 0 && timeLeft < 300; // 5 minutes
            });
            
            if (expiringSoon.length > 0) {
                this.showExpirationNotification(expiringSoon);
            }
        } catch (error) {
            console.error('Error checking expiring cookies:', error);
        }
    }

    async cleanOldCookies() {
        try {
            const allCookies = await chrome.cookies.getAll({});
            const now = Date.now() / 1000;
            const oldCookies = allCookies.filter(cookie => {
                if (!cookie.expirationDate) return false;
                const age = cookie.expirationDate - now;
                return age > 30 * 24 * 60 * 60; // Older than 30 days
            });
            
            for (const cookie of oldCookies) {
                try {
                    const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
                    await chrome.cookies.remove({ url: url, name: cookie.name });
                    
                    this.logAudit('AUTO_DELETE', {
                        cookie: cookie.name,
                        domain: cookie.domain,
                        reason: 'older_than_30_days'
                    });
                } catch (error) {
                    console.error('Error deleting old cookie:', error);
                }
            }
            
            if (oldCookies.length > 0) {
                console.log(`Cleaned ${oldCookies.length} old cookies`);
            }
        } catch (error) {
            console.error('Error cleaning old cookies:', error);
        }
    }

    showExpirationNotification(cookies) {
        const domains = [...new Set(cookies.map(c => c.domain.replace(/^\./, '')))];
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Cookie Expiration Warning',
            message: `${cookies.length} cookies from ${domains.length} sites will expire in 5 minutes`,
            priority: 2,
            buttons: [
                { title: 'Extend All' },
                { title: 'Ignore' }
            ]
        });
    }

    async logCookieChange(changeInfo) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            cookie: changeInfo.cookie.name,
            domain: changeInfo.cookie.domain,
            changeType: changeInfo.removed ? 'REMOVED' : changeInfo.cause,
            value: changeInfo.cookie.value ? (changeInfo.cookie.value.length > 50 ? 
                   changeInfo.cookie.value.substring(0, 50) + '...' : changeInfo.cookie.value) : 'empty'
        };
        
        this.auditLog.unshift(logEntry);
        
        // Keep only last 1000 entries
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(0, 1000);
        }
        
        // Save to storage
        try {
            await chrome.storage.local.set({ auditLog: this.auditLog });
        } catch (error) {
            console.error('Error saving audit log:', error);
        }
    }

    logAudit(action, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action,
            ...details
        };
        
        this.auditLog.unshift(logEntry);
        
        // Keep only last 1000 entries
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(0, 1000);
        }
        
        // Save to storage
        chrome.storage.local.set({ auditLog: this.auditLog.slice(0, 1000) });
    }

    async checkTabCookies(tab) {
        if (!tab.url.startsWith('http')) return;
        
        try {
            const url = new URL(tab.url);
            const cookies = await chrome.cookies.getAll({ domain: url.hostname });
            
            if (cookies.length > 0) {
                this.logAudit('TAB_VISIT', {
                    domain: url.hostname,
                    cookieCount: cookies.length,
                    tabId: tab.id,
                    url: tab.url
                });
                
                // Update badge for this tab
                if (this.badgeManager) {
                    this.badgeManager.showCookieCount(tab.id);
                }
            }
        } catch (error) {
            console.error('Error checking tab cookies:', error);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'GET_AUDIT_LOG':
                    sendResponse({ auditLog: this.auditLog.slice(0, 100) });
                    break;
                    
                case 'GET_RULES':
                    sendResponse({ rules: this.siteRules });
                    break;
                    
                case 'SAVE_RULE':
                    this.siteRules[message.domain] = message.rule;
                    await chrome.storage.local.set({ siteRules: this.siteRules });
                    sendResponse({ success: true });
                    break;
                    
                case 'DELETE_RULE':
                    delete this.siteRules[message.domain];
                    await chrome.storage.local.set({ siteRules: this.siteRules });
                    sendResponse({ success: true });
                    break;
                    
                case 'GET_WHITELIST':
                    sendResponse({ whitelist: this.whitelist });
                    break;
                    
                case 'GET_BLACKLIST':
                    sendResponse({ blacklist: this.blacklist });
                    break;
                    
                case 'ADD_TO_LIST':
                    if (message.listType === 'whitelist') {
                        if (!this.whitelist.includes(message.pattern)) {
                            this.whitelist.push(message.pattern);
                        }
                    } else {
                        if (!this.blacklist.includes(message.pattern)) {
                            this.blacklist.push(message.pattern);
                        }
                    }
                    await chrome.storage.local.set({
                        whitelist: this.whitelist,
                        blacklist: this.blacklist
                    });
                    sendResponse({ success: true });
                    break;
                    
                case 'REMOVE_FROM_LIST':
                    if (message.listType === 'whitelist') {
                        this.whitelist = this.whitelist.filter(p => p !== message.pattern);
                    } else {
                        this.blacklist = this.blacklist.filter(p => p !== message.pattern);
                    }
                    await chrome.storage.local.set({
                        whitelist: this.whitelist,
                        blacklist: this.blacklist
                    });
                    sendResponse({ success: true });
                    break;
                    
                case 'GET_STATS':
                    const cookies = await chrome.cookies.getAll({});
                    const categorized = cookies.map(cookie => 
                        this.categorizer.categorizeCookie(cookie)
                    );
                    
                    const stats = {
                        totalCookies: cookies.length,
                        sessionCookies: cookies.filter(c => !c.expirationDate).length,
                        secureCookies: cookies.filter(c => c.secure).length,
                        httpOnlyCookies: cookies.filter(c => c.httpOnly).length,
                        encryptedCookies: cookies.filter(c => c.value?.startsWith('ENCRYPTED_REF_')).length,
                        whitelistedDomains: this.whitelist.length,
                        blacklistedDomains: this.blacklist.length,
                        categories: this.aggregateCategories(categorized)
                    };
                    sendResponse(stats);
                    break;
                    
                case 'GET_CATEGORIES':
                    const allCookies = await chrome.cookies.getAll({});
                    const allCategorized = allCookies.map(cookie => ({
                        ...cookie,
                        category: this.categorizer.categorizeCookie(cookie)
                    }));
                    sendResponse({ categorized: allCategorized });
                    break;
                    
                case 'ENCRYPT_COOKIE':
                    if (this.encryption) {
                        const encrypted = await this.encryption.encryptCookie(
                            message.value, 
                            message.domain
                        );
                        sendResponse({ success: true, encrypted });
                    } else {
                        sendResponse({ success: false, error: 'Encryption not available' });
                    }
                    break;
                    
                case 'DECRYPT_COOKIE':
                    if (this.encryption) {
                        const decrypted = await this.encryption.decryptCookie(message.encryptedData);
                        sendResponse({ success: true, decrypted });
                    } else {
                        sendResponse({ success: false, error: 'Encryption not available' });
                    }
                    break;
                    
                case 'EXPORT_BACKUP':
                    const backup = await this.syncManager.exportBackup();
                    sendResponse({ success: true, backup });
                    break;
                    
                case 'IMPORT_BACKUP':
                    const success = await this.syncManager.importBackup(message.backup);
                    if (success) {
                        await this.loadSavedData();
                    }
                    sendResponse({ success });
                    break;
                    
                case 'SYNC_DATA':
                    if (this.syncManager) {
                        await this.syncManager.syncChanges(message.changes);
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'Sync not available' });
                    }
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    aggregateCategories(categorized) {
        const counts = {};
        
        categorized.forEach(cat => {
            const category = cat.category;
            counts[category] = (counts[category] || 0) + 1;
        });
        
        return counts;
    }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (notificationId.includes('expiration')) {
        if (buttonIndex === 0) { // Extend All button
            // Get all cookies expiring soon
            const cookies = await chrome.cookies.getAll({});
            const now = Date.now() / 1000;
            const expiringSoon = cookies.filter(cookie => {
                if (!cookie.expirationDate) return false;
                const timeLeft = cookie.expirationDate - now;
                return timeLeft > 0 && timeLeft < 300;
            });
            
            // Extend all by 1 hour
            for (const cookie of expiringSoon) {
                const newExpiration = Date.now() + (60 * 60 * 1000);
                const updatedCookie = {
                    ...cookie,
                    expirationDate: newExpiration / 1000
                };
                
                try {
                    await chrome.cookies.set(updatedCookie);
                } catch (error) {
                    console.error('Error extending cookie:', error);
                }
            }
            
            // Show confirmation
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Cookies Extended',
                message: `Extended ${expiringSoon.length} cookies by 1 hour`,
                priority: 1
            });
        }
    }
});

// Initialize background service
const backgroundService = new CookieGuardianBackground();