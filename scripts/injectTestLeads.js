require('dotenv').config();
const { db } = require('../firebase');
const { ref, set, get, update } = require('firebase/database');

async function injectTestLeads() {
    const testEmails = [
        'gyno3432@gmail.com',
        'hajraamjad252@gmail.com',
        'huraramalak82@gmail.com',
        'huraramalik088@gmail.com',
        'tamoorpixel29@gmail.com'
    ];

    console.log("Injecting test leads...");

    try {
        const updates = {};
        testEmails.forEach(email => {
            const id = email.replace(/[.#$[\]]/g, '_');
            updates[id] = {
                id: id,
                email: email,
                full_name: "shayan malik",
                company: "apple",
                status: "not_sent",
                is_test: true,
                mailbox_used: null,
                last_contacted_at: null,
                history: []
            };
        });

        await update(ref(db, 'leads'), updates);
        console.log("Test leads injected successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Failed to inject test leads:", e);
        process.exit(1);
    }
}

injectTestLeads();
