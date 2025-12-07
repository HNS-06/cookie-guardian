// privacy-report.js - Generate comprehensive privacy reports
class PrivacyReport {
    constructor() {
        this.categorizer = new CookieCategorizer();
        this.init();
    }

    async init() {
        await this.loadData();
        this.renderReport();
        this.setupEventListeners();
        this.setupCharts();
    }

    async loadData() {
        const cookies = await chrome.cookies.getAll({});
        const rules = await chrome.storage.local.get(['siteRules']);
        const auditLog = await chrome.storage.local.get(['auditLog']);
        
        this.data = {
            cookies,
            rules: rules.siteRules || {},
            auditLog: auditLog.auditLog || [],
            categorizedCookies: this.categorizeAllCookies(cookies)
        };
    }

    categorizeAllCookies(cookies) {
        return cookies.map(cookie => ({
            ...cookie,
            category: this.categorizer.categorizeCookie(cookie)
        }));
    }

    renderReport() {
        this.updateSummary();
        this.renderRiskAnalysis();
        this.renderDomainInsights();
        this.renderRecommendations();
    }

    updateSummary() {
        const categorized = this.data.categorizedCookies;
        
        document.getElementById('trackersBlocked').textContent = 
            categorized.filter(c => c.category.category === 'advertising').length;
        
        document.getElementById('cookiesProtected').textContent = 
            categorized.filter(c => c.category.risk === 'low').length;
        
        document.getElementById('autoDeleted').textContent = 
            this.data.auditLog.filter(log => log.action === 'AUTO_DELETE').length;
        
        document.getElementById('encryptedCount').textContent = 
            Object.values(this.data.rules).filter(rule => rule.encrypt).length;
        
        // Calculate privacy score
        const score = this.calculatePrivacyScore();
        document.getElementById('privacyScore').textContent = score;
        document.querySelector('.score-progress').style.width = `${score}%`;
    }

