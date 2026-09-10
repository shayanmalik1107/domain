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

let sendingState = {
    isSending: false,
    status: 'idle',
    actionType: '',
    targetStatus: '',
    testMode: false,
    total: 0,
    current: 0,
    currentLeadEmail: '',
    currentMailbox: '',
    message: ''
};

function getSendingStatus() {
    return sendingState;
}

function getFirstName(fullName) {
    if (!fullName) return 'there';
    return fullName.split(' ')[0];
}

async function startSending(testMode = false) {
    try {
        if (!transporters || transporters.length === 0) {
            const msg = 'No mailboxes configured on environment. Please check MAILBOX_1..5 and MAILBOX_PASS.';
            console.error(msg);
            sendingState = { isSending: false, status: 'error', message: msg };
            throw new Error(msg);
        }

        const snapshot = await get(ref(db, 'leads'));
        if (!snapshot.exists()) {
            sendingState = { isSending: false, status: 'idle', message: 'No leads in database.' };
            return;
        }

        const leadsObj = snapshot.val();
        
        // Find leads that are not_sent
        const maxLimit = 20 * (transporters.length || 1);
        const notSentLeads = Object.entries(leadsObj)
            .filter(([id, lead]) => {
                const isCorrectMode = testMode ? lead.is_test === true : !lead.is_test;
                return lead.status === 'not_sent' && isCorrectMode;
            })
            .slice(0, maxLimit);

        if (notSentLeads.length === 0) {
            console.log("No leads to send to.");
            sendingState = { isSending: false, status: 'idle', message: 'No leads to send to.' };
            return;
        }

        console.log(`Starting to send emails to ${notSentLeads.length} leads...`);
        sendingState = {
            isSending: true,
            status: 'sending',
            actionType: 'initial',
            targetStatus: 'sent',
            testMode,
            total: notSentLeads.length,
            current: 0,
            currentLeadEmail: '',
            currentMailbox: '',
            message: `Starting to send emails to ${notSentLeads.length} leads...`
        };

        for (let i = 0; i < notSentLeads.length; i++) {
            const [id, lead] = notSentLeads[i];
            const mailboxIndex = i % transporters.length;
            const transporter = transporters[mailboxIndex];
            const senderEmail = mailboxes[mailboxIndex];

            const brand = lead.company || 'your company';
            const firstName = getFirstName(lead.full_name);

            sendingState.current = i + 1;
            sendingState.currentLeadEmail = lead.email;
            sendingState.currentMailbox = senderEmail;
            sendingState.message = `Sending email (${i + 1}/${notSentLeads.length}) to ${lead.email}...`;

            const subject = `Quick question about ${brand}'s app`;
            const text = `Hi ${firstName},

Noticed ${brand} doesn't have its own mobile app yet, even with a strong store already in place.

Most repeat customers now shop from their phones, and without an app, you're paying to win them back each time through ads and discount emails instead of them just tapping straight back in.

We turn your Shopify store into a native iOS and Android app, live in weeks, on a simple monthly subscription — so repeat orders happen with one tap, not a search or an ad click.

Worth a quick reply if you'd like to see what that could look like for ${brand}?

Best,
TechniFuse`;

            const baseUrl = process.env.APP_URL || 'https://www.domny.online';
            const trackingPixelUrl = `${baseUrl}/api/track/open/${id}?v=${Date.now()}`;
            const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #222222; line-height: 1.6;">
${text.replace(/\n/g, '<br>')}
<br><br>
<img src="cid:technifuse-logo" alt="TechniFuse" style="max-width: 160px; height: auto; border: 0; display: block;" />
<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none; width:1px; height:1px;" />
</body>
</html>`;

            const logoFilePath = require('fs').existsSync(require('path').join(__dirname, '../public/techni.png')) 
                ? require('path').join(__dirname, '../public/techni.png') 
                : require('path').join(__dirname, '../techni.png');

            try {
                await transporter.sendMail({
                    from: `"TechniFuse" <${senderEmail}>`,
                    to: lead.email,
                    subject: subject,
                    text: text,
                    html: htmlContent,
                    attachments: [
                        {
                            filename: 'techni.png',
                            path: logoFilePath,
                            cid: 'technifuse-logo'
                        }
                    ]
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

            // Dynamic Delay Logic
            const loopNumber = Math.floor(i / transporters.length);
            const waitTime = (loopNumber % 2 === 0) ? 2000 : 5000;
            await new Promise(r => setTimeout(r, waitTime));
        }

        console.log("Sending batch complete.");
        sendingState = {
            isSending: false,
            status: 'completed',
            actionType: 'initial',
            targetStatus: 'sent',
            testMode,
            total: notSentLeads.length,
            current: notSentLeads.length,
            message: `Batch complete. Successfully sent ${notSentLeads.length} emails.`
        };

    } catch (err) {
        console.error("Error in startSending:", err);
        sendingState = { isSending: false, status: 'error', message: err.message };
    }
}

async function startFollowUp(targetStatus, testMode = false) {
    const sourceMap = {
        'fu1': 'sent',
        'fu2': 'fu1',
        'fu3': 'fu2'
    };
    const sourceStatus = sourceMap[targetStatus];
    if (!sourceStatus) return;

    try {
        if (!transporters || transporters.length === 0) {
            const msg = 'No mailboxes configured on environment. Please check MAILBOX_1..5 and MAILBOX_PASS.';
            console.error(msg);
            sendingState = { isSending: false, status: 'error', message: msg };
            throw new Error(msg);
        }

        const snapshot = await get(ref(db, 'leads'));
        if (!snapshot.exists()) {
            sendingState = { isSending: false, status: 'idle', message: 'No leads in database.' };
            return;
        }

        const leadsObj = snapshot.val();
        
        // Find leads in the sourceStatus
        const maxLimit = 20 * (transporters.length || 1);
        const sourceLeads = Object.entries(leadsObj)
            .filter(([id, lead]) => {
                const isCorrectMode = testMode ? lead.is_test === true : !lead.is_test;
                return lead.status === sourceStatus && isCorrectMode;
            })
            .slice(0, maxLimit);

        if (sourceLeads.length === 0) {
            console.log(`No leads in ${sourceStatus} to follow up with.`);
            sendingState = { isSending: false, status: 'idle', message: `No leads in ${sourceStatus} to follow up with.` };
            return;
        }

        console.log(`Starting to send ${targetStatus} to ${sourceLeads.length} leads...`);
        sendingState = {
            isSending: true,
            status: 'sending',
            actionType: targetStatus,
            targetStatus: targetStatus,
            testMode,
            total: sourceLeads.length,
            current: 0,
            currentLeadEmail: '',
            currentMailbox: '',
            message: `Starting to send ${targetStatus} to ${sourceLeads.length} leads...`
        };

        for (let i = 0; i < sourceLeads.length; i++) {
            const [id, lead] = sourceLeads[i];
            
            const mailboxUsedIndex = (lead.mailbox_used ? lead.mailbox_used - 1 : 0);
            const safeIndex = (mailboxUsedIndex >= 0 && mailboxUsedIndex < transporters.length) ? mailboxUsedIndex : 0;
            
            const transporter = transporters[safeIndex];
            const senderEmail = mailboxes[safeIndex];

            const firstName = getFirstName(lead.full_name);
            const brand = lead.company || 'your company';

            sendingState.current = i + 1;
            sendingState.currentLeadEmail = lead.email;
            sendingState.currentMailbox = senderEmail;
            sendingState.message = `Sending ${targetStatus} (${i + 1}/${sourceLeads.length}) to ${lead.email}...`;

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

            const baseUrl = process.env.APP_URL || 'https://www.domny.online';
            const trackingPixelUrl = `${baseUrl}/api/track/open/${id}?v=${Date.now()}`;
            const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #222222; line-height: 1.6;">
${text.replace(/\n/g, '<br>')}
<br><br>
<img src="cid:technifuse-logo" alt="TechniFuse" style="max-width: 160px; height: auto; border: 0; display: block;" />
<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none; width:1px; height:1px;" />
</body>
</html>`;

            const logoFilePath = require('fs').existsSync(require('path').join(__dirname, '../public/techni.png')) 
                ? require('path').join(__dirname, '../public/techni.png') 
                : require('path').join(__dirname, '../techni.png');

            try {
                await transporter.sendMail({
                    from: `"TechniFuse" <${senderEmail}>`,
                    to: lead.email,
                    subject: subject,
                    text: text,
                    html: htmlContent,
                    attachments: [
                        {
                            filename: 'techni.png',
                            path: logoFilePath,
                            cid: 'technifuse-logo'
                        }
                    ]
                });

                // Update Firebase
                await update(ref(db, `leads/${id}`), {
                    status: targetStatus,
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
        sendingState = {
            isSending: false,
            status: 'completed',
            actionType: targetStatus,
            targetStatus: targetStatus,
            testMode,
            total: sourceLeads.length,
            current: sourceLeads.length,
            message: `Follow-up ${targetStatus} batch complete. Processed ${sourceLeads.length} emails.`
        };

    } catch (err) {
        console.error("Error in startFollowUp:", err);
        sendingState = { isSending: false, status: 'error', message: err.message };
    }
}

module.exports = { startSending, startFollowUp, getSendingStatus };
