// lib/categories.js - Cookie classification system
class CookieCategorizer {
    constructor() {
        this.categories = {
            essential: {
                patterns: [
                    /(session|auth|token|login|jwt)/i,
                    /__Secure-/,
                    /__Host-/
                ],
                description: 'Required for site functionality'
            },
            analytics: {
                patterns: [
                    /_ga[_:]/,
                    /_gid/,
                    /_gat/,
                    /amplitude/,
                    /mixpanel/,
                    /hotjar/i
                ],
                description: 'Tracking user behavior'
            },
            advertising: {
                patterns: [
                    /_fbp/,
                    /_fbc/,
                    /ads/,
                    /doubleclick/i,
                    /googleadservices/i
                ],
                description: 'Advertising and targeting'
            },
            functional: {
                patterns: [
                    /preferences?/i,
                    /settings?/i,
                    /theme/i,
                    /language/i
                ],
                description: 'User preferences'
            },
            security: {
                patterns: [
                    /csrf/i,
                    /xsrf/i,
                    /security/i,
                    /nonce/i
                ],
                description: 'Security protection'
            },
            unknown: {
                patterns: [],
                description: 'Uncategorized'
            }
        };
    }

    categorizeCookie(cookie) {
        for (const [category, data] of Object.entries(this.categories)) {
            if (category === 'unknown') continue;
            
            for (const pattern of data.patterns) {
                if (pattern.test(cookie.name) || pattern.test(cookie.domain)) {
                    return {
                        category,
                        description: data.description,
                        risk: this.calculateRisk(category)
                    };
                }
            }
        }
        
        return {
            category: 'unknown',
            description: 'Uncategorized cookie',
            risk: 'medium'
        };
    }

    calculateRisk(category) {
        const riskLevels = {
            essential: 'low',
            security: 'low',
            functional: 'low',
            analytics: 'medium',
            advertising: 'high',
            unknown: 'medium'
        };
        return riskLevels[category] || 'medium';
    }

    getCategoryIcon(category) {
        const icons = {
            essential: 'shield-alt',
            analytics: 'chart-line',
            advertising: 'bullhorn',
            functional: 'sliders-h',
            security: 'lock',
            unknown: 'question-circle'
        };
        return icons[category] || 'question-circle';
    }

    getCategoryColor(category) {
        const colors = {
            essential: '#4cc9f0',
            analytics: '#7209b7',
            advertising: '#f72585',
            functional: '#f8961e',
            security: '#43aa8b',
            unknown: '#6c757d'
        };
        return colors[category] || '#6c757d';
    }
}