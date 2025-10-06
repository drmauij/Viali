import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
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
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
async function getUncachableResendClient() {
  const {apiKey, fromEmail} = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

export async function sendWelcomeEmail(
  toEmail: string,
  firstName: string,
  hospitalName: string,
  temporaryPassword: string,
  loginUrl: string
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Viali - ${hospitalName}</h2>
        <p>Hello ${firstName},</p>
        <p>Your account has been created for the ${hospitalName} inventory management system.</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Your Login Credentials</h3>
          <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
          <p><strong>Email:</strong> ${toEmail}</p>
          <p><strong>Temporary Password:</strong> <code style="background: #e0e0e0; padding: 4px 8px; border-radius: 4px;">${temporaryPassword}</code></p>
        </div>
        
        <p style="color: #d32f2f;"><strong>Important:</strong> You will be required to change your password on first login.</p>
        
        <p>If you have any questions, please contact your hospital administrator.</p>
        
        <p>Best regards,<br/>Viali Team</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `Welcome to Viali - ${hospitalName}`,
      html,
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error };
  }
}

export async function sendPasswordResetEmail(
  toEmail: string, 
  resetUrl: string, 
  userName?: string
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Viali - Password Reset</h1>
            </div>
            <div class="content">
              <p>Hello${userName ? ' ' + userName : ''},</p>
              <p>You requested to reset your password for your Viali account. Click the button below to create a new password:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request this password reset, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>Viali Hospital Inventory Management System</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Reset Your Password - Viali',
      html,
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error };
  }
}
