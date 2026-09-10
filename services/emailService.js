require('dotenv').config();
const nodemailer = require('nodemailer');
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

const transporters = mailboxes.map(email => nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtppro.zoho.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
        user: email,
        pass: pass
    }
}));

function getFirstName(fullName) {
    if (!fullName) return 'there';
    return fullName.split(' ')[0];
}

async function startSending(testMode = false) {
    try {
        const snapshot = await get(ref(db, 'leads'));
        if (!snapshot.exists()) return;

        const leadsObj = snapshot.val();
        
        // Find leads that are not_sent
        // Limit to 20 emails per mailbox (e.g., 20 * 5 = 100 total for 5 mailboxes)
        const maxLimit = 20 * (transporters.length || 1);
        const notSentLeads = Object.entries(leadsObj)
            .filter(([id, lead]) => {
                const isCorrectMode = testMode ? lead.is_test === true : !lead.is_test;
                return lead.status === 'not_sent' && isCorrectMode;
            })
            .slice(0, maxLimit);

        if (notSentLeads.length === 0) {
            console.log("No leads to send to.");
            return;
        }

        console.log(`Starting to send emails to ${notSentLeads.length} leads...`);

        // We want to loop and send. Wait a few seconds between sends to avoid rate limits
        for (let i = 0; i < notSentLeads.length; i++) {
            const [id, lead] = notSentLeads[i];
            const mailboxIndex = i % transporters.length;
            const transporter = transporters[mailboxIndex];
            const senderEmail = mailboxes[mailboxIndex];

            const brand = lead.company || 'your company';
            const firstName = getFirstName(lead.full_name);

            const subject = `Quick question about ${brand}'s app`;
            const text = `Hi ${firstName},

Noticed ${brand} doesn't have its own mobile app yet, even with a strong store already in place.

Most repeat customers now shop from their phones, and without an app, you're paying to win them back each time through ads and discount emails instead of them just tapping straight back in.

We turn your Shopify store into a native iOS and Android app, live in weeks, on a simple monthly subscription — so repeat orders happen with one tap, not a search or an ad click.

Worth a quick reply if you'd like to see what that could look like for ${brand}?

Best,
TechniFuse`;

            const baseUrl = process.env.APP_URL || 'https://donmy.online';
            const htmlContent = text.replace(/\n/g, '<br>') + `<br><br><img src="${baseUrl}/api/track/open/${id}" width="1" height="1" style="display:none;" alt="" />`;

            try {
                await transporter.sendMail({
                    from: `"TechniFuse" <${senderEmail}>`,
                    to: lead.email,
                    subject: subject,
                    text: text,
                    html: htmlContent
                });

                // Update Firebase
                await update(ref(db, `leads/${id}`), {
                    status: 'sent',
                    mailbox_used: mailboxIndex + 1,
                    last_contacted_at: new Date().toISOString(),
                    history: [...(lead.history || []), {
                        action: 'sent',
                        date: new Date().toISOString(),
                        mailbox: senderEmail
                    }]
                });

                console.log(`Successfully sent to ${lead.email} using ${senderEmail}`);
            } catch (err) {
                console.error(`Failed to send to ${lead.email} using ${senderEmail}:`, err.message);
            }

            // Dynamic Delay Logic: First loop (first 5 emails) = 2s, second loop = 5s, alternating
            const loopNumber = Math.floor(i / transporters.length);
            const waitTime = (loopNumber % 2 === 0) ? 2000 : 5000;
            await new Promise(r => setTimeout(r, waitTime));
        }

        console.log("Sending batch complete.");

    } catch (err) {
        console.error("Error in startSending:", err);
    }
}

