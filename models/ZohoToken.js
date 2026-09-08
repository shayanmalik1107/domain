const mongoose = require('mongoose');

const zohoTokenSchema = new mongoose.Schema({
    emailAddress: {
        type: String,
        required: true,
        unique: true
    },
    accountId: {
        type: String,
        required: true
    },
    accessToken: {
        type: String,
        required: true
    },
    refreshToken: {
        type: String,
        required: true
    },
    apiDomain: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('ZohoToken', zohoTokenSchema);
