// Resend email integration (connection:conn_resend_01K6T8E4MQA4ZPJYJPCF95WNEJ)
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || 'noreply@example.com'
  };
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
