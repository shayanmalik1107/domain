require('dotenv').config();
const { db } = require('../firebase');
const { ref, set, get } = require('firebase/database');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function migrate() {
    console.log('Starting migration...');
    try {
        const filePath = path.join(__dirname, '../Drexil LinkedIn Leads - Europe.xlsx');
        if (!fs.existsSync(filePath)) {
            console.error('Leads file not found.');
            return;
        }

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Extract exact headers directly from sheet
        const headers = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0] || [];
        
        // Parse leads
        const leads = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

        console.log(`Parsed ${leads.length} leads. Extracted ${headers.length} headers. Pushing to Firebase...`);

        const formattedLeads = {};
        leads.forEach((lead, index) => {
            const rowKey = `lead_${index}`;
            formattedLeads[rowKey] = {
                ...lead,
                id: rowKey,
                status: 'not_sent',
                mailbox_used: null,
                last_contacted_at: null,
                history: []
            };
        });

        // Save headers so frontend knows the exact column order
        await set(ref(db, 'metadata/headers'), headers);
        
        // Save leads
        await set(ref(db, 'leads'), formattedLeads);
        
        console.log(`Migration complete! Successfully migrated all ${leads.length} leads.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
