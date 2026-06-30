import 'server-only';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';

function getClient() {
  const mg = new Mailgun(FormData);
  return mg.client({ username: 'api', key: process.env.MAILGUN_API_KEY || '' });
}

export async function sendMail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const domain = process.env.MAILGUN_DOMAIN;
  if (!domain || !process.env.MAILGUN_API_KEY) {
    throw new Error('MAILGUN_API_KEY/MAILGUN_DOMAIN not configured');
  }

  const client = getClient();
  await client.messages.create(domain, {
    from: process.env.MAILGUN_FROM || `Comprobify <no-reply@${domain}>`,
    to,
    subject,
    text,
    html,
  });
}
