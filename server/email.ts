// Resend email integration - uses same env vars as server/resend.ts
import { Resend } from 'resend';

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

export async function sendNewMessageEmail(
  toEmail: string,
  senderName: string,
  messagePreview: string,
  conversationTitle?: string
): Promise<boolean> {
  try {
    console.log(`[Email] Attempting to send new message email to: ${toEmail}`);
    const { client, fromEmail } = await getUncachableResendClient();
    console.log(`[Email] Got Resend client, sending from: ${fromEmail}`);
    
    const subject = conversationTitle 
      ? `New message from ${senderName} in "${conversationTitle}"`
      : `New message from ${senderName}`;
    
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
          <p style="color: #999; font-size: 12px;">
            Log in to view and reply to this message.
          </p>
        </div>
      `
    });
    
    console.log(`[Email] Successfully sent email to ${toEmail}:`, result);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send email notification:', error);
    return false;
  }
}

export async function sendNewConversationEmail(
  toEmail: string,
  senderName: string,
  conversationTitle?: string
): Promise<boolean> {
  try {
    console.log(`[Email] Attempting to send new conversation email to: ${toEmail}`);
    const { client, fromEmail } = await getUncachableResendClient();
    console.log(`[Email] Got Resend client, sending from: ${fromEmail}`);
    
    const subject = `${senderName} started a conversation with you`;
    
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
          <p style="color: #999; font-size: 12px;">
            Log in to view and reply to this message.
          </p>
        </div>
      `
    });
    
    console.log(`[Email] Successfully sent new conversation email to ${toEmail}:`, result);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send new conversation email notification:', error);
    return false;
  }
}

export async function sendMentionEmail(
  toEmail: string,
  senderName: string,
  messagePreview: string,
  conversationTitle?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = `${senderName} mentioned you`;
    
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
          <p style="color: #999; font-size: 12px;">
            Log in to view and reply to this message.
          </p>
        </div>
      `
    });
    
    return true;
  } catch (error) {
    console.error('Failed to send mention email notification:', error);
    return false;
  }
}
