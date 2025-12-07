// lib/encryption.js - Web Crypto API implementation
class CookieEncryption {
    constructor() {
        this.algorithm = { name: 'AES-GCM', length: 256 };
        this.key = null;
        this.init();
    }

    async init() {
        await this.loadOrGenerateKey();
    }

    async loadOrGenerateKey() {
        const stored = await chrome.storage.local.get(['encryptionKey']);
        if (stored.encryptionKey) {
            const keyData = this.base64ToArrayBuffer(stored.encryptionKey);
            this.key = await crypto.subtle.importKey(
                'raw', keyData, this.algorithm, false, ['encrypt', 'decrypt']
            );
        } else {
            await this.generateNewKey();
        }
    }

    async generateNewKey() {
        this.key = await crypto.subtle.generateKey(
            this.algorithm, true, ['encrypt', 'decrypt']
        );
        const keyData = await crypto.subtle.exportKey('raw', this.key);
        await chrome.storage.local.set({
            encryptionKey: this.arrayBufferToBase64(keyData)
        });
    }

    async encryptCookie(value, domain) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const data = encoder.encode(value);
        
        const encrypted = await crypto.subtle.encrypt(
            { ...this.algorithm, iv },
            this.key,
            data
        );

        return {
            encrypted: this.arrayBufferToBase64(encrypted),
            iv: this.arrayBufferToBase64(iv),
            domain,
            timestamp: Date.now()
        };
    }

    async decryptCookie(encryptedData) {
        const decrypted = await crypto.subtle.decrypt(
            { ...this.algorithm, iv: this.base64ToArrayBuffer(encryptedData.iv) },
            this.key,
            this.base64ToArrayBuffer(encryptedData.encrypted)
        );

        return new TextDecoder().decode(decrypted);
    }

    // Utility methods
    arrayBufferToBase64(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}