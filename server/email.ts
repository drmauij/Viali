// Resend email integration - uses same env vars as server/resend.ts
import { Resend } from 'resend';
import logger from "./logger";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is required');
  }

  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL environment variable is required');
  }

  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function getUncachableResendClient() {
  return getResendClient();
}

function getAppBaseUrl(): string {
  // Use PRODUCTION_URL or APP_URL for production, fall back to Replit domains for development
  if (process.env.PRODUCTION_URL) {
    return process.env.PRODUCTION_URL;
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    if (domains.length > 0) {
      return `https://${domains[0]}`;
    }
  }
  return 'https://use.viali.app';
}

function buildChatDeepLink(conversationId?: string): string {
  const baseUrl = getAppBaseUrl();
  if (conversationId) {
    return `${baseUrl}/?openChat=1&conversationId=${conversationId}`;
  }
  return `${baseUrl}/?openChat=1`;
}

function getEmailButton(link: string, text: string): string {
  return `
    <a href="${link}" 
       style="display: inline-block; background: #2563eb; color: white; 
              padding: 12px 24px; text-decoration: none; border-radius: 6px; 
              font-weight: 500; margin: 16px 0;">
      ${text}
    </a>
  `;
}

export async function sendNewMessageEmail(
  toEmail: string,
  senderName: string,
  messagePreview: string,
  conversationTitle?: string,
  conversationId?: string
): Promise<boolean> {
  try {
    logger.info(`[Email] Attempting to send new message email to: ${toEmail}`);
    const { client, fromEmail } = await getUncachableResendClient();
    logger.info(`[Email] Got Resend client, sending from: ${fromEmail}`);
    
    const subject = conversationTitle 
      ? `New message from ${senderName} in "${conversationTitle}"`
      : `New message from ${senderName}`;
    
    const chatLink = buildChatDeepLink(conversationId);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Message</h2>
          <p style="color: #666;">
            <strong>${senderName}</strong> sent you a message${conversationTitle ? ` in "${conversationTitle}"` : ''}:
          </p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="color: #333; margin: 0;">${messagePreview}</p>
          </div>
          ${getEmailButton(chatLink, 'View Conversation')}
          <p style="color: #999; font-size: 12px;">
            Or copy this link: <a href="${chatLink}" style="color: #2563eb;">${chatLink}</a>
          </p>
        </div>
      `
    });
    
    logger.info(`[Email] Successfully sent email to ${toEmail}:`, result);
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send email notification:', error);
    return false;
  }
}

export async function sendNewConversationEmail(
  toEmail: string,
  senderName: string,
  conversationTitle?: string,
  conversationId?: string
): Promise<boolean> {
  try {
    logger.info(`[Email] Attempting to send new conversation email to: ${toEmail}`);
    const { client, fromEmail } = await getUncachableResendClient();
    logger.info(`[Email] Got Resend client, sending from: ${fromEmail}`);
    
    const subject = `${senderName} started a conversation with you`;
    const chatLink = buildChatDeepLink(conversationId);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Conversation</h2>
          <p style="color: #666;">
            <strong>${senderName}</strong> started a conversation with you${conversationTitle ? ` titled "${conversationTitle}"` : ''}.
          </p>
          ${getEmailButton(chatLink, 'View Conversation')}
          <p style="color: #999; font-size: 12px;">
            Or copy this link: <a href="${chatLink}" style="color: #2563eb;">${chatLink}</a>
          </p>
        </div>
      `
    });
    
    logger.info(`[Email] Successfully sent new conversation email to ${toEmail}:`, result);
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send new conversation email notification:', error);
    return false;
  }
}

export async function sendMentionEmail(
  toEmail: string,
  senderName: string,
  messagePreview: string,
  conversationTitle?: string,
  conversationId?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = `${senderName} mentioned you`;
    const chatLink = buildChatDeepLink(conversationId);
    
    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">You were mentioned</h2>
          <p style="color: #666;">
            <strong>${senderName}</strong> mentioned you${conversationTitle ? ` in "${conversationTitle}"` : ''}:
          </p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="color: #333; margin: 0;">${messagePreview}</p>
          </div>
          ${getEmailButton(chatLink, 'View Conversation')}
          <p style="color: #999; font-size: 12px;">
            Or copy this link: <a href="${chatLink}" style="color: #2563eb;">${chatLink}</a>
          </p>
        </div>
      `
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to send mention email notification:', error);
    return false;
  }
}

export async function sendSurgeryNoteMentionEmail(
  toEmail: string,
  senderName: string,
  noteContent: string,
  patientName: string,
  procedureName: string,
  surgeryId?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = `${senderName} mentioned you in a surgery note`;
    const baseUrl = getAppBaseUrl();
    // Deep link to the surgery in OP calendar (if surgeryId provided)
    const surgeryLink = surgeryId 
      ? `${baseUrl}/?openSurgery=${surgeryId}` 
      : baseUrl;
    
    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">You were mentioned in a surgery note</h2>
          <p style="color: #666;">
            <strong>${senderName}</strong> mentioned you in a note for patient <strong>${patientName}</strong> (${procedureName}):
          </p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="color: #333; margin: 0;">${noteContent.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')}</p>
          </div>
          ${getEmailButton(surgeryLink, 'View Surgery')}
          <p style="color: #999; font-size: 12px;">
            Or copy this link: <a href="${surgeryLink}" style="color: #2563eb;">${surgeryLink}</a>
          </p>
        </div>
      `
    });
    
    logger.info(`[Email] Successfully sent surgery note mention email to ${toEmail}`);
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send surgery note mention email:', error);
    return false;
  }
}

export async function sendWorklogLinkEmail(
  toEmail: string,
  token: string,
  unitName: string,
  hospitalName: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const baseUrl = getAppBaseUrl();
    const worklogLink = `${baseUrl}/worklog/${token}`;
    
    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `Your personal time tracking link for ${unitName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Time Tracking Portal</h2>
          <p style="color: #666;">
            You have been set up with a personal time tracking link for <strong>${unitName}</strong> at <strong>${hospitalName}</strong>.
          </p>
          <p style="color: #666;">
            Use this link to submit your work hours. Each entry will need to be signed by you and countersigned by a manager.
          </p>
          ${getEmailButton(worklogLink, 'Open Time Tracking')}
          <p style="color: #999; font-size: 12px;">
            Or copy this link: <a href="${worklogLink}" style="color: #2563eb;">${worklogLink}</a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            This is your personal link - please do not share it with others.
          </p>
        </div>
      `
    });
    
    logger.info(`[Email] Successfully sent worklog link email to ${toEmail}`);
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send worklog link email:', error);
    return false;
  }
}

// Send custom message to patient
export async function sendCustomPatientEmail(toEmail: string, messageText: string, patientFirstName: string): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();
    
    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Nachricht von Ihrer Praxis',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Guten Tag${patientFirstName ? ` ${patientFirstName}` : ''},</h2>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${messageText}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Bei Fragen können Sie uns jederzeit kontaktieren.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">
            Diese Nachricht wurde automatisch versendet. Bitte antworten Sie nicht direkt auf diese E-Mail.
          </p>
        </div>
      `
    });
    
    logger.info(`[Email] Successfully sent custom message to ${toEmail}`);
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send custom patient email:', error);
    throw error;
  }
}