    calculatePrivacyScore() {
        const maxScore = 100;
        let score = maxScore;
        
        // Deduct for high-risk cookies
        const highRisk = this.data.categorizedCookies.filter(c => c.category.risk === 'high').length;
        score -= Math.min(30, highRisk * 2);
        
        // Deduct for no encryption
        const encryptedSites = Object.values(this.data.rules).filter(rule => rule.encrypt).length;
        score -= Math.max(0, 20 - (encryptedSites * 2));
        
        // Add for rules configured
        const rulesCount = Object.keys(this.data.rules).length;
        score += Math.min(15, rulesCount * 3);
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    renderRiskAnalysis() {
        const container = document.getElementById('riskAnalysis');
        const risks = this.analyzeRisks();
        
        container.innerHTML = risks.map(risk => `
            <div class="risk-item ${risk.level}">
                <div class="risk-icon">
                    <i class="fas fa-${risk.icon}"></i>
                </div>
                <div class="risk-info">
                    <h4>${risk.title}</h4>
                    <p>${risk.description}</p>
                </div>
                <div class="risk-action">
                    <button class="btn-small" onclick="${risk.action}">
                        ${risk.actionText}
                    </button>
                </div>
            </div>
        `).join('');
    }

    analyzeRisks() {
        const risks = [];
        const categorized = this.data.categorizedCookies;
        
        // High-risk advertising cookies
        const adCookies = categorized.filter(c => c.category.category === 'advertising');
        if (adCookies.length > 5) {
            risks.push({
                level: 'high',
                icon: 'bullhorn',
                title: 'Excessive Advertising Trackers',
                description: `Found ${adCookies.length} advertising cookies`,
                action: 'sanitizeAdCookies()',
                actionText: 'Remove Trackers'
            });
        }
        
        // Session cookies without expiration
        const sessionCookies = categorized.filter(c => !c.expirationDate);
        if (sessionCookies.length > 10) {
            risks.push({
                level: 'medium',
                icon: 'clock',
                title: 'Persistent Session Cookies',
                description: `${sessionCookies.length} cookies never expire`,
                action: 'setExpirationRules()',
                actionText: 'Set Rules'
            });
        }
        
        // Sites without encryption
        const sitesWithCookies = [...new Set(categorized.map(c => c.domain))];
        const sitesWithRules = Object.keys(this.data.rules);
        const unprotectedSites = sitesWithCookies.filter(site => 
            !sitesWithRules.some(rule => site.includes(rule))
        );
        
        if (unprotectedSites.length > 3) {
            risks.push({
                level: 'medium',
                icon: 'unlock',
                title: 'Unprotected Websites',
                description: `${unprotectedSites.length} sites have no cookie rules`,
                action: 'addProtectionRules()',
                actionText: 'Add Protection'
            });
        }
        
        return risks;
    }

    renderDomainInsights() {
        const container = document.getElementById('domainInsights');
        const domainData = this.aggregateDomainData();
        
        container.innerHTML = domainData.map(domain => `
            <tr>
                <td>
                    <i class="fas fa-globe"></i>
                    ${domain.name}
                </td>
                <td>${domain.cookieCount}</td>
                <td>${domain.trackers}</td>
                <td>
                    <span class="risk-badge ${domain.risk}">${domain.risk}</span>
                </td>
                <td>
                    <button class="btn-icon-small" onclick="viewDomainCookies('${domain.name}')">
                        <i class="fas fa-search"></i>
                    </button>
                    <button class="btn-icon-small" onclick="addDomainRule('${domain.name}')">
                        <i class="fas fa-cog"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    aggregateDomainData() {
        const domains = {};
        
        this.data.categorizedCookies.forEach(cookie => {
            const domain = cookie.domain.replace(/^\./, '');
            if (!domains[domain]) {
                domains[domain] = {
                    name: domain,
                    cookieCount: 0,
                    trackers: 0,
                    risk: 'low'
                };
            }
            
            domains[domain].cookieCount++;
            if (cookie.category.category === 'advertising') {
                domains[domain].trackers++;
            }
            
            // Update risk level
            if (cookie.category.risk === 'high' && domains[domain].risk !== 'high') {
                domains[domain].risk = 'high';
            } else if (cookie.category.risk === 'medium' && domains[domain].risk === 'low') {
                domains[domain].risk = 'medium';
            }
        });
        
        return Object.values(domains).sort((a, b) => b.cookieCount - a.cookieCount);
    }

    renderRecommendations() {
        const container = document.getElementById('recommendations');
        const recommendations = this.generateRecommendations();
        
        container.innerHTML = recommendations.map(rec => `
            <div class="recommendation">
                <i class="fas fa-${rec.icon}"></i>
                <div>
                    <h4>${rec.title}</h4>
                    <p>${rec.description}</p>
                </div>
                <button class="btn-small" onclick="${rec.action}">
                    ${rec.actionText}
                </button>
            </div>
        `).join('');
    }

    generateRecommendations() {
        const recommendations = [];
        const categorized = this.data.categorizedCookies;
        
        // Recommend encryption for banking sites
        const bankingCookies = categorized.filter(cookie => 
            /(bank|credit|paypal|stripe)/i.test(cookie.domain)
        );
        
        if (bankingCookies.length > 0) {
            recommendations.push({
                icon: 'lock',
                title: 'Encrypt Banking Cookies',
                description: 'Add encryption to cookies from financial websites',
                action: 'enableBankingEncryption()',
                actionText: 'Enable'
            });
        }
        
        // Recommend cleanup of old cookies
        const oldCookies = categorized.filter(cookie => {
            if (!cookie.expirationDate) return false;
            const age = Date.now() - (cookie.expirationDate * 1000);
            return age > 30 * 24 * 60 * 60 * 1000; // Older than 30 days
        });
        
        if (oldCookies.length > 10) {
            recommendations.push({
                icon: 'broom',
                title: 'Clean Old Cookies',
                description: `Remove ${oldCookies.length} cookies older than 30 days`,
                action: 'cleanOldCookies()',
                actionText: 'Clean Now'
            });
        }
        
        return recommendations;
    }

    setupCharts() {
        this.renderCategoryChart();
    }

    renderCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        const categories = this.aggregateCategories();
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categories.map(c => c.name),
                datasets: [{
                    data: categories.map(c => c.count),
                    backgroundColor: categories.map(c => c.color),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = categories.reduce((sum, c) => sum + c.count, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    aggregateCategories() {
        const counts = {};
        
        this.data.categorizedCookies.forEach(cookie => {
            const category = cookie.category.category;
            counts[category] = (counts[category] || 0) + 1;
        });
        
        return Object.entries(counts).map(([category, count]) => ({
            name: category.charAt(0).toUpperCase() + category.slice(1),
            count,
            color: this.categorizer.getCategoryColor(category)
        }));
    }

    setupEventListeners() {
        document.getElementById('generateReport').addEventListener('click', async () => {
            await this.loadData();
            this.renderReport();
        });
        
        document.getElementById('exportReport').addEventListener('click', () => {
            this.exportToPDF();
        });
    }

    async exportToPDF() {
        // This would use a PDF generation library
        // For now, we'll export as JSON
        const reportData = {
            generated: new Date().toISOString(),
            privacyScore: this.calculatePrivacyScore(),
            summary: this.getSummaryData(),
            risks: this.analyzeRisks(),
            recommendations: this.generateRecommendations()
        };
        
        const dataStr = JSON.stringify(reportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `privacy-report-${new Date().toISOString().split('T')[0]}.json`);
        link.click();
    }

    getSummaryData() {
        return {
            totalCookies: this.data.cookies.length,
            protectedCookies: this.data.categorizedCookies.filter(c => c.category.risk === 'low').length,
            trackersBlocked: this.data.categorizedCookies.filter(c => c.category.category === 'advertising').length,
            encryptedSites: Object.values(this.data.rules).filter(rule => rule.encrypt).length
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PrivacyReport();
});