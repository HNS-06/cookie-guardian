// Utility functions for Cookie Guardian

class CookieGuardianUtils {
    /**
     * Safe message sending with error handling
     */
    static async sendMessage(message) {
        try {
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            console.error('Message sending error:', error);
            throw new Error(`Failed to communicate with background service: ${error.message}`);
        }
    }

    /**
     * Safe storage get with fallback
     */
    static async getStorage(keys, defaults = {}) {
        try {
            const data = await chrome.storage.local.get(keys);
            return { ...defaults, ...data };
        } catch (error) {
            console.error('Storage retrieval error:', error);
            return defaults;
        }
    }

    /**
     * Safe storage set
     */
    static async setStorage(data) {
        try {
            await chrome.storage.local.set(data);
            return true;
        } catch (error) {
            console.error('Storage write error:', error);
            return false;
        }
    }

    /**
     * Format time duration
     */
    static formatDuration(seconds) {
        if (!seconds || seconds <= 0) return 'Expired';
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Validate email format
     */
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Escape HTML entities
     */
    static escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Debounce function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Check if object is empty
     */
    static isEmpty(obj) {
        return Object.keys(obj).length === 0;
    }

    /**
     * Deep clone object
     */
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
}
