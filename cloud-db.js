// cloud-db.js — Shared Cloud Database for GitHub Pages (Replaces localStorage across all devices)
window.FIREBASE_DB_URL = 'https://firebasedatabase.app'; // <-- PASTE YOUR FIREBASE URL HERE (NO SLASH AT END)

window.CloudDB = {
    // Get or create unique ID for the current phone/PC browser
    getDeviceId() {
        let id = localStorage.getItem('mujaddidiDeviceId');
        if (!id) {
            id = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            localStorage.setItem('mujaddidiDeviceId', id);
        }
        return id;
    },

    getDeviceLabel() {
        const ua = navigator.userAgent;
        if (/Android/i.test(ua)) return 'Android Phone';
        if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
        if (/Edg/i.test(ua)) return 'Windows (Edge)';
        if (/Chrome/i.test(ua)) return 'Windows / PC (Chrome)';
        return 'Web Browser';
    },

    safeKey(str) {
        return String(str || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, '_');
    },

    // Pull latest users, orders, and active device sessions from Firebase
    async syncAll(username = '') {
        try {
            const res = await fetch(`${window.FIREBASE_DB_URL}/storeData.json`);
            if (!res.ok) return { users: [], orders: [], activeDevices: [] };

            const data = (await res.json()) || {};
            const users = data.users ? Object.values(data.users) : [];
            const orders = data.orders
                ? Object.values(data.orders).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                : [];

            // Keep local mirror updated so your existing UI functions read it seamlessly
            localStorage.setItem('mujaddidiUsers', JSON.stringify(users));
            localStorage.setItem('storeOrdersDatabaseQueue', JSON.stringify(orders));

            const key = this.safeKey(username);
            const sessionsObj = (data.sessions && key && data.sessions[key]) ? data.sessions[key] : {};
            const activeDevices = Object.values(sessionsObj);

            return { users, orders, activeDevices };
        } catch (err) {
            console.warn('Cloud sync error:', err);
            return { users: [], orders: [], activeDevices: [] };
        }
    },

    // Save a new registered user to Firebase
    async registerUser(userObj) {
        const key = this.safeKey(userObj.username);
        await fetch(`${window.FIREBASE_DB_URL}/storeData/users/${key}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userObj)
        });
    },

    // Record active device login session in Firebase
    async loginDevice(username) {
        const key = this.safeKey(username);
        const deviceId = this.getDeviceId();
        await fetch(`${window.FIREBASE_DB_URL}/storeData/sessions/${key}/${deviceId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: deviceId,
                deviceName: this.getDeviceLabel(),
                lastActive: new Date().toLocaleString('en-IN')
            })
        });
        const synced = await this.syncAll(username);
        return synced.activeDevices;
    },

    // Remove current device or log out all other devices
    async logoutDevice(username, logoutOthers = false) {
        const key = this.safeKey(username);
        const deviceId = this.getDeviceId();
        if (logoutOthers) {
            await fetch(`${window.FIREBASE_DB_URL}/storeData/sessions/${key}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    [deviceId]: {
                        deviceId: deviceId,
                        deviceName: this.getDeviceLabel(),
                        lastActive: new Date().toLocaleString('en-IN')
                    }
                })
            });
        } else {
            await fetch(`${window.FIREBASE_DB_URL}/storeData/sessions/${key}/${deviceId}.json`, {
                method: 'DELETE'
            });
        }
        const synced = await this.syncAll(username);
        return synced.activeDevices;
    },

    // Save a new order to Firebase from any device
    async saveOrder(orderPayload) {
        orderPayload.timestamp = Date.now();
        await fetch(`${window.FIREBASE_DB_URL}/storeData/orders/MJD_${orderPayload.orderId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });
    }
};
