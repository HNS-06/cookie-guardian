// badge-manager.js - Dynamic badge updates
class BadgeManager {
    constructor() {
        this.init();
    }

    async init() {
        await this.updateBadge();
        this.setupUpdateInterval();
        this.setupListeners();
    }

    async updateBadge() {
        const cookies = await chrome.cookies.getAll({});
        const now = Date.now() / 1000;
        
        // Count cookies expiring in next hour
        const expiringSoon = cookies.filter(cookie => {
            if (!cookie.expirationDate) return false;
            const timeLeft = cookie.expirationDate - now;
            return timeLeft > 0 && timeLeft < 3600; // 1 hour
        }).length;
        
        // Update badge
        if (expiringSoon > 0) {
            await chrome.action.setBadgeText({ text: expiringSoon.toString() });
            await chrome.action.setBadgeBackgroundColor({ color: '#f72585' });
            
            // Set badge title
            await chrome.action.setTitle({
                title: `${expiringSoon} cookies expiring soon`
            });
        } else {
            await chrome.action.setBadgeText({ text: '' });
        }
        
        // Store for popup use
        await chrome.storage.local.set({ expiringSoonCount: expiringSoon });
    }

    setupUpdateInterval() {
        // Update badge every minute
        setInterval(() => {
            this.updateBadge();
        }, 60000);
    }

    setupListeners() {
        // Update badge when cookies change
        chrome.cookies.onChanged.addListener(() => {
            this.updateBadge();
        });
        
        // Update badge when rules change
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.siteRules) {
                this.updateBadge();
            }
        });
        
        // Update badge when tab changes
        chrome.tabs.onActivated.addListener(() => {
            this.updateBadge();
        });
    }

    async showCookieCount(tabId) {
        if (tabId) {
            const cookies = await chrome.cookies.getAll({});
            const tab = await chrome.tabs.get(tabId);
            
            if (tab.url) {
                const domain = new URL(tab.url).hostname;
                const domainCookies = cookies.filter(cookie => 
                    cookie.domain.includes(domain)
                ).length;
                
                await chrome.action.setBadgeText({ 
                    text: domainCookies > 0 ? domainCookies.toString() : '',
                    tabId 
                });
            }
        }
    }
}