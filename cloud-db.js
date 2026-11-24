window.EMAILJS_SERVICE_ID = 'service_tju7vgl';
window.EMAILJS_TEMPLATE_ID = 'template_sd8xdzm';
window.EMAILJS_PUBLIC_KEY = 'oEsfnza8TzSc7dMTy';

// cloud-db.js — Permanent Cloud Vault for GitHub Pages & Local file:/// (Immune to Browser History Clear)
window.FIREBASE_DB_URL = 'https://mujaddidi-collection-default-rtdb.asia-southeast1.firebasedatabase.app/'; // <-- PASTE YOUR FIREBASE URL HERE

window.CloudDB = {
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

    // Save user's shopping cart to Firebase so Website & Mobile App share the exact same cart
    async saveCart(username, cartItems) {
        if (!username) return;
        const key = this.safeKey(username);
        await fetch(`${window.FIREBASE_DB_URL}/storeData/carts/${key}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cartItems || [])
        });
    },

    // Fetch user's synced shopping cart from Firebase
    async getCart(username) {
        if (!username) return [];
        const key = this.safeKey(username);
        try {
            const res = await fetch(`${window.FIREBASE_DB_URL}/storeData/carts/${key}.json`);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : (data ? Object.values(data) : []);
        } catch (err) {
            console.warn('Cart fetch error:', err);
            return [];
        }
    },


    // Record every user action permanently in Firebase (never deleted)
    async logActivity(username, action, details = '') {
        if (!username) return;
        const entry = {
            id: 'ACT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            username: username,
            action: action, // e.g. 'Registered', 'Logged In', 'Placed Order', 'Cancelled Order', 'Logged Out'
            details: details,
            device: this.getDeviceLabel(),
            time: new Date().toLocaleString('en-IN'),
            timestamp: Date.now()
        };
        await fetch(`${window.FIREBASE_DB_URL}/storeData/activityLog/${entry.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
    },

    // Pull all permanent users, orders, sessions, and activity logs from Firebase
    async syncAll(username = '') {
        try {
            const res = await fetch(`${window.FIREBASE_DB_URL}/storeData.json`);
            if (!res.ok) return { users: [], orders: [], activeDevices: [], allSessions: {}, activityLog: [] };

            const data = (await res.json()) || {};

            // Filter out any null entries & normalize users
            const users = data.users
                ? Object.values(data.users).filter(u => u && u.username)
                : [];

            // Normalize every order so admin.html & account.html always render every row cleanly
            const rawOrders = data.orders ? Object.values(data.orders).filter(Boolean) : [];
            const orders = rawOrders
                .map(o => {
                    const normalizedItems = Array.isArray(o.items)
                        ? o.items
                        : (o.items && typeof o.items === 'object' ? Object.values(o.items) : []);

                    const safeCustomer = (o.customer && typeof o.customer === 'object')
                        ? o.customer
                        : { accountUser: o.accountUser || 'Guest', name: o.customerName || 'Customer' };

                    if (!safeCustomer.accountUser) safeCustomer.accountUser = 'Guest';
                    if (!safeCustomer.name) safeCustomer.name = safeCustomer.accountUser;

                    const fallbackSummary = normalizedItems
                        .map(i => `${i.name || i.title || 'Product'} (x${i.quantity || i.qty || 1})`)
                        .join(', ');

                    return {
                        ...o,
                        orderId: o.orderId || '000000',
                        date: o.date || 'N/A',
                        items: normalizedItems,
                        itemsDescription: o.itemsDescription || fallbackSummary || 'Collection Order',
                        customer: safeCustomer,
                        shippingAddress: o.shippingAddress || o.address || 'Address Not Provided',
                        totalPaid: parseFloat(o.totalPaid || o.totalAmount || 0),
                        totalAmount: parseFloat(o.totalAmount || o.totalPaid || 0),
                        status: o.status || 'Processing'
                    };
                })
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            const activityLog = data.activityLog
                ? Object.values(data.activityLog).filter(Boolean).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                : [];
            const allSessions = data.sessions || {};

            localStorage.setItem('mujaddidiUsers', JSON.stringify(users));
            localStorage.setItem('storeOrdersDatabaseQueue', JSON.stringify(orders));
            localStorage.setItem('mujaddidiActivityLog', JSON.stringify(activityLog));
            localStorage.setItem('mujaddidiAllSessions', JSON.stringify(allSessions));

            const key = this.safeKey(username);
            const userSessObj = (key && allSessions[key]) ? allSessions[key] : {};
            const activeDevices = Object.values(userSessObj).filter(s => s && s.status === 'Active');

            return { users, orders, activeDevices, allSessions, activityLog };
        } catch (err) {
            console.warn('Cloud sync error:', err);
            return { users: [], orders: [], activeDevices: [], allSessions: {}, activityLog: [] };
        }
    },


    // Save a newly registered user permanently
    async registerUser(userObj) {
        const key = this.safeKey(userObj.username);
        userObj.registeredAt = new Date().toLocaleString('en-IN');
        userObj.accountStatus = 'Registered';
        await fetch(`${window.FIREBASE_DB_URL}/storeData/users/${key}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userObj)
        });
        await this.logActivity(userObj.username, 'Registered Account', `Email: ${userObj.email}`);
    },

    // Mark device session Active on login (never deletes previous sessions)
    async loginDevice(username) {
        const key = this.safeKey(username);
        const deviceId = this.getDeviceId();
        const now = new Date().toLocaleString('en-IN');

        await fetch(`${window.FIREBASE_DB_URL}/storeData/sessions/${key}/${deviceId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: deviceId,
                deviceName: this.getDeviceLabel(),
                status: 'Active',
                lastActive: now
            })
        });

        await fetch(`${window.FIREBASE_DB_URL}/storeData/users/${key}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountStatus: 'Active', lastSeen: now })
        });

        await this.logActivity(username, 'Logged In', `Device: ${this.getDeviceLabel()}`);
        const synced = await this.syncAll(username);
        return synced.activeDevices;
    },

    // Mark device as "Logged Out" instead of deleting it so Admin always sees the history
    async logoutDevice(username, logoutOthers = false) {
        const key = this.safeKey(username);
        const deviceId = this.getDeviceId();
        const now = new Date().toLocaleString('en-IN');

        const syncedBefore = await this.syncAll(username);
        const userSessObj = (syncedBefore.allSessions && syncedBefore.allSessions[key]) || {};

        if (logoutOthers) {
            for (const [devKey, devInfo] of Object.entries(userSessObj)) {
                if (devKey !== deviceId) {
                    await fetch(`${window.FIREBASE_DB_URL}/storeData/sessions/${key}/${devKey}.json`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'Logged Out (Remote)', lastActive: now })
                    });
                }
            }
            await this.logActivity(username, 'Logged Out Other Devices');
        } else {
            await fetch(`${window.FIREBASE_DB_URL}/storeData/sessions/${key}/${deviceId}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Logged Out', lastActive: now })
            });
            await fetch(`${window.FIREBASE_DB_URL}/storeData/users/${key}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountStatus: 'Logged Out', lastSeen: now })
            });
            await this.logActivity(username, 'Logged Out', `Device: ${this.getDeviceLabel()}`);
        }

        const syncedAfter = await this.syncAll(username);
        return syncedAfter.activeDevices;
    },

    // Save a new order permanently & log the activity
    async saveOrder(orderPayload) {
        orderPayload.timestamp = Date.now();
        await fetch(`${window.FIREBASE_DB_URL}/storeData/orders/MJD_${orderPayload.orderId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });
        const user = (orderPayload.customer && orderPayload.customer.accountUser) || 'Guest';
        await this.logActivity(user, 'Placed Order', `Order #MJD-${orderPayload.orderId} (Rs. ${orderPayload.totalPaid})`);
    },

    // Update order status permanently & log the activity
    async updateOrder(orderId, updatedFields, actorName = 'Customer') {
        await fetch(`${window.FIREBASE_DB_URL}/storeData/orders/MJD_${orderId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedFields)
        });
        await this.logActivity(actorName, 'Updated Order', `Order #MJD-${orderId} → ${updatedFields.status}`);
    },

    async sendEmailOTP(email, name = 'Customer') {
        const cleanEmail = email.trim().toLowerCase();
        const key = this.safeKey(cleanEmail);
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 5 * 60 * 1000;

        // 1. Save OTP in Firebase Realtime Database
        await fetch(`${window.FIREBASE_DB_URL}/storeData/otps/${key}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp, expiresAt, email: cleanEmail }),
        });

        // 2. Send 6-Digit OTP via EmailJS REST API
        const emailJsUrl = ['https://api.emailjs.com/api/v1.0/email/send']

        const res = await fetch(emailJsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: window.EMAILJS_SERVICE_ID,
                template_id: window.EMAILJS_TEMPLATE_ID,
                user_id: window.EMAILJS_PUBLIC_KEY,
                template_params: {
                    to_email: cleanEmail,
                    to_name: name || 'Customer',
                    otp_code: otp,
                },
            }),
        });

        const responseText = await res.text();
        if (!res.ok) {
            throw new Error(`EmailJS (${res.status}): ${responseText}`);
        }

        // 3. Trigger Browser System Notification Banner
        if ('Notification' in window) {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                new Notification('Mujaddidi Collection • Verification OTP', {
                    body: `Your 6-digit OTP (${otp}) has been sent to ${cleanEmail}.`,
                    icon: 'images/Logo resized.png'
                });
            }
        }
        return true;
    },

    async verifyEmailOTP(email, enteredOtp) {
        const cleanEmail = email.trim().toLowerCase();
        const key = this.safeKey(cleanEmail);
        const res = await fetch(`${window.FIREBASE_DB_URL}/storeData/otps/${key}.json`);
        const record = await res.json();

        if (!record || !record.otp) return false;
        if (Date.now() > record.expiresAt) return false;
        if (String(record.otp) !== String(enteredOtp).trim()) return false;

        await fetch(`${window.FIREBASE_DB_URL}/storeData/otps/${key}.json`, { method: 'DELETE' });
        return true;
    },


};