async function startFollowUp(targetStatus, testMode = false) {
    // targetStatus is what we are sending TO (e.g. fu1, fu2, fu3)
    // sourceStatus is where they are coming FROM (e.g. sent -> fu1)
    const sourceMap = {
        'fu1': 'sent',
        'fu2': 'fu1',
        'fu3': 'fu2'
    };
    const sourceStatus = sourceMap[targetStatus];
    if (!sourceStatus) return;

    try {
        const snapshot = await get(ref(db, 'leads'));
        if (!snapshot.exists()) return;

        const leadsObj = snapshot.val();
        
        // Find leads in the sourceStatus
        // Limit to 20 emails per mailbox (e.g., 20 * 5 = 100 total for 5 mailboxes)
        const maxLimit = 20 * (transporters.length || 1);
        const sourceLeads = Object.entries(leadsObj)
            .filter(([id, lead]) => {
                const isCorrectMode = testMode ? lead.is_test === true : !lead.is_test;
                return lead.status === sourceStatus && isCorrectMode;
            })
            .slice(0, maxLimit);

        if (sourceLeads.length === 0) {
            console.log(`No leads in ${sourceStatus} to follow up with.`);
            return;
        }

        console.log(`Starting to send ${targetStatus} to ${sourceLeads.length} leads...`);

        for (let i = 0; i < sourceLeads.length; i++) {
            const [id, lead] = sourceLeads[i];
            
            // Re-use the exact same mailbox that originally sent to them!
            // If we don't have it, default to mailbox 1
            const mailboxUsedIndex = (lead.mailbox_used ? lead.mailbox_used - 1 : 0);
            // Ensure index is valid
            const safeIndex = (mailboxUsedIndex >= 0 && mailboxUsedIndex < transporters.length) ? mailboxUsedIndex : 0;
            
            const transporter = transporters[safeIndex];
            const senderEmail = mailboxes[safeIndex];

            const firstName = getFirstName(lead.full_name);
            const brand = lead.company || 'your company';

            let subject = '';
            let text = '';

            if (targetStatus === 'fu1') {
                subject = `One more thing about ${brand}`;
                text = `Hi ${firstName},

One thing I forgot to mention in my last email — most stores like ${brand} lose a chunk of repeat customers simply because reordering means opening a browser again instead of tapping an app icon.

Wanted to flag that separately. Happy to share more if it's useful.

TechniFuse`;
            } else if (targetStatus === 'fu2') {
                subject = `Is this on ${brand}'s radar for this year?`;
                text = `Hi ${firstName},

No worries if now's not the right time — just wanted to check whether an app is even something ${brand} is considering this year, or if I should check back later.

TechniFuse`;
            } else if (targetStatus === 'fu3') {
                subject = `Should I close this out?`;
                text = `Hi ${firstName},

Haven't heard back, so I'll assume the timing's off for now. I'll leave the door open — feel free to reach out whenever it makes sense.

All the best,
TechniFuse`;
            }

            const baseUrl = process.env.APP_URL || 'https://donmy.online';
            const htmlContent = text.replace(/\n/g, '<br>') + `<br><br><img src="${baseUrl}/api/track/open/${id}" width="1" height="1" style="display:none;" alt="" />`;

            try {
                await transporter.sendMail({
                    from: `"TechniFuse" <${senderEmail}>`,
                    to: lead.email,
                    subject: subject,
                    text: text,
                    html: htmlContent
                });

                // Update Firebase
                await update(ref(db, `leads/${id}`), {
                    status: targetStatus, // move them to fu1, fu2, etc.
                    last_contacted_at: new Date().toISOString(),
                    history: [...(lead.history || []), {
                        action: `sent_${targetStatus}`,
                        date: new Date().toISOString(),
                        mailbox: senderEmail
                    }]
                });

                console.log(`Successfully sent ${targetStatus} to ${lead.email} using ${senderEmail}`);
            } catch (err) {
                console.error(`Failed to send ${targetStatus} to ${lead.email} using ${senderEmail}:`, err.message);
            }

            // Dynamic Delay Logic for follow ups
            const loopNumber = Math.floor(i / transporters.length);
            const waitTime = (loopNumber % 2 === 0) ? 2000 : 5000;
            await new Promise(r => setTimeout(r, waitTime));
        }

        console.log(`Follow-up ${targetStatus} batch complete.`);

    } catch (err) {
        console.error("Error in startFollowUp:", err);
    }
}

module.exports = { startSending, startFollowUp };
