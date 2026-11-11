import { createEmailService, parseEmailFrom } from '../src/features/varchas/authentication/email.service.js';

let sender;
try {
  sender = parseEmailFrom(process.env.EMAIL_FROM);
} catch (error) {
  console.error(`Email configuration invalid: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

if (!process.env.GMAIL_USER?.trim() || !process.env.GMAIL_APP_PASSWORD?.trim()) {
  console.error('Email configuration incomplete: set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env.');
  process.exitCode = 1;
  process.exit();
}

const emailService = createEmailService(process.env);
console.log(`Checking Gmail SMTP connectivity for sender "${sender.name}" <${sender.address}> (no test email will be sent).`);
try {
  await emailService.verify();
  console.log('Gmail SMTP verification succeeded.');
} catch (error) {
  const response = typeof error.response === 'string'
    ? error.response.replace(/[\r\n\t]+/g, ' ').replace(/(pass(?:word)?|auth(?:entication)?|otp|token)\s*[:=]\s*\S+/ig, '$1=[redacted]').slice(0, 240)
    : undefined;
  console.error('Gmail SMTP verification failed.', JSON.stringify({
    category: 'SMTP_VERIFY_FAILED',
    code: typeof error.code === 'string' ? error.code : undefined,
    command: typeof error.command === 'string' ? error.command : undefined,
    responseCode: Number.isInteger(error.responseCode) ? error.responseCode : undefined,
    response,
  }));
  process.exitCode = 1;
}
