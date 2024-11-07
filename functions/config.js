module.exports = {
    emailCollection: process.env.EMAIL_COLLECTION,
    mailersendApiToken: process.env.MAILERSEND_API_KEY,
    defaultFromEmail: process.env.DEFAULT_FROM_EMAIL,
    defaultFromName: process.env.DEFAULT_FROM_NAME,
    defaultReplyToEmail: process.env.DEFAULT_REPLY_TO_EMAIL,
    defaultReplyToName: process.env.DEFAULT_REPLY_TO_NAME,
    defaultTemplateId: process.env.DEFAULT_TEMPLATE_ID,
    mailersendWebhookSigningSecret: process.env.MAILERSEND_WEBHOOK_SIGNING_SECRET,
    webhookEndpoint: "QhCvGguAbcmu0miL9uk1xUrgZKXxRFAH" || process.env.WEBHOOK_ENDPOINT,
};