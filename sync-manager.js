// sync-manager.js - Cloud synchronization and backup
class SyncManager {
    constructor() {
        this.syncEnabled = false;
        this.syncEndpoint = 'https://api.cookieguardian.com/sync'; // Example endpoint
        this.init();
    }

    async init() {
        const settings = await chrome.storage.local.get(['syncSettings']);
        this.syncEnabled = settings.syncSettings?.enabled || false;
        this.setupSyncListeners();
    }

    setupSyncListeners() {
        // Sync on changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && this.syncEnabled) {
                this.syncChanges(changes);
            }
        });

        // Periodic sync
        chrome.alarms.create('periodicSync', { periodInMinutes: 30 });
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'periodicSync' && this.syncEnabled) {
                this.fullSync();
            }
        });
    }

    async syncChanges(changes) {
        const syncData = {};
        
        for (const [key, change] of Object.entries(changes)) {
            if (this.shouldSyncKey(key)) {
                syncData[key] = change.newValue;
            }
        }
        
        if (Object.keys(syncData).length > 0) {
            await this.sendToCloud('PATCH', { changes: syncData });
        }
    }

    async fullSync() {
        try {
            const allData = await chrome.storage.local.get(null);
            const syncData = this.filterSyncData(allData);
            
            const response = await this.sendToCloud('POST', { data: syncData });
            
            if (response.success) {
                console.log('Full sync completed');
            }
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    async restoreFromCloud() {
        try {
            const response = await this.sendToCloud('GET', {});
            
            if (response.data) {
                await chrome.storage.local.set(response.data);
                return true;
            }
        } catch (error) {
            console.error('Restore failed:', error);
            throw error;
        }
        return false;
    }

    async exportBackup() {
        const allData = await chrome.storage.local.get(null);
        const filteredData = this.filterSyncData(allData);
        
        return {
            timestamp: new Date().toISOString(),
            version: '1.0',
            data: filteredData
        };
    }

    async importBackup(backupData) {
        // Validate backup
        if (!this.validateBackup(backupData)) {
            throw new Error('Invalid backup format');
        }
        
        await chrome.storage.local.set(backupData.data);
        return true;
    }

    filterSyncData(data) {
        const filtered = {};
        const syncKeys = ['siteRules', 'auditLog', 'syncSettings', 'whitelist', 'blacklist'];
        
        syncKeys.forEach(key => {
            if (data[key] !== undefined) {
                filtered[key] = data[key];
            }
        });
        
        return filtered;
    }

    shouldSyncKey(key) {
        const syncKeys = ['siteRules', 'auditLog', 'whitelist', 'blacklist'];
        return syncKeys.includes(key);
    }

    validateBackup(data) {
        return data && 
               data.timestamp && 
               data.version && 
               data.data && 
               typeof data.data === 'object';
    }

    async sendToCloud(method, data) {
        if (!this.syncEnabled) {
            throw new Error('Sync not enabled');
        }
        
        const response = await fetch(this.syncEndpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getAuthToken()}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`Cloud sync failed: ${response.statusText}`);
        }
        
        return response.json();
    }

    async getAuthToken() {
        const settings = await chrome.storage.local.get(['syncSettings']);
        return settings.syncSettings?.authToken || null;
    }

    async enableSync(authToken) {
        await chrome.storage.local.set({
            syncSettings: {
                enabled: true,
                authToken,
                lastSync: new Date().toISOString()
            }
        });
        
        this.syncEnabled = true;
        await this.fullSync();
    }

    async disableSync() {
        await chrome.storage.local.set({
            syncSettings: { enabled: false }
        });
        
        this.syncEnabled = false;
    }
}