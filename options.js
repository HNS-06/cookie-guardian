class CookieGuardianOptions {
    constructor() {
        this.currentSection = 'rules';
        this.chart = null;
        this.categorizer = new CookieCategorizer();
        this.syncManager = null;
        this.init();
    }

    async init() {
        this.setupNavigation();
        await this.loadRules();
        await this.loadAuditLog();
        await this.loadLists();
        await this.loadStats();
        await this.loadEncryptionStatus();
        await this.loadSyncStatus();
        this.setupEventListeners();
        this.setupCharts();
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const sections = document.querySelectorAll('.section');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Get target section
                const targetId = item.getAttribute('href').substring(1);
                
                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Show target section
                sections.forEach(section => {
                    section.classList.remove('active');
                    if (section.id === targetId) {
                        section.classList.add('active');
                    }
                });
                
                this.currentSection = targetId;
                
                // Load section-specific data
                switch (targetId) {
                    case 'whitelist':
                        this.loadLists();
                        break;
                    case 'privacy-report':
                        this.loadPrivacyReport();
                        break;
                    case 'stats':
                        this.loadStats();
                        break;
                    case 'backup':
                        this.loadBackupHistory();
                        break;
                }
            });
        });
    }

    async loadRules() {
        try {
            const { rules } = await chrome.runtime.sendMessage({ action: 'GET_RULES' });
            this.renderRules(rules);
        } catch (error) {
            console.error('Error loading rules:', error);
            this.showNotification('Failed to load rules', 'error');
        }
    }

    renderRules(rules) {
        const rulesList = document.getElementById('rulesList');
        rulesList.innerHTML = '';
        
        Object.entries(rules).forEach(([domain, rule]) => {
            if (domain === '*') {
                document.getElementById('defaultExpiration').value = rule.expiration || 30;
                document.getElementById('defaultEncrypt').checked = rule.encrypt || false;
                return;
            }
            
            const card = document.createElement('div');
            card.className = 'rule-card';
            card.innerHTML = `
                <div class="rule-header">
                    <span class="rule-domain">${domain}</span>
                    <div class="rule-actions">
                        <button class="btn-icon edit-rule" data-domain="${domain}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon delete-rule" data-domain="${domain}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="rule-details">
                    <div class="detail-item">
                        <span class="detail-label">Expiration</span>
                        <span class="detail-value">${rule.expiration || 30} minutes</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Encryption</span>
                        <span class="detail-value">${rule.encrypt ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Auto-delete</span>
                        <span class="detail-value">${rule.autoDelete ? 'Yes' : 'No'}</span>
                    </div>
                </div>
                <div>
                    <span class="rule-priority priority-${rule.priority || 'medium'}">
                        ${(rule.priority || 'medium').toUpperCase()} PRIORITY
                    </span>
                </div>
            `;
            
            rulesList.appendChild(card);
        });
        
        // Add event listeners to buttons
        document.querySelectorAll('.edit-rule').forEach(btn => {
            btn.addEventListener('click', () => this.editRule(btn.dataset.domain));
        });
        
        document.querySelectorAll('.delete-rule').forEach(btn => {
            btn.addEventListener('click', () => this.deleteRule(btn.dataset.domain));
        });
    }

    async loadAuditLog() {
        try {
            const { auditLog } = await chrome.runtime.sendMessage({ action: 'GET_AUDIT_LOG' });
            this.renderAuditLog(auditLog);
        } catch (error) {
            console.error('Error loading audit log:', error);
            this.showNotification('Failed to load audit log', 'error');
        }
    }

    renderAuditLog(logs) {
        const auditLog = document.getElementById('auditLog');
        
        if (!logs || logs.length === 0) {
            auditLog.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No audit logs yet</p>
                </div>
            `;
            return;
        }
        
        auditLog.innerHTML = '';
        
        logs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'audit-entry';
            
            const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const typeClass = this.getAuditTypeClass(log.changeType || log.action);
            
            entry.innerHTML = `
                <span class="audit-time">${time}</span>
                <div>
                    <span class="audit-action">${log.cookie || log.action}</span>
                    <span class="audit-domain">@${log.domain}</span>
                </div>
                <span class="audit-type ${typeClass}">
                    ${log.changeType || log.action}
                </span>
            `;
            
            auditLog.appendChild(entry);
        });
    }

    getAuditTypeClass(type) {
        switch(type) {
            case 'SET': return 'type-set';
            case 'REMOVED': return 'type-removed';
            case 'RULE_APPLIED': return 'type-rule';
            case 'BLACKLIST_DELETED': return 'type-blacklisted';
            case 'ENCRYPTED': return 'type-encrypted';
            default: return 'type-rule';
        }
    }

    async loadLists() {
        try {
            const [whitelist, blacklist] = await Promise.all([
                chrome.runtime.sendMessage({ action: 'GET_WHITELIST' }),
                chrome.runtime.sendMessage({ action: 'GET_BLACKLIST' })
            ]);
            
            this.renderList('whitelist', whitelist.whitelist || []);
            this.renderList('blacklist', blacklist.blacklist || []);
        } catch (error) {
            console.error('Error loading lists:', error);
            this.showNotification('Failed to load lists', 'error');
        }
    }

    renderList(listType, items) {
        const container = document.getElementById(`${listType}Container`);
        
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-list"></i>
                    <p>No ${listType} items</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        items.forEach(item => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item';
            listItem.innerHTML = `
                <div>
                    <div class="list-domain">${item.pattern || item}</div>
                    ${item.notes ? `<div class="list-notes">${item.notes}</div>` : ''}
                </div>
                <div class="list-actions">
                    <button class="btn-icon remove-from-list" data-pattern="${item.pattern || item}" data-type="${listType}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(listItem);
        });
        
        // Add event listeners to remove buttons
        container.querySelectorAll('.remove-from-list').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pattern = btn.dataset.pattern;
                const listType = btn.dataset.type;
                
                if (confirm(`Remove ${pattern} from ${listType}?`)) {
                    try {
                        await chrome.runtime.sendMessage({
                            action: 'REMOVE_FROM_LIST',
                            listType: listType,
                            pattern: pattern
                        });
                        
                        this.showNotification('Item removed', 'success');
                        await this.loadLists();
                    } catch (error) {
                        console.error('Error removing from list:', error);
                        this.showNotification('Failed to remove item', 'error');
                    }
                }
            });
        });
    }

    async loadStats() {
        try {
            const stats = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
            this.renderStats(stats);
            this.renderDomainStats(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
            this.showNotification('Failed to load statistics', 'error');
        }
    }

    renderStats(stats) {
        document.getElementById('totalCookiesStat').textContent = stats.totalCookies || 0;
        document.getElementById('protectedCookies').textContent = stats.secureCookies || 0;
        document.getElementById('expiringToday').textContent = this.calculateExpiringToday();
        document.getElementById('blacklistedCookies').textContent = stats.blacklistedDomains || 0;
        
        // Update chart if it exists
        if (this.chart && stats.categories) {
            this.updateChart(stats.categories);
        }
    }

    calculateExpiringToday() {
        // This would require checking all cookie expiration dates
        // For now, return a placeholder
        return '0';
    }

    async loadEncryptionStatus() {
        try {
            const stats = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
            document.getElementById('encryptedCount').textContent = stats.encryptedCookies || 0;
            document.getElementById('encryptedDomains').textContent = this.countEncryptedDomains();
            
            // Load encryption settings
            const settings = await chrome.storage.local.get(['encryptionSettings']);
            const encryptionSettings = settings.encryptionSettings || {};
            
            document.getElementById('autoEncryptBanking').checked = encryptionSettings.autoEncryptBanking || false;
            document.getElementById('autoEncryptSocial').checked = encryptionSettings.autoEncryptSocial || false;
            document.getElementById('autoEncryptShopping').checked = encryptionSettings.autoEncryptShopping || false;
        } catch (error) {
            console.error('Error loading encryption status:', error);
        }
    }

    countEncryptedDomains() {
        // This would require checking all encrypted cookies
        // For now, return a placeholder
        return '0';
    }

    async loadSyncStatus() {
        try {
            const settings = await chrome.storage.local.get(['syncSettings']);
            const syncSettings = settings.syncSettings || { enabled: false };
            
            const enableSyncCheckbox = document.getElementById('enableSync');
            const syncControls = document.getElementById('syncControls');
            
            enableSyncCheckbox.checked = syncSettings.enabled || false;
            
            if (syncSettings.enabled) {
                syncControls.style.display = 'block';
                document.getElementById('syncEmail').value = syncSettings.email || '';
            } else {
                syncControls.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading sync status:', error);
        }
    }

    async loadPrivacyReport() {
        try {
            const stats = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
            
            // Calculate privacy score (simplified)
            const privacyScore = this.calculatePrivacyScore(stats);
            document.getElementById('privacyScoreQuick').textContent = privacyScore;
            
            // Load other quick stats
            document.getElementById('trackersBlockedQuick').textContent = 
                stats.categories?.advertising || 0;
            document.getElementById('encryptedQuick').textContent = 
                stats.encryptedCookies || 0;
            
            // Load recent privacy events
            await this.loadPrivacyEvents();
        } catch (error) {
            console.error('Error loading privacy report:', error);
            this.showNotification('Failed to load privacy report', 'error');
        }
    }

    calculatePrivacyScore(stats) {
        let score = 100;
        
        // Deduct for advertising cookies
        const adCookies = stats.categories?.advertising || 0;
        score -= Math.min(30, adCookies * 2);
        
        // Deduct for lack of encryption
        const encrypted = stats.encryptedCookies || 0;
        const total = stats.totalCookies || 1;
        const encryptionRatio = encrypted / total;
        score -= Math.max(0, 20 * (1 - encryptionRatio));
        
        // Add for secure cookies
        const secureCookies = stats.secureCookies || 0;
        score += Math.min(15, secureCookies);
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    async loadPrivacyEvents() {
        try {
            const { auditLog } = await chrome.runtime.sendMessage({ action: 'GET_AUDIT_LOG' });
            const privacyEvents = auditLog.filter(log => 
                log.action === 'ENCRYPTED' || 
                log.action === 'BLACKLIST_DELETED' ||
                log.action === 'RULE_APPLIED'
            ).slice(0, 10);
            
            this.renderPrivacyEvents(privacyEvents);
        } catch (error) {
            console.error('Error loading privacy events:', error);
        }
    }

    renderPrivacyEvents(events) {
        const container = document.getElementById('privacyEvents');
        
        if (!events || events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shield-alt"></i>
                    <p>No recent privacy events</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        events.forEach(event => {
            const eventItem = document.createElement('div');
            eventItem.className = 'event-item';
            
            const icon = this.getPrivacyEventIcon(event.action);
            const title = this.getPrivacyEventTitle(event.action);
            const description = this.getPrivacyEventDescription(event);
            
            eventItem.innerHTML = `
                <div class="event-icon">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="event-info">
                    <div class="event-title">${title}</div>
                    <div class="event-desc">${description}</div>
                    <div class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</div>
                </div>
            `;
            
            container.appendChild(eventItem);
        });
    }

    getPrivacyEventIcon(action) {
        switch(action) {
            case 'ENCRYPTED': return 'lock';
            case 'BLACKLIST_DELETED': return 'ban';
            case 'RULE_APPLIED': return 'cog';
            default: return 'shield-alt';
        }
    }

    getPrivacyEventTitle(action) {
        switch(action) {
            case 'ENCRYPTED': return 'Cookie Encrypted';
            case 'BLACKLIST_DELETED': return 'Cookie Blocked';
            case 'RULE_APPLIED': return 'Rule Applied';
            default: return 'Privacy Event';
        }
    }

    getPrivacyEventDescription(event) {
        switch(event.action) {
            case 'ENCRYPTED':
                return `Encrypted ${event.cookie} from ${event.domain}`;
            case 'BLACKLIST_DELETED':
                return `Blocked ${event.cookie} from ${event.domain}`;
            case 'RULE_APPLIED':
                return `Applied ${event.expiration}m rule to ${event.cookie}`;
            default:
                return event.action;
        }
    }

    async loadBackupHistory() {
        try {
            const backupHistory = await chrome.storage.local.get(['backupHistory']);
            const history = backupHistory.backupHistory || [];
            this.renderBackupHistory(history);
        } catch (error) {
            console.error('Error loading backup history:', error);
        }
    }

    renderBackupHistory(history) {
        const container = document.getElementById('backupList');
        
        if (!history || history.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No backup history</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        history.slice(0, 10).forEach(backup => {
            const backupItem = document.createElement('div');
            backupItem.className = 'backup-item';
            
            const time = new Date(backup.timestamp).toLocaleString();
            
            backupItem.innerHTML = `
                <div class="backup-name">${backup.name || 'Backup'}</div>
                <div class="backup-time">${time}</div>
                <div class="backup-actions">
                    <button class="btn-icon restore-backup" data-timestamp="${backup.timestamp}">
                        <i class="fas fa-undo"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(backupItem);
        });
    }

    setupCharts() {
        this.renderCategoryChart();
    }

    renderCategoryChart() {
        const ctx = document.getElementById('cookieChart').getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Essential', 'Analytics', 'Advertising', 'Functional', 'Security', 'Unknown'],
                datasets: [{
                    data: [25, 15, 10, 20, 15, 15],
                    backgroundColor: [
                        'rgba(76, 201, 240, 0.8)',
                        'rgba(114, 9, 183, 0.8)',
                        'rgba(247, 37, 133, 0.8)',
                        'rgba(248, 150, 30, 0.8)',
                        'rgba(67, 190, 145, 0.8)',
                        'rgba(108, 117, 125, 0.8)'
                    ],
                    borderColor: 'var(--card-bg)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'var(--light)',
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'var(--card-bg)',
                        titleColor: 'var(--light)',
                        bodyColor: 'var(--light)',
                        borderColor: 'var(--primary)',
                        borderWidth: 1
                    }
                }
            }
        });
    }

    updateChart(categories) {
        if (this.chart) {
            this.chart.data.datasets[0].data = [
                categories.essential || 0,
                categories.analytics || 0,
                categories.advertising || 0,
                categories.functional || 0,
                categories.security || 0,
                categories.unknown || 0
            ];
            this.chart.update();
        }
    }

    renderDomainStats(stats) {
        // This would require getting domain-level statistics
        // For now, show placeholder
        const container = document.getElementById('topDomains');
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-globe"></i>
                <p>Domain statistics will appear here</p>
            </div>
        `;
    }

    setupEventListeners() {
        // Add Rule Button
        document.getElementById('addRuleBtn').addEventListener('click', () => {
            this.showRuleModal();
        });
        
        // Save Default Rule
        document.getElementById('saveDefaultRule').addEventListener('click', () => {
            this.saveDefaultRule();
        });
        
        // Clear Audit Log
        document.getElementById('clearAuditBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all audit logs?')) {
                this.clearAuditLog();
            }
        });
        
        // Export Audit Log
        document.getElementById('exportAuditBtn').addEventListener('click', () => {
            this.exportAuditLog();
        });
        
        // Add to List Button
        document.getElementById('addToListBtn').addEventListener('click', () => {
            this.showListItemModal();
        });
        
        // List Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active tab
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Show corresponding list
                const listType = btn.dataset.list;
                document.querySelectorAll('.list-container').forEach(container => {
                    container.style.display = 'none';
                });
                document.getElementById(`${listType}Container`).style.display = 'block';
            });
        });
        
        // Regenerate Encryption Key
        document.getElementById('regenerateKeyBtn').addEventListener('click', () => {
            if (confirm('Regenerating the encryption key will make all previously encrypted cookies unreadable. Continue?')) {
                this.regenerateEncryptionKey();
            }
        });
        
        // Export Encryption Key
        document.getElementById('exportKeyBtn').addEventListener('click', () => {
            this.exportEncryptionKey();
        });
        
        // Save Encryption Settings
        document.getElementById('saveEncryptionSettings').addEventListener('click', () => {
            this.saveEncryptionSettings();
        });
        
        // Open Full Report
        document.getElementById('openReportBtn').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('privacy-report.html') });
        });
        
        // Generate Report
        document.getElementById('generateReportBtn').addEventListener('click', () => {
            this.loadPrivacyReport();
            this.showNotification('Privacy report updated', 'success');
        });
        
        // Sync Checkbox
        document.getElementById('enableSync').addEventListener('change', (e) => {
            const syncControls = document.getElementById('syncControls');
            syncControls.style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Setup Sync
        document.getElementById('setupSyncBtn').addEventListener('click', () => {
            this.setupCloudSync();
        });
        
        // Create Backup
        document.getElementById('createBackupBtn').addEventListener('click', async () => {
            try {
                const syncManager = new SyncManager();
                const backup = await syncManager.exportBackup();
                
                // Trigger download
                const dataStr = JSON.stringify(backup, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                
                const link = document.createElement('a');
                link.setAttribute('href', dataUri);
                link.setAttribute('download', `cookie-guardian-backup-${new Date().toISOString().split('T')[0]}.json`);
                link.click();
                
                // Save to history
                await this.saveBackupToHistory(backup);
                
                this.showNotification('Backup created successfully', 'success');
            } catch (error) {
                console.error('Error creating backup:', error);
                this.showNotification('Failed to create backup', 'error');
            }
        });
        
        // Restore Backup
        document.getElementById('restoreBackupBtn').addEventListener('click', () => {
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
                        
                        // Reload all data
                        await this.loadRules();
                        await this.loadLists();
                        await this.loadStats();
                        await this.loadEncryptionStatus();
                    } catch (error) {
                        console.error('Error restoring backup:', error);
                        this.showNotification('Failed to restore backup. Invalid format.', 'error');
                    }
                };
                
                reader.readAsText(file);
            };
            
            input.click();
        });
        
        // Import/Export
        document.getElementById('importExportBtn').addEventListener('click', () => {
            this.showImportExportModal();
        });
        
        // Rule Modal
        const ruleModal = document.getElementById('ruleModal');
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            ruleModal.classList.remove('active');
        });
        
        document.getElementById('cancelBtn').addEventListener('click', () => {
            ruleModal.classList.remove('active');
        });
        
        // Rule Form Submission
        document.getElementById('ruleForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRule();
        });
        
        // List Item Modal
        const listModal = document.getElementById('listItemModal');
        document.querySelectorAll('.close-list-modal, .cancel-list-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                listModal.classList.remove('active');
            });
        });
        
        // List Item Form Submission
        document.getElementById('listItemForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveListItem();
        });
        
        // Filter Audit Log
        document.getElementById('auditFilter').addEventListener('input', (e) => {
            this.filterAuditLog(e.target.value);
        });
        
        document.getElementById('auditTypeFilter').addEventListener('change', (e) => {
            this.filterAuditLog(null, e.target.value);
        });
    }

    showRuleModal(domain = '', rule = null) {
        const modal = document.getElementById('ruleModal');
        const form = document.getElementById('ruleForm');
        
        if (domain && rule) {
            // Edit mode
            form.dataset.mode = 'edit';
            form.dataset.domain = domain;
            document.getElementById('domainPattern').value = domain;
            document.getElementById('ruleExpiration').value = rule.expiration || 30;
            document.getElementById('ruleEncrypt').checked = rule.encrypt || false;
            document.getElementById('ruleAutoDelete').checked = rule.autoDelete || false;
            document.getElementById('rulePriority').value = rule.priority || 'medium';
        } else {
            // Add mode
            form.dataset.mode = 'add';
            form.reset();
            document.getElementById('rulePriority').value = 'medium';
        }
        
        modal.classList.add('active');
    }

    showListItemModal() {
        const modal = document.getElementById('listItemModal');
        modal.classList.add('active');
    }

    async saveRule() {
        const form = document.getElementById('ruleForm');
        const mode = form.dataset.mode;
        const domain = document.getElementById('domainPattern').value.trim();
        
        if (!domain) {
            this.showNotification('Please enter a domain pattern', 'error');
            return;
        }
        
        const rule = {
            expiration: parseInt(document.getElementById('ruleExpiration').value),
            encrypt: document.getElementById('ruleEncrypt').checked,
            autoDelete: document.getElementById('ruleAutoDelete').checked,
            priority: document.getElementById('rulePriority').value
        };
        
        try {
            await chrome.runtime.sendMessage({
                action: 'SAVE_RULE',
                domain: mode === 'edit' ? form.dataset.domain : domain,
                rule
            });
            
            document.getElementById('ruleModal').classList.remove('active');
            await this.loadRules();
            this.showNotification('Rule saved successfully', 'success');
        } catch (error) {
            console.error('Error saving rule:', error);
            this.showNotification('Failed to save rule', 'error');
        }
    }

    async saveDefaultRule() {
        const rule = {
            expiration: parseInt(document.getElementById('defaultExpiration').value),
            encrypt: document.getElementById('defaultEncrypt').checked
        };
        
        try {
            await chrome.runtime.sendMessage({
                action: 'SAVE_RULE',
                domain: '*',
                rule
            });
            
            this.showNotification('Default rule saved', 'success');
        } catch (error) {
            console.error('Error saving default rule:', error);
            this.showNotification('Failed to save default rule', 'error');
        }
    }

    async saveListItem() {
        const domainPattern = document.getElementById('listDomainPattern').value.trim();
        const listType = document.getElementById('newListItemType').value;
        const notes = document.getElementById('listItemNotes').value.trim();
        
        if (!domainPattern) {
            this.showNotification('Please enter a domain pattern', 'error');
            return;
        }
        
        try {
            await chrome.runtime.sendMessage({
                action: 'ADD_TO_LIST',
                listType: listType,
                pattern: domainPattern,
                notes: notes
            });
            
            document.getElementById('listItemModal').classList.remove('active');
            document.getElementById('listItemForm').reset();
            await this.loadLists();
            this.showNotification('Added to list', 'success');
        } catch (error) {
            console.error('Error adding to list:', error);
            this.showNotification('Failed to add to list', 'error');
        }
    }

    async deleteRule(domain) {
        if (!confirm(`Delete rule for ${domain}?`)) return;
        
        try {
            await chrome.runtime.sendMessage({
                action: 'DELETE_RULE',
                domain
            });
            
            await this.loadRules();
            this.showNotification('Rule deleted', 'success');
        } catch (error) {
            console.error('Error deleting rule:', error);
            this.showNotification('Failed to delete rule', 'error');
        }
    }

    editRule(domain) {
        // Get rule from storage and show modal
        chrome.runtime.sendMessage({ action: 'GET_RULES' }).then(({ rules }) => {
            if (rules[domain]) {
                this.showRuleModal(domain, rules[domain]);
            }
        });
    }

    async clearAuditLog() {
        await chrome.storage.local.set({ auditLog: [] });
        await this.loadAuditLog();
        this.showNotification('Audit log cleared', 'success');
    }

    async exportAuditLog() {
        const { auditLog } = await chrome.runtime.sendMessage({ action: 'GET_AUDIT_LOG' });
        
        const dataStr = JSON.stringify(auditLog, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `cookie-audit-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showNotification('Audit log exported', 'success');
    }

    async regenerateEncryptionKey() {
        try {
            const encryption = new CookieEncryption();
            await encryption.generateNewKey();
            
            this.showNotification('Encryption key regenerated', 'success');
            await this.loadEncryptionStatus();
        } catch (error) {
            console.error('Error regenerating encryption key:', error);
            this.showNotification('Failed to regenerate key', 'error');
        }
    }

    async exportEncryptionKey() {
        try {
            const data = await chrome.storage.local.get(['encryptionKey']);
            const key = data.encryptionKey;
            
            if (!key) {
                this.showNotification('No encryption key found', 'error');
                return;
            }
            
            const dataStr = JSON.stringify({ 
                encryptionKey: key,
                exported: new Date().toISOString(),
                warning: 'Keep this key safe! Without it, encrypted cookies cannot be decrypted.'
            }, null, 2);
            
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const exportFileDefaultName = `cookie-guardian-key-${new Date().toISOString().split('T')[0]}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            this.showNotification('Encryption key exported', 'success');
        } catch (error) {
            console.error('Error exporting encryption key:', error);
            this.showNotification('Failed to export key', 'error');
        }
    }

    async saveEncryptionSettings() {
        const settings = {
            autoEncryptBanking: document.getElementById('autoEncryptBanking').checked,
            autoEncryptSocial: document.getElementById('autoEncryptSocial').checked,
            autoEncryptShopping: document.getElementById('autoEncryptShopping').checked
        };
        
        await chrome.storage.local.set({ encryptionSettings: settings });
        this.showNotification('Encryption settings saved', 'success');
    }

    async setupCloudSync() {
        const email = document.getElementById('syncEmail').value;
        const password = document.getElementById('syncPassword').value;
        
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
            await this.loadSyncStatus();
        } catch (error) {
            console.error('Error enabling sync:', error);
            this.showNotification('Failed to enable sync', 'error');
        }
    }

    async saveBackupToHistory(backup) {
        try {
            const data = await chrome.storage.local.get(['backupHistory']);
            const history = data.backupHistory || [];
            
            history.unshift({
                timestamp: new Date().toISOString(),
                name: `Backup ${new Date().toLocaleString()}`,
                size: JSON.stringify(backup).length
            });
            
            // Keep only last 20 backups
            await chrome.storage.local.set({
                backupHistory: history.slice(0, 20)
            });
            
            await this.loadBackupHistory();
        } catch (error) {
            console.error('Error saving backup history:', error);
        }
    }

    showImportExportModal() {
        const modalContent = `
            <div class="modal-header">
                <h3>Import/Export Settings</h3>
                <button class="btn-icon close-import-export">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="import-export-options">
                    <div class="option">
                        <h4><i class="fas fa-upload"></i> Import Rules</h4>
                        <p>Import rules from a JSON file</p>
                        <button class="btn-secondary" id="importRulesBtn">
                            Import Rules
                        </button>
                    </div>
                    
                    <div class="option">
                        <h4><i class="fas fa-download"></i> Export Rules</h4>
                        <p>Export all rules to a JSON file</p>
                        <button class="btn-secondary" id="exportRulesBtn">
                            Export Rules
                        </button>
                    </div>
                    
                    <div class="option">
                        <h4><i class="fas fa-file-export"></i> Export All Data</h4>
                        <p>Export everything (rules, lists, settings)</p>
                        <button class="btn-secondary" id="exportAllBtn">
                            Export All
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.showCustomModal(modalContent);
        
        // Add event listeners
        document.getElementById('importRulesBtn').addEventListener('click', () => {
            this.importRules();
        });
        
        document.getElementById('exportRulesBtn').addEventListener('click', async () => {
            const { rules } = await chrome.runtime.sendMessage({ action: 'GET_RULES' });
            
            const dataStr = JSON.stringify(rules, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', `cookie-guardian-rules-${new Date().toISOString().split('T')[0]}.json`);
            linkElement.click();
            
            this.showNotification('Rules exported', 'success');
            this.closeCustomModal();
        });
        
        document.getElementById('exportAllBtn').addEventListener('click', async () => {
            try {
                const syncManager = new SyncManager();
                const backup = await syncManager.exportBackup();
                
                const dataStr = JSON.stringify(backup, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', `cookie-guardian-full-${new Date().toISOString().split('T')[0]}.json`);
                linkElement.click();
                
                this.showNotification('All data exported', 'success');
                this.closeCustomModal();
            } catch (error) {
                console.error('Error exporting all data:', error);
                this.showNotification('Failed to export data', 'error');
            }
        });
        
        document.querySelector('.close-import-export').addEventListener('click', () => {
            this.closeCustomModal();
        });
    }

    importRules() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const rules = JSON.parse(event.target.result);
                    
                    if (typeof rules !== 'object') {
                        throw new Error('Invalid rules format');
                    }
                    
                    // Merge with existing rules
                    const existing = await chrome.runtime.sendMessage({ action: 'GET_RULES' });
                    const mergedRules = { ...existing.rules, ...rules };
                    
                    await chrome.storage.local.set({ siteRules: mergedRules });
                    
                    this.showNotification('Rules imported successfully', 'success');
                    await this.loadRules();
                    this.closeCustomModal();
                } catch (error) {
                    console.error('Error importing rules:', error);
                    this.showNotification('Failed to import rules. Invalid format.', 'error');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    showCustomModal(content) {
        // Remove existing custom modals
        const existing = document.querySelectorAll('.custom-modal-overlay');
        existing.forEach(m => m.remove());
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
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
        modal.className = 'custom-modal-content';
        modal.style.cssText = `
            background: var(--card-bg);
            border-radius: 12px;
            padding: 0;
            max-width: 500px;
            width: 90%;
            border: 1px solid var(--border-color);
            animation: slideIn 0.3s ease;
        `;
        
        modal.innerHTML = content;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeCustomModal();
            }
        });
    }

    closeCustomModal() {
        const overlay = document.querySelector('.custom-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeIn 0.3s ease reverse';
            setTimeout(() => overlay.remove(), 300);
        }
    }

    filterAuditLog(textFilter = null, typeFilter = null) {
        // This would filter the displayed audit log
        // For now, just reload
        this.loadAuditLog();
        this.showNotification('Filter applied', 'info');
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n => n.remove());
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'notification';
        
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
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? 'var(--success)' : 
                        type === 'error' ? 'var(--danger)' : 
                        type === 'warning' ? 'var(--warning)' : 'var(--info)'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CookieGuardianOptions();
});