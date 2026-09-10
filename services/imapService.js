require('dotenv').config();
const imaps = require('imap-simple');
const { db } = require('../firebase');
const { ref, get, update } = require('firebase/database');

const mailboxes = [
    process.env.MAILBOX_1,
    process.env.MAILBOX_2,
    process.env.MAILBOX_3,
    process.env.MAILBOX_4,
    process.env.MAILBOX_5
].filter(Boolean);

const pass = process.env.MAILBOX_PASS;

async function checkResponses() {
    console.log("Starting IMAP response check...");
    
    // First, fetch all leads that are currently 'sent' or 'fu1', 'fu2'
    const snapshot = await get(ref(db, 'leads'));
    if (!snapshot.exists()) return;
    
    const leadsObj = snapshot.val();
    const sentLeads = Object.entries(leadsObj).filter(([id, lead]) => 
        ['sent', 'fu1', 'fu2', 'fu3'].includes(lead.status) && lead.email
    );

    if (sentLeads.length === 0) {
        console.log("No sent leads to check responses for.");
        return;
    }

    // Connect to each mailbox and search for unread emails
    for (const email of mailboxes) {
        const config = {
            imap: {
                user: email,
                password: pass,
                host: process.env.IMAP_HOST || 'imappro.zoho.com',
                port: parseInt(process.env.IMAP_PORT || '993'),
                tls: true,
                authTimeout: 3000
            }
        };

        try {
            console.log(`Connecting to IMAP for ${email}...`);
            const connection = await imaps.connect(config);
            if (connection) {
                connection.on('error', (err) => {
                    console.error(`IMAP connection error for ${email}:`, err ? err.message : err);
                });
            }
            await connection.openBox('INBOX');
            
            // Search for all messages from yesterday and today
            const delay = 24 * 3600 * 1000;
            const yesterday = new Date(Date.now() - delay).toISOString();
            const searchCriteria = ['UNSEEN', ['SINCE', yesterday]];
            
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT'],
                markSeen: false // don't mark as read yet so the user can still read it in their client
            };

            const messages = await connection.search(searchCriteria, fetchOptions);
            
            for (const item of messages) {
                const headerParts = item.parts.find(p => p.which === 'HEADER');
                if (headerParts && headerParts.body && headerParts.body.from) {
                    const fromStr = headerParts.body.from[0];
                    // Extract email address from "Name <email@domain.com>"
                    const match = fromStr.match(/<(.+)>/);
                    const fromEmail = match ? match[1] : fromStr;

                    // Check if this fromEmail is in our sentLeads
                    const respondingLead = sentLeads.find(([id, lead]) => lead.email.toLowerCase() === fromEmail.toLowerCase());
                    
                    if (respondingLead) {
                        const [id, lead] = respondingLead;
                        console.log(`Found response from ${lead.email}! Marking as 'response'`);
                        
                        await update(ref(db, `leads/${id}`), {
                            status: 'response',
                            history: [...(lead.history || []), {
                                action: 'response_received',
                                date: new Date().toISOString(),
                                mailbox: email
                            }]
                        });
                    }
                }
            }
            
            connection.end();
        } catch (err) {
            console.error(`IMAP error for ${email}:`, err.message);
        }
    }
    
    console.log("IMAP check complete.");
}

module.exports = { checkResponses };
