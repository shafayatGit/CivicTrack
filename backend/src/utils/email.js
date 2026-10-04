import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_DIR = path.join(__dirname, 'emailTemplates');

// The SMTP_* names are the ones already in backend/.env, prefixed so they cannot be
// confused with an application's own SMTP_* settings if this ever gets reused.
const REQUIRED = [
  'EMAIL_SENDER_SMTP_HOST',
  'EMAIL_SENDER_SMTP_USER',
  'EMAIL_SENDER_SMTP_PASS',
];

// Built on first use, then reused. nodemailer pools sockets internally, so a transport
// per send would open a fresh TLS handshake to the mail host for every message.
let transporter = null;

// nodemailer throws a stack that is several frames deep and says nothing the operator can
// act on ("Missing credentials for PLAIN"). This names the variables that are actually
// missing, because the failure mode here is always an unconfigured deployment rather
// than a bad recipient address.
const assertConfigured = () => {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Email is not configured: set ${missing.join(', ')} in backend/.env to send mail.`,
    );
  }
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  assertConfigured();

  const port = Number(process.env.EMAIL_SENDER_SMTP_PORT) || 587;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SENDER_SMTP_HOST,
    port,
    // 465 is implicit TLS (SMTPS); every other common port is STARTTLS on an open
    // connection. Gmail is configured above on 465, and the port is the only signal
    // available for guessing which of the two a given host wants.
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_SENDER_SMTP_USER,
      pass: process.env.EMAIL_SENDER_SMTP_PASS,
    },
  });

  return transporter;
};

// Renders `emailTemplates/<template>.ejs` with `context` and sends it. One function for
// every template rather than a per-message helper, so a second email is a new .ejs file
// and a call here — not another transporter.
//
// There is deliberately no "send if configured, skip if not" mode: the caller decides
// whether a missing SMTP config is fatal (see staff.createStaff, which catches and
// reports it), and swallowing it here would make that decision invisible.
export const sendEmail = async ({ to, subject, template, context = {} }) => {
  const html = await ejs.renderFile(path.join(TEMPLATE_DIR, `${template}.ejs`), context);

  return getTransporter().sendMail({
    from: process.env.EMAIL_SENDER_SMTP_FROM || process.env.EMAIL_SENDER_SMTP_USER,
    to,
    subject,
    html,
  });
};

// The onboarding mail. It is the only place in the app that transmits a plaintext
// password, so the template is deliberately blunt about it: the account cannot be used
// without this message, and the first thing the reader is told to do is replace it.
export const sendWelcomeEmail = ({ to, name, password, departmentName, loginUrl }) =>
  sendEmail({
    to,
    subject: 'Your CivicTrack staff account',
    template: 'staffWelcome',
    context: {
      name,
      // `to` is passed through as `email` because the template has to print the address
      // back to the reader — they are about to type it into a login form, and getting it
      // subtly wrong is the kind of thing that locks someone out of an account they were
      // just created.
      email: to,
      password,
      departmentName,
      loginUrl: loginUrl || '',
      appName: process.env.APP_NAME || 'CivicTrack',
    },
  });