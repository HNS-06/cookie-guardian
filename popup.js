class CookieGuardianPopup {
    constructor() {
        this.currentTab = null;
        this.cookies = [];
        this.rules = {};
        this.whitelist = [];
        this.blacklist = [];
        this.categorizer = null;
        this.syncManager = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        try {
            // Initialize categorizer if available
            if (typeof CookieCategorizer !== 'undefined') {
                this.categorizer = new CookieCategorizer();
            } else {
                console.warn('CookieCategorizer not available, skipping');
                this.categorizer = null;
            }

            await this.getCurrentTab();
            await this.loadRules();
            await this.loadLists();
            await this.loadCookies();
            await this.loadCategories();
            await this.loadSyncStatus();
            this.setupEventListeners();
            this.startRealtimeUpdates();
            this.updateStats();
            this.isInitialized = true;
        } catch (error) {
            console.error('Fatal initialization error in popup:', error);
            this.showNotification('Failed to initialize. Please refresh the popup.', 'error');
        }
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            return tab;
        } catch (error) {
            console.error('Error getting current tab:', error);
            this.showNotification('Unable to access current tab', 'error');
            return null;
        }
    }

    async loadRules() {
        try {
            const data = await chrome.storage.local.get(['siteRules']);
            this.rules = data.siteRules || {};
            
            // Display current site rules
            if (this.currentTab?.url) {
                const domain = new URL(this.currentTab.url).hostname;
                const siteRule = this.rules[domain] || this.rules['*'] || { expiration: 30 };
                
                const rulesList = document.getElementById('currentRules');
                if (rulesList) {
                    rulesList.innerHTML = `
                        <div class="rule-item">
                            <span class="rule-name">${domain}</span>
                            <span class="rule-timer">${siteRule.expiration} minutes</span>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error loading rules:', error);
        }
    }

    async loadLists() {
        try {
            const data = await chrome.storage.local.get(['whitelist', 'blacklist']);
            this.whitelist = data.whitelist || [];
            this.blacklist = data.blacklist || [];
        } catch (error) {
            console.error('Error loading lists:', error);
        }
    }

    async loadCookies() {
        if (!this.currentTab?.url) {
            this.showEmptyState('No active tab');
            return;
        }
        
        try {
            const url = new URL(this.currentTab.url);
            const domain = url.hostname;
            
            const cookies = await chrome.cookies.getAll({ domain });
            this.cookies = cookies;
            this.renderCookies(cookies);
        } catch (error) {
            console.error('Error loading cookies:', error);
            this.showEmptyState('Unable to load cookies');
        }
    }

    renderCookies(cookies) {
        const jar = document.getElementById('cookieJar');
        const template = document.getElementById('cookieTemplate');
        
        if (!cookies || cookies.length === 0) {
            jar.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cookie"></i>
                    <p>No active cookies for this site</p>
                </div>
            `;
            return;
        }

        jar.innerHTML = '';
        
        cookies.forEach(cookie => {
            const clone = template.content.cloneNode(true);
            const item = clone.querySelector('.cookie-item');
            const expiresIn = this.calculateTimeRemaining(cookie);
            const category = this.categorizer ? this.categorizer.categorizeCookie(cookie) : { category: 'unknown', risk: 'medium' };
            
            clone.querySelector('.cookie-name').textContent = cookie.name;
            clone.querySelector('.cookie-domain').textContent = cookie.domain;
            clone.querySelector('.cookie-expiry').textContent = this.formatExpiration(cookie);
            clone.querySelector('.cookie-category').textContent = category.category;
            
            if (this.categorizer) {
                clone.querySelector('.cookie-category').style.color = this.categorizer.getCategoryColor(category.category);
            }
            
            const progressBar = clone.querySelector('.timer-progress');
            const timerText = clone.querySelector('.timer-text');
            
            // Set timer color based on remaining time
            if (expiresIn.minutes < 5) {
                item.style.borderLeftColor = 'var(--danger)';
                progressBar.style.background = 'linear-gradient(90deg, var(--danger), #ff6b6b)';
            } else if (expiresIn.minutes < 15) {
                item.style.borderLeftColor = 'var(--warning)';
                progressBar.style.background = 'linear-gradient(90deg, var(--warning), #ffd166)';
            }
            
            // Calculate progress percentage
            const totalLifetime = cookie.expirationDate ? 
                (cookie.expirationDate * 1000) - Date.now() : 
                30 * 60 * 1000; // Default 30 minutes
            const remaining = expiresIn.total;
            const percentage = Math.min(100, (remaining / totalLifetime) * 100);
            
            progressBar.style.width = `${percentage}%`;
            timerText.textContent = this.formatTimeRemaining(expiresIn);
            
            // Add event listeners to buttons
            const deleteBtn = clone.querySelector('.btn-icon-small:nth-child(1)');
            const extendBtn = clone.querySelector('.btn-icon-small:nth-child(2)');
            const infoBtn = clone.querySelector('.btn-icon-small:nth-child(3)');
            
            deleteBtn.addEventListener('click', () => this.deleteCookie(cookie));
            extendBtn.addEventListener('click', () => this.extendCookie(cookie));
            infoBtn.addEventListener('click', () => this.showCookieInfo(cookie, category));
            
            jar.appendChild(clone);
        });
    }

    async loadCategories() {
        try {
            if (!this.categorizer) {
                console.warn('Categorizer not available');
                return;
            }

            const categories = {};
            
            this.cookies.forEach(cookie => {
                const category = this.categorizer.categorizeCookie(cookie);
                if (!categories[category.category]) {
                    categories[category.category] = {
                        count: 0,
                        description: category.description,
                        icon: this.categorizer.getCategoryIcon(category.category),
                        color: this.categorizer.getCategoryColor(category.category),
                        risk: category.risk
                    };
                }
                categories[category.category].count++;
            });
            
            this.renderCategories(categories);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    renderCategories(categories) {
        const grid = document.getElementById('categoriesGrid');
        
        if (Object.keys(categories).length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tags"></i>
                    <p>No categorized cookies</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = '';
        
        Object.entries(categories).forEach(([name, data]) => {
            const card = document.createElement('div');
            card.className = 'category-card';
            card.style.borderLeft = `3px solid ${data.color}`;
            card.innerHTML = `
                <div class="category-header">
                    <div class="category-icon" style="background: ${data.color}20; color: ${data.color}">
                        <i class="fas fa-${data.icon}"></i>
                    </div>
                    <span class="category-name">${name}</span>
                    <span class="risk-badge ${data.risk}">${data.risk}</span>
                </div>
                <div class="category-count">${data.count}</div>
                <div class="category-desc">${data.description}</div>
            `;
            grid.appendChild(card);
        });
    }

    async loadSyncStatus() {
        try {
            const data = await chrome.storage.local.get(['syncSettings']);
            const syncSettings = data.syncSettings || { enabled: false };
            
            const syncIcon = document.getElementById('syncIcon');
            const syncStatus = document.getElementById('syncStatus');
            const lastSync = document.getElementById('lastSync');
            const toggleSyncBtn = document.getElementById('toggleSyncBtn');
            
            if (syncSettings.enabled) {
                syncIcon.style.color = 'var(--success)';
                syncStatus.textContent = 'Sync Active';
                toggleSyncBtn.textContent = 'Disable Sync';
                toggleSyncBtn.classList.add('danger');
                
                if (syncSettings.lastSync) {
                    const lastSyncDate = new Date(syncSettings.lastSync);
                    lastSync.textContent = `Last: ${lastSyncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }
            } else {
                syncIcon.style.color = 'var(--gray)';
                syncStatus.textContent = 'Sync Disabled';
                toggleSyncBtn.textContent = 'Enable Sync';
                toggleSyncBtn.classList.remove('danger');
                lastSync.textContent = 'Never';
            }
        } catch (error) {
            console.error('Error loading sync status:', error);
        }
    }

    calculateTimeRemaining(cookie) {
        if (!cookie.expirationDate) {
            return { minutes: 30, seconds: 0, total: 30 * 60 * 1000 };
        }
        
        const now = Date.now() / 1000;
        const remainingSeconds = cookie.expirationDate - now;
        
        return {
            minutes: Math.floor(remainingSeconds / 60),
            seconds: Math.floor(remainingSeconds % 60),
            total: remainingSeconds * 1000
        };
    }

    formatExpiration(cookie) {
        if (!cookie.expirationDate) return 'Session';
        
        const date = new Date(cookie.expirationDate * 1000);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatTimeRemaining(time) {
        if (time.minutes <= 0 && time.seconds <= 0) return 'Expired';
        if (time.minutes > 60) return `${Math.floor(time.minutes / 60)}h ${time.minutes % 60}m`;
        if (time.minutes > 0) return `${time.minutes}m ${time.seconds}s`;
        return `${time.seconds}s`;
    }

    async deleteCookie(cookie) {
        try {
            const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
            await chrome.cookies.remove({
                url: url,
                name: cookie.name
            });
            
            this.showNotification('Cookie deleted', 'success');
            await this.loadCookies();
            await this.loadCategories();
            this.updateStats();
        } catch (error) {
            console.error('Error deleting cookie:', error);
            this.showNotification('Failed to delete cookie', 'error');
        }
    }

    async extendCookie(cookie) {
        try {
            const newExpiration = Date.now() + (60 * 60 * 1000); // 1 hour
            const updatedCookie = {
                ...cookie,
                expirationDate: newExpiration / 1000
            };
            
            await chrome.cookies.set(updatedCookie);
            this.showNotification('Cookie extended by 1 hour', 'success');
            await this.loadCookies();
        } catch (error) {
            console.error('Error extending cookie:', error);
            this.showNotification('Failed to extend cookie', 'error');
        }
    }

    showCookieInfo(cookie, category) {
        const info = `
            <strong>Name:</strong> ${cookie.name}<br>
            <strong>Domain:</strong> ${cookie.domain}<br>
            <strong>Path:</strong> ${cookie.path}<br>
            <strong>Secure:</strong> ${cookie.secure ? 'Yes' : 'No'}<br>
            <strong>HTTP Only:</strong> ${cookie.httpOnly ? 'Yes' : 'No'}<br>
            <strong>Category:</strong> ${category.category}<br>
            <strong>Risk Level:</strong> ${category.risk}<br>
            <strong>Description:</strong> ${category.description}
        `;
        
        this.showModal('Cookie Information', info);
    }

    async sanitizeNonEssential() {
        try {
            const essentialDomains = ['google.com', 'github.com', 'stackoverflow.com'];
            const currentDomain = this.currentTab?.url ? new URL(this.currentTab.url).hostname : '';
            
            const cookies = await chrome.cookies.getAll({});
            const toDelete = cookies.filter(cookie => {
                // Keep current domain cookies
                if (currentDomain && cookie.domain.includes(currentDomain)) return false;
                
                // Keep essential domains
                if (essentialDomains.some(domain => cookie.domain.includes(domain))) return false;
                
                // Keep whitelisted domains
                if (this.whitelist.some(pattern => 
                    new RegExp(pattern.replace(/\*/g, '.*')).test(cookie.domain)
                )) return false;
                
                // Keep cookies from essential categories
                const category = this.categorizer.categorizeCookie(cookie);
                if (category.category === 'essential' || category.category === 'security') return false;
                
                // Delete others
                return true;
            });
            
            for (const cookie of toDelete) {
                const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
                await chrome.cookies.remove({ url: url, name: cookie.name });
            }
            
            this.showNotification(`Cleaned ${toDelete.length} non-essential cookies`, 'success');
            await this.loadCookies();
            await this.loadCategories();
            this.updateStats();
        } catch (error) {
            console.error('Error sanitizing cookies:', error);
            this.showNotification('Failed to sanitize cookies', 'error');
        }
    }

    async encryptSensitiveCookies() {
        try {
            const sensitiveDomains = ['bank', 'credit', 'paypal', 'stripe', 'login', 'auth'];
            const cookies = await chrome.cookies.getAll({});
            
            const toEncrypt = cookies.filter(cookie => 
                sensitiveDomains.some(keyword => 
                    cookie.domain.includes(keyword) || cookie.name.includes(keyword)
                )
            );
            
            // Import encryption module
            const encryption = new CookieEncryption();
            let encryptedCount = 0;
            
            for (const cookie of toEncrypt) {
                try {
                    const encrypted = await encryption.encryptCookie(cookie.value, cookie.domain);
                    
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
                    encryptedCount++;
                } catch (error) {
                    console.error(`Failed to encrypt cookie ${cookie.name}:`, error);
                }
            }
            
            this.showNotification(`Encrypted ${encryptedCount} sensitive cookies`, 'success');
            await this.loadCookies();
        } catch (error) {
            console.error('Error encrypting cookies:', error);
            this.showNotification('Failed to encrypt cookies', 'error');
        }
    }

    updateStats() {
        const expiringSoon = this.cookies.filter(c => {
            const time = this.calculateTimeRemaining(c);
            return time.minutes < 5;
        }).length;
        
        document.getElementById('expiringSoon').textContent = expiringSoon;
        document.getElementById('protectedSites').textContent = Object.keys(this.rules).length;
        document.getElementById('totalCookies').textContent = this.cookies.length;
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n => n.remove());
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        
        notification.innerHTML = `
            <i class="fas fa-${icons[type] || 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? 'var(--success)' : 
                        type === 'error' ? 'var(--danger)' : 
                        type === 'warning' ? 'var(--warning)' : 'var(--info)'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showModal(title, content) {
        // Remove existing modals
        const existing = document.querySelectorAll('.modal-overlay');
        existing.forEach(m => m.remove());
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        
        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.cssText = `
            background: var(--card-bg);
            border-radius: 12px;
            padding: 25px;
            max-width: 400px;
            width: 90%;
            border: 1px solid var(--border-color);
            animation: slideIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3 style="margin: 0 0 15px 0; color: var(--light);">${title}</h3>
                <button class="close-modal" style="background: none; border: none; color: var(--gray); cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="color: var(--light); line-height: 1.5;">
                ${content}
            </div>
            <div class="modal-footer" style="margin-top: 20px; text-align: right;">
                <button class="btn-secondary" style="padding: 8px 16px;">Close</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Add event listeners
        const closeBtn = modal.querySelector('.close-modal');
        const footerBtn = modal.querySelector('.modal-footer button');
        
        const closeModal = () => {
            overlay.style.animation = 'fadeIn 0.3s ease reverse';
            setTimeout(() => overlay.remove(), 300);
        };
        
        closeBtn.addEventListener('click', closeModal);
        footerBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    setupEventListeners() {
        try {
            // Refresh button
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    try {
                        await this.loadCookies();
                        await this.loadCategories();
                        this.updateStats();
                        this.showNotification('Refreshed cookie data', 'success');
                    } catch (error) {
                        console.error('Error refreshing:', error);
                        this.showNotification('Failed to refresh', 'error');
                    }
                });
            }
            
            // Sanitize button
            const sanitizeBtn = document.getElementById('sanitizeBtn');
            if (sanitizeBtn) {
                sanitizeBtn.addEventListener('click', () => this.sanitizeNonEssential());
            }
            
            // Extend all button
            const extendBtn = document.getElementById('extendBtn');
            if (extendBtn) {
                extendBtn.addEventListener('click', async () => {
                    try {
                        if (!this.currentTab?.url) {
                            this.showNotification('No active tab', 'error');
                            return;
                        }
                        
                        const domain = new URL(this.currentTab.url).hostname;
                        const cookies = await chrome.cookies.getAll({ domain });
                        
                        for (const cookie of cookies) {
                            await this.extendCookie(cookie);
                        }
                    } catch (error) {
                        console.error('Error extending cookies:', error);
                        this.showNotification('Failed to extend cookies', 'error');
                    }
                });
            }
            
            // Encrypt button
            const encryptBtn = document.getElementById('encryptBtn');
            if (encryptBtn) {
                encryptBtn.addEventListener('click', () => this.encryptSensitiveCookies());
            }
            
            // Audit button
            const auditBtn = document.getElementById('auditBtn');
            if (auditBtn) {
                auditBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
            }
            
            // Privacy report button
            const privacyReportBtn = document.getElementById('privacyReportBtn');
            if (privacyReportBtn) {
                privacyReportBtn.addEventListener('click', () => {
                    chrome.tabs.create({ url: chrome.runtime.getURL('privacy-report.html') });
                });
            }
            
            // Whitelist button
            const whitelistBtn = document.getElementById('whitelistBtn');
            if (whitelistBtn) {
                whitelistBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
            }
            
            // Edit rules button
            const editRulesBtn = document.getElementById('editRulesBtn');
            if (editRulesBtn) {
                editRulesBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
            }
            
            // Options button
            const optionsBtn = document.getElementById('optionsBtn');
            if (optionsBtn) {
                optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
            }
            
            // Backup button
            const backupBtn = document.getElementById('backupBtn');
            if (backupBtn) {
                backupBtn.addEventListener('click', async () => {
                    try {
                        if (typeof SyncManager === 'undefined') {
                            this.showNotification('Sync module not available', 'error');
                            return;
                        }
                        
                        const syncManager = new SyncManager();
                        const backup = await syncManager.exportBackup();
                        
                        // Trigger download
                        const dataStr = JSON.stringify(backup, null, 2);
                        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                        
                const link = document.createElement('a');
                link.setAttribute('href', dataUri);
                link.setAttribute('download', `cookie-guardian-backup-${new Date().toISOString().split('T')[0]}.json`);
                link.click();
                
                this.showNotification('Backup created successfully', 'success');
                    } catch (error) {
                        console.error('Error creating backup:', error);
                        this.showNotification('Failed to create backup', 'error');
                    }
                });
            }
            
            // Restore button
            const restoreBtn = document.getElementById('restoreBtn');
            if (restoreBtn) {
                restoreBtn.addEventListener('click', () => {
                    if (typeof SyncManager === 'undefined') {
                        this.showNotification('Sync module not available', 'error');
                        return;
                    }
                    
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        const reader = new FileReader();
                        
                        reader.onload = async (event) => {
                            try {
                                const backup = JSON.parse(event.target.result);
                                const syncManager = new SyncManager();
                                await syncManager.importBackup(backup);
                                
                                this.showNotification('Backup restored successfully', 'success');
                                await this.loadCookies();
                                await this.loadRules();
                                await this.loadCategories();
                                await this.loadSyncStatus();
                            } catch (error) {
                                console.error('Error restoring backup:', error);
                                this.showNotification('Failed to restore backup. Invalid format.', 'error');
                            }
                        };
                        
                        reader.readAsText(file);
                    };
                    
                    input.click();
                });
            }
            
            // Toggle sync button
            const toggleSyncBtn = document.getElementById('toggleSyncBtn');
            if (toggleSyncBtn) {
                toggleSyncBtn.addEventListener('click', async () => {
                    try {
                        const data = await chrome.storage.local.get(['syncSettings']);
                        const syncSettings = data.syncSettings || { enabled: false };
                        
                        if (syncSettings.enabled) {
                            // Disable sync
                            await chrome.storage.local.set({
                                syncSettings: { enabled: false }
                            });
                            this.showNotification('Sync disabled', 'info');
                        } else {
                            // Enable sync - show setup modal
                            this.showSyncSetupModal();
                        }
                        
                        await this.loadSyncStatus();
                    } catch (error) {
                        console.error('Error toggling sync:', error);
                        this.showNotification('Failed to toggle sync', 'error');
                    }
                });
            }
        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    showSyncSetupModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.cssText = `
            background: var(--card-bg);
            border-radius: 12px;
            padding: 25px;
            max-width: 400px;
            width: 90%;
            border: 1px solid var(--border-color);
            animation: slideIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="modal-header">
                <h3 style="margin: 0 0 15px 0; color: var(--light);">Enable Cloud Sync</h3>
                <button class="close-modal" style="background: none; border: none; color: var(--gray); cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="color: var(--light);">
                <p style="margin-bottom: 20px;">Sync your cookie rules and settings across browsers.</p>
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 14px;">Email Address</label>
                    <input type="email" id="syncEmail" 
                           style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); 
                                  border: 1px solid var(--border-color); border-radius: 6px; 
                                  color: var(--light);">
                </div>
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 14px;">Password</label>
                    <input type="password" id="syncPassword" 
                           style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); 
                                  border: 1px solid var(--border-color); border-radius: 6px; 
                                  color: var(--light);">
                </div>
                <p style="font-size: 12px; color: var(--gray); margin-bottom: 20px;">
                    Your data will be encrypted end-to-end. We never see your cookie data.
                </p>
            </div>
            <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn-secondary" id="cancelSync" style="padding: 8px 16px;">Cancel</button>
                <button class="btn-primary" id="setupSync" style="padding: 8px 16px;">Setup Sync</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Add event listeners
        const closeModal = () => overlay.remove();
        
        overlay.querySelector('.close-modal').addEventListener('click', closeModal);
        overlay.querySelector('#cancelSync').addEventListener('click', closeModal);
        
        overlay.querySelector('#setupSync').addEventListener('click', async () => {
            const email = overlay.querySelector('#syncEmail').value;
            const password = overlay.querySelector('#syncPassword').value;
            
            if (!email || !password) {
                this.showNotification('Please fill in all fields', 'error');
                return;
            }
            
            try {
                // In a real implementation, this would call your backend
                // For now, we'll simulate success
                const authToken = btoa(`${email}:${password}`);
                
                await chrome.storage.local.set({
                    syncSettings: {
                        enabled: true,
                        authToken,
                        email,
                        lastSync: new Date().toISOString()
                    }
                });
                
                this.showNotification('Sync enabled successfully', 'success');
                closeModal();
                await this.loadSyncStatus();
            } catch (error) {
                console.error('Error enabling sync:', error);
                this.showNotification('Failed to enable sync', 'error');
            }
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    startRealtimeUpdates() {
        // Update timers every second
        setInterval(() => {
            const timerTexts = document.querySelectorAll('.timer-text');
            const progressBars = document.querySelectorAll('.timer-progress');
            
            this.cookies.forEach((cookie, index) => {
                const expiresIn = this.calculateTimeRemaining(cookie);
                if (timerTexts[index]) {
                    timerTexts[index].textContent = this.formatTimeRemaining(expiresIn);
                }
                if (progressBars[index]) {
                    const totalLifetime = cookie.expirationDate ? 
                        (cookie.expirationDate * 1000) - Date.now() : 
                        30 * 60 * 1000;
                    const remaining = expiresIn.total;
                    const percentage = Math.min(100, (remaining / totalLifetime) * 100);
                    progressBars[index].style.width = `${percentage}%`;
                }
            });
            
            this.updateStats();
        }, 1000);
    }

    showEmptyState(message = 'No active cookies for this site') {
        const jar = document.getElementById('cookieJar');
        jar.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cookie"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CookieGuardianPopup();
});