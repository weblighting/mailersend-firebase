/*
 * This template contains a HTTP function that
 * responds with a greeting when called
 *
 * Reference PARAMETERS in your functions code with:
 * `process.env.<parameter-name>`
 * Learn more about building extensions in the docs:
 * https://firebase.google.com/docs/extensions/alpha/overview
 */

const functions = require('firebase-functions');
const v1Functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const Recipient = require("mailersend").Recipient;
const EmailParams = require("mailersend").EmailParams;
const Sender = require("mailersend").Sender;
const MailerSend = require("mailersend").MailerSend;
const crypto = require('crypto');

let config = require('./config');
const logs = require('./logs');

let initialized = false;
let mailersend = null;

const initialize = () => {
  if (initialized === true) return;
  initialized = true;
  admin.initializeApp();
  admin.firestore().settings({ignoreUndefinedProperties:true});
  mailersend = new MailerSend({
    apiKey: config.mailersendApiToken,
  })
}

const send = async (data) => {

  let toRecipients = [];
  if (Array.isArray(data.to)) {
    data.to.forEach((recipient) => {
      toRecipients.push(new Recipient(recipient.email, recipient.name))
    })
  }

  let ccRecipients = [];
  if (Array.isArray(data.cc)) {
    data.cc.forEach((recipient) => {
      ccRecipients.push(new Recipient(recipient.email, recipient.name))
    })
  }

  let bccRecipients = [];
  if (Array.isArray(data.bcc)) {
    data.bcc.forEach((recipient) => {
      bccRecipients.push(new Recipient(recipient.email, recipient.name))
    })
  }

  const sentFrom = new Sender(data.from.email, data.from.name);

  let emailParams = new EmailParams()

  emailParams.setFrom(sentFrom)
  emailParams.setTo(toRecipients)

  if (ccRecipients.length) {
    emailParams.setCc(ccRecipients)
  }

  if (bccRecipients.length) {
    emailParams.setBcc(bccRecipients)
  }

  if (data.subject) {
    emailParams.setSubject(data.subject)
  }

  if (data.html) {
    emailParams.setHtml(data.html)
  }

  if (data.text) {
    emailParams.setText(data.text)
  }

  if (data.template_id) {
    emailParams.setTemplateId(data.template_id)
  }

  if (data.variables) {
    emailParams.setVariables(data.variables);
  }

  if (data.personalization) {
    emailParams.setPersonalization(data.personalization);
  }

  if (data.tags && data.tags.length) {
    emailParams.setTags(data.tags)
  }

  if (data.reply_to && data.reply_to.email) {
    const replyTo = new Sender(data.reply_to.email, data.reply_to.name);
    emailParams.setReplyTo(replyTo)
  }

  if (data.send_at) {
    emailParams.setSendAt(data.send_at)
  }

  return await mailersend.email.send(emailParams)
      .then(async (response) => {
        if (response.statusCode === 202) {
          return {
            status: 202,
            messageId: response.headers && response.headers['x-message-id'] || ''
          };
        }

        if (response.statusCode === 422) {
          return {
            status: 422,
            message: response.data && response.data.message || ''
          };
        }

        if (response.statusCode === 429) {
          return {
            status: 429,
            message: response.data && response.data.message || ''
          };
        }

        throw new Error('Something went wrong.');
      }).catch((error) => {
        const errorBody = error.body

        return {
          status: error.status,
          message: errorBody || ''
        };
      })
}

const prepareData = (data) => {
  data.from = data.from || {}
  data.reply_to = data.reply_to || {}

  data.from.email = data.from.email || config.defaultFromEmail
  data.from.name = data.from.name || config.defaultFromName
  data.reply_to.email = data.reply_to.email || config.defaultReplyToEmail
  data.reply_to.name = data.reply_to.name || config.defaultReplyToName

  if (!data.html && !data.text) {
    data.template_id = data.template_id || config.defaultTemplateId
  }

  if (!data.html && !data.text && !data.template_id) {
    throw new Error(
        "Failed to send email. At least one of html, text and template_id should be set."
    );
  }

  if (!Array.isArray(data.to) || !data.to.length) {
    throw new Error(
        "Failed to deliver email. Expected at least 1 recipient."
    );
  }

  return data
}

exports.processDocumentCreated = functions.firestore.document(config.emailCollection).onCreate(async (snapshot) => {
  logs.start()
  initialize()

  let data = snapshot.data()
  const update = {
    "sent.error": null,
    "sent.message_id": null,
    "sent.state": "PENDING",
    "delivery.state": "PENDING",
    "delivery.error": null,
    "delivery.message_id": '',
  };

  try {
    data = prepareData(data)

    const result = await send(data);
    if (result.status === 202) {
      update["sent.state"] = "SUCCESS";
      update["sent.message_id"] = result.messageId || '';
      update["delivery.message_id"] = result.messageId || '';
    } else {
      update["sent.state"] = "ERROR";
      update["sent.error"] = result.message;
    }
  } catch (e) {
    update["sent.state"] = "ERROR";
    update["sent.error"] = e.toString();
    logs.error(e);
  }

  await snapshot.ref.update(update)

  logs.end(update)
})


// Subscribe to following events: activity.delivered activity.soft_bounced, activity.hard_bounced
exports.webhook = v1Functions.https.onRequest(async (req, res) => {
  if(!req.rawBody || !config.mailersendWebhookSigningSecret|| !req.headers['mailersend-signature']){
    return res.status(500).send("Something is missing")
  }
  if(!verifySignature(req.rawBody, config.mailersendWebhookSigningSecret, req.headers['mailersend-signature'])){
    return res.status(403).send("Invalid signature")
  }

  const body = req.body;
  initialize()
  if(!body) throw new Error("Webhook data not found")
  if(!body.type) throw new Error("Webhook type not found")
  logs.log("Webhook received", true)
  logs.startWebHook(body.type)
  logs.log(JSON.stringify(body,null,2), true)
  const emailId = body.data.email.message.id
  if(!emailId) throw new Error("Email id not found in the webhook data")
  const status = body.data.email.status || 'ERROR'

  const snapshot = await admin.firestore().collection(config.emailCollection).where("sent.message_id", "==", emailId).limit(1).get()
  if(snapshot.empty) throw new Error("Email not found in the database")
    
  const doc = snapshot.docs[0]

  if(doc.data().delivery?.state == doc.data().delivery?.state) {
    logs.log("Email already processed")
    return res.send("OK")
  }

  const update = {
    "delivery.state": "PENDING",
    "delivery.error": null,
    "message_id": emailId
  };

  if(status === "sent") {
    update["delivery.state"] = "SUCCESS";
  } else {
    update["delivery.state"] = "ERROR";
    update["delivery.error"] = `[${body.data.type}] ${body.data.morph?.reason}` || "Unknown error";
  }

  await doc.ref.update(update)
  logs.end("Webhook processed")
  res.send("OK")
})

function verifySignature(requestContent, signingSecret, signature) {
  const computedSignature = crypto
    .createHmac('sha256', signingSecret)
    .update(requestContent)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(computedSignature, 'utf8')
  );
}
