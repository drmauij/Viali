import { Resend } from 'resend';
import logger from "./logger";

// Get Resend client - reads from environment variables
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

export async function sendWelcomeEmail(
  toEmail: string,
  firstName: string,
  hospitalName: string,
  temporaryPassword: string,
  loginUrl: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${isGerman ? 'Willkommen bei Viali' : 'Welcome to Viali'} - ${hospitalName}</h2>
        <p>${isGerman ? 'Guten Tag' : 'Hello'} ${firstName},</p>
        <p>${isGerman ? `Ihr Konto wurde für das Spitalverwaltungssystem ${hospitalName} erstellt.` : `Your account has been created for the ${hospitalName} inventory management system.`}</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${isGerman ? 'Ihre Anmeldedaten' : 'Your Login Credentials'}</h3>
          <p><strong>${isGerman ? 'Anmelde-URL' : 'Login URL'}:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
          <p><strong>${isGerman ? 'E-Mail' : 'Email'}:</strong> ${toEmail}</p>
          <p><strong>${isGerman ? 'Temporäres Passwort' : 'Temporary Password'}:</strong> <code style="background: #e0e0e0; padding: 4px 8px; border-radius: 4px;">${temporaryPassword}</code></p>
        </div>

        <p style="color: #d32f2f;"><strong>${isGerman ? 'Wichtig' : 'Important'}:</strong> ${isGerman ? 'Sie müssen Ihr Passwort beim ersten Login ändern.' : 'You will be required to change your password on first login.'}</p>

        <p>${isGerman ? 'Bei Fragen wenden Sie sich bitte an Ihren Spitaladministrator.' : 'If you have any questions, please contact your hospital administrator.'}</p>

        <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br/>Viali Team</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: isGerman ? `Willkommen bei Viali - ${hospitalName}` : `Welcome to Viali - ${hospitalName}`,
      html,
    });

    if (error) {
      logger.error('Failed to send welcome email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Error sending welcome email:', error);
    return { success: false, error };
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
  userName?: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();

    const isGerman = language === 'de';

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
              <h1>${isGerman ? 'Viali - Passwort zurücksetzen' : 'Viali - Password Reset'}</h1>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Hello'}${userName ? ' ' + userName : ''},</p>
              <p>${isGerman ? 'Sie haben eine Passwortzurücksetzung für Ihr Viali-Konto angefordert. Klicken Sie auf die Schaltfläche unten, um ein neues Passwort zu erstellen:' : 'You requested to reset your password for your Viali account. Click the button below to create a new password:'}</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">${isGerman ? 'Passwort zurücksetzen' : 'Reset Password'}</a>
              </p>
              <p>${isGerman ? 'Oder kopieren Sie diesen Link in Ihren Browser:' : 'Or copy and paste this link into your browser:'}</p>
              <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
              <p><strong>${isGerman ? 'Dieser Link läuft in 1 Stunde ab.' : 'This link will expire in 1 hour.'}</strong></p>
              <p>${isGerman ? 'Falls Sie diese Zurücksetzung nicht angefordert haben, können Sie diese E-Mail ignorieren.' : 'If you didn\'t request this password reset, you can safely ignore this email.'}</p>
            </div>
            <div class="footer">
              <p>${isGerman ? 'Viali Spitalverwaltungssystem' : 'Viali Hospital Inventory Management System'}</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail, bitte antworten Sie nicht.' : 'This is an automated email, please do not reply.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: isGerman ? 'Passwort zurücksetzen - Viali' : 'Reset Your Password - Viali',
      html,
    });

    if (error) {
      logger.error('Failed to send password reset email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Error sending password reset email:', error);
    return { success: false, error };
  }
}

export async function sendHospitalAddedNotification(
  toEmail: string,
  firstName: string,
  hospitalName: string,
  addedByName: string,
  loginUrl: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending hospital added notification from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .highlight { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'Zugang zu neuem Spital' : 'You\'ve Been Added to a New Hospital'}</h1>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Hello'} ${firstName},</p>
              <p>${isGerman ? 'Sie wurden einem neuen Spital im Viali-System hinzugefügt.' : 'You have been added to a new hospital in the Viali inventory management system.'}</p>

              <div class="highlight">
                <p><strong>${isGerman ? 'Spital' : 'Hospital'}:</strong> ${hospitalName}</p>
                <p><strong>${isGerman ? 'Hinzugefügt von' : 'Added by'}:</strong> ${addedByName}</p>
              </div>

              <p>${isGerman ? 'Sie können jetzt mit Ihren bestehenden Zugangsdaten auf dieses Spital zugreifen. Melden Sie sich einfach an und wechseln Sie zum neuen Spital über die Spitalauswahl.' : 'You can now access this hospital using your existing credentials. Simply log in and switch to the new hospital from your hospital selector.'}</p>

              <p style="text-align: center;">
                <a href="${loginUrl}" class="button">${isGerman ? 'Zu Viali' : 'Go to Viali'}</a>
              </p>

              <p>${isGerman ? 'Bei Fragen wenden Sie sich bitte an Ihren Spitaladministrator.' : 'If you have any questions, please contact your hospital administrator.'}</p>
            </div>
            <div class="footer">
              <p>${isGerman ? 'Viali Spitalverwaltungssystem' : 'Viali Hospital Inventory Management System'}</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail, bitte antworten Sie nicht.' : 'This is an automated email, please do not reply.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: isGerman ? `Zugang zu ${hospitalName} erhalten - Viali` : `You've been added to ${hospitalName} - Viali`,
      html,
    });

    if (error) {
      logger.error('Failed to send hospital added notification:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Error sending hospital added notification:', error);
    return { success: false, error };
  }
}

export async function sendBulkImportCompleteEmail(
  toEmail: string,
  userName: string,
  itemsExtracted: number,
  previewUrl: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();

    const isGerman = language === 'de';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .stats { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'Massenimport abgeschlossen!' : 'Bulk Import Complete!'}</h1>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Hello'} ${userName},</p>
              <p>${isGerman ? 'Ihr Massenimport wurde erfolgreich verarbeitet.' : 'Your bulk import has finished processing.'}</p>

              <div class="stats">
                <p><strong>${isGerman ? 'Extrahierte Artikel' : 'Items Extracted'}:</strong> ${itemsExtracted}</p>
              </div>

              <p>${isGerman ? 'Klicken Sie auf die Schaltfläche unten, um die Artikel zu überprüfen:' : 'Click the button below to review and import the items:'}</p>
              <p style="text-align: center;">
                <a href="${previewUrl}" class="button">${isGerman ? 'Import überprüfen' : 'Review Import'}</a>
              </p>
              <p>${isGerman ? 'Oder kopieren Sie diesen Link in Ihren Browser:' : 'Or copy and paste this link into your browser:'}</p>
              <p style="word-break: break-all; color: #10b981;">${previewUrl}</p>

              <p>${isGerman ? 'Sie können die extrahierten Artikel überprüfen, Anpassungen vornehmen und den Import bestätigen.' : 'You can review the extracted items, make adjustments, and confirm the import.'}</p>
            </div>
            <div class="footer">
              <p>${isGerman ? 'Viali Spitalverwaltungssystem' : 'Viali Hospital Inventory Management System'}</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail, bitte antworten Sie nicht.' : 'This is an automated email, please do not reply.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: isGerman ? `Massenimport abgeschlossen - ${itemsExtracted} Artikel bereit` : `Bulk Import Complete - ${itemsExtracted} Items Ready`,
      html,
    });

    if (error) {
      logger.error('Failed to send bulk import email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Error sending bulk import email:', error);
    return { success: false, error };
  }
}

export async function sendExternalSurgeryRequestNotification(
  toEmail: string,
  userName: string,
  hospitalName: string,
  patientName: string,
  surgeryName: string,
  surgeonName: string,
  wishedDate: string,
  deepLinkUrl: string,
  language: 'de' | 'en' = 'en',
  wishedTimeFrom?: number | null,
  wishedTimeTo?: number | null,
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending external surgery request notification from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

    const formatMinutes = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    let wishedDateDisplay = wishedDate;
    if (wishedTimeFrom != null && wishedTimeTo != null) {
      wishedDateDisplay = `${wishedDate}, ${formatMinutes(wishedTimeFrom)} – ${formatMinutes(wishedTimeTo)}`;
    } else if (wishedTimeFrom != null) {
      wishedDateDisplay = `${wishedDate}, ${isGerman ? 'ab' : 'from'} ${formatMinutes(wishedTimeFrom)}`;
    } else if (wishedTimeTo != null) {
      wishedDateDisplay = `${wishedDate}, ${isGerman ? 'bis' : 'until'} ${formatMinutes(wishedTimeTo)}`;
    }

    const subject = isGerman
      ? `Neue externe OP-Anfrage: ${patientName} – ${surgeryName}`
      : `New External Surgery Request: ${patientName} – ${surgeryName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'Neue externe OP-Anfrage' : 'New External Surgery Request'}</h1>
              <p style="margin: 0;">${hospitalName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Hello'} ${userName},</p>
              <p>${isGerman
                ? 'Eine neue externe OP-Anfrage wurde für Ihr Spital eingereicht:'
                : 'A new external surgery request has been submitted for your hospital:'}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${patientName}</p>
                <p><strong>${isGerman ? 'Eingriff' : 'Surgery'}:</strong> ${surgeryName}</p>
                <p><strong>${isGerman ? 'Chirurg' : 'Surgeon'}:</strong> ${surgeonName}</p>
                <p><strong>${isGerman ? 'Gewünschtes Datum' : 'Requested Date'}:</strong> ${wishedDateDisplay}</p>
              </div>

              <p style="text-align: center;">
                <a href="${deepLinkUrl}" class="button">${isGerman ? 'Anfrage ansehen' : 'View Request'}</a>
              </p>
            </div>
            <div class="footer">
              <p>Viali Hospital Inventory Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send external surgery request notification:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent external surgery request notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending external surgery request notification:', error);
    return { success: false, error };
  }
}

export async function sendExternalSurgeryDeclineNotification(
  toEmail: string,
  surgeonName: string,
  hospitalName: string,
  patientName: string,
  surgeryName: string,
  wishedDate: string,
  declineReason?: string,
  language: 'de' | 'en' = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `OP-Anfrage abgelehnt: ${patientName} – ${surgeryName}`
      : `Surgery Request Declined: ${patientName} – ${surgeryName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'OP-Anfrage abgelehnt' : 'Surgery Request Declined'}</h1>
              <p style="margin: 0;">${hospitalName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Sehr geehrte/r Dr.' : 'Dear Dr.'} ${surgeonName},</p>
              <p>${isGerman
                ? `Ihre OP-Anfrage bei ${hospitalName} wurde leider abgelehnt.`
                : `Your surgery request at ${hospitalName} has been declined.`}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${patientName}</p>
                <p><strong>${isGerman ? 'Eingriff' : 'Surgery'}:</strong> ${surgeryName}</p>
                <p><strong>${isGerman ? 'Gewünschtes Datum' : 'Requested Date'}:</strong> ${wishedDate}</p>
                ${declineReason ? `<p><strong>${isGerman ? 'Begründung' : 'Reason'}:</strong> ${declineReason}</p>` : ''}
              </div>

              <p>${isGerman
                ? 'Bitte kontaktieren Sie uns für weitere Informationen oder um eine neue Anfrage einzureichen.'
                : 'Please contact us for more information or to submit a new request.'}</p>
              <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br>${hospitalName}</p>
            </div>
            <div class="footer">
              <p>Viali Hospital Inventory Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send external surgery decline notification:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent external surgery decline notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending external surgery decline notification:', error);
    return { success: false, error };
  }
}

export interface StockAlertItem {
  itemName: string;
  currentUnits: number;
  packsOnHand: number;
  dailyUsage: number;
  runwayDays: number | null;
  status: 'stockout' | 'critical' | 'warning';
}

export async function sendStockAlertEmail(
  toEmail: string,
  userName: string,
  hospitalName: string,
  alertItems: StockAlertItem[],
  dashboardUrl: string,
  language: 'de' | 'en' = 'en'
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending stock alert from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';
    
    const stockoutItems = alertItems.filter(i => i.status === 'stockout');
    const criticalItems = alertItems.filter(i => i.status === 'critical');
    const warningItems = alertItems.filter(i => i.status === 'warning');
    
    const subject = isGerman
      ? `⚠️ Bestandswarnung: ${alertItems.length} Artikel benötigen Aufmerksamkeit - ${hospitalName}`
      : `⚠️ Stock Alert: ${alertItems.length} items need attention - ${hospitalName}`;

    const getStatusEmoji = (status: string) => {
      switch (status) {
        case 'stockout': return '🔴';
        case 'critical': return '🟠';
        case 'warning': return '🟡';
        default: return '⚪';
      }
    };

    const renderItems = (items: StockAlertItem[], title: string) => {
      if (items.length === 0) return '';
      return `
        <h3 style="margin: 20px 0 10px; color: #333;">${title}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${isGerman ? 'Artikel' : 'Item'}</th>
              <th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${isGerman ? 'Bestand' : 'Stock'}</th>
              <th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${isGerman ? 'Tagesverbrauch' : 'Daily Usage'}</th>
              <th style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${isGerman ? 'Reichweite' : 'Runway'}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">
                  ${getStatusEmoji(item.status)} ${item.itemName}
                </td>
                <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee;">
                  ${item.currentUnits} ${isGerman ? 'Einh.' : 'units'}
                </td>
                <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee;">
                  ${item.dailyUsage.toFixed(1)}/${isGerman ? 'Tag' : 'day'}
                </td>
                <td style="text-align: right; padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: ${item.status === 'stockout' ? '#dc2626' : item.status === 'critical' ? '#ea580c' : '#ca8a04'};">
                  ${item.runwayDays !== null ? `${item.runwayDays} ${isGerman ? 'Tage' : 'days'}` : '-'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .summary { display: flex; gap: 20px; margin: 20px 0; }
            .summary-card { flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ ${isGerman ? 'Bestandswarnung' : 'Stock Alert'}</h1>
              <p style="margin: 0;">${hospitalName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Hello'} ${userName},</p>
              <p>${isGerman 
                ? `Die folgenden ${alertItems.length} Artikel benötigen Ihre Aufmerksamkeit basierend auf dem aktuellen Verbrauch:` 
                : `The following ${alertItems.length} items need your attention based on current usage patterns:`}</p>
              
              <div style="display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap;">
                ${stockoutItems.length > 0 ? `
                  <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 10px 15px; border-radius: 8px;">
                    <span style="font-size: 24px; font-weight: bold; color: #dc2626;">${stockoutItems.length}</span>
                    <span style="color: #dc2626;">${isGerman ? 'Nicht vorrätig' : 'Out of Stock'}</span>
                  </div>
                ` : ''}
                ${criticalItems.length > 0 ? `
                  <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 10px 15px; border-radius: 8px;">
                    <span style="font-size: 24px; font-weight: bold; color: #ea580c;">${criticalItems.length}</span>
                    <span style="color: #ea580c;">${isGerman ? 'Kritisch' : 'Critical'}</span>
                  </div>
                ` : ''}
                ${warningItems.length > 0 ? `
                  <div style="background: #fefce8; border: 1px solid #fef08a; padding: 10px 15px; border-radius: 8px;">
                    <span style="font-size: 24px; font-weight: bold; color: #ca8a04;">${warningItems.length}</span>
                    <span style="color: #ca8a04;">${isGerman ? 'Warnung' : 'Warning'}</span>
                  </div>
                ` : ''}
              </div>
              
              ${renderItems(stockoutItems, isGerman ? '🔴 Nicht vorrätig' : '🔴 Out of Stock')}
              ${renderItems(criticalItems, isGerman ? '🟠 Kritisch (<7 Tage)' : '🟠 Critical (<7 days)')}
              ${renderItems(warningItems, isGerman ? '🟡 Warnung' : '🟡 Warning')}
              
              <p style="text-align: center;">
                <a href="${dashboardUrl}" class="button">${isGerman ? 'Zum Bestandsüberblick' : 'View Stock Dashboard'}</a>
              </p>
              
              <p style="color: #666; font-size: 14px;">
                ${isGerman 
                  ? 'Die Bestandsreichweite wird basierend auf dem Medikamentenverbrauch der letzten 30 Tage berechnet.' 
                  : 'Stock runway is calculated based on medication usage from the last 30 days.'}
              </p>
            </div>
            <div class="footer">
              <p>Viali Hospital Inventory Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send stock alert email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent stock alert to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending stock alert email:', error);
    return { success: false, error };
  }
}

export async function sendSignedContractEmail(
  toEmail: string,
  workerName: string,
  clinicName: string,
  pdfBase64: string
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending signed contract from:', fromEmail, 'to:', toEmail);

    const subject = `Ihr unterschriebener Vertrag - ${clinicName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .highlight { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Vertrag vollständig unterzeichnet</h1>
            </div>
            <div class="content">
              <p>Guten Tag ${workerName},</p>
              <p>Ihr Vertrag für Kurzzeiteinsätze auf Abruf wurde von beiden Parteien unterzeichnet.</p>
              
              <div class="highlight">
                <p><strong>Auftraggeber:</strong> ${clinicName}</p>
                <p>Im Anhang finden Sie Ihr Exemplar des vollständig unterzeichneten Vertrags als PDF.</p>
              </div>
              
              <p>Bitte bewahren Sie dieses Dokument für Ihre Unterlagen auf.</p>
              
              <p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
              
              <p>Freundliche Grüsse,<br/>${clinicName}</p>
            </div>
            <div class="footer">
              <p>Diese E-Mail wurde automatisch generiert.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
      attachments: [
        {
          filename: `Vertrag_${workerName.replace(/\s+/g, '_')}.pdf`,
          content: pdfBase64,
        }
      ]
    });

    if (error) {
      logger.error('Failed to send signed contract email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent signed contract to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending signed contract email:', error);
    return { success: false, error };
  }
}

export async function sendTimeOffRequestEmail(
  toEmail: string,
  managerName: string,
  providerName: string,
  clinicName: string,
  startDate: string,
  endDate: string,
  reason: string | undefined,
  isRecurring: boolean,
  deepLinkUrl: string,
  language: 'de' | 'en' = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`;

    const subject = isGerman
      ? `Neuer Abwesenheitsantrag: ${providerName} (${dateRange})`
      : `New Time-Off Request: ${providerName} (${dateRange})`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f97316; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f97316; }
            .button { display: inline-block; padding: 12px 24px; background-color: #f97316; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'Neuer Abwesenheitsantrag' : 'New Time-Off Request'}</h1>
              <p style="margin: 0;">${clinicName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Hallo' : 'Hello'} ${managerName},</p>
              <p>${isGerman
                ? `${providerName} hat einen neuen Abwesenheitsantrag eingereicht:`
                : `${providerName} has submitted a new time-off request:`}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Mitarbeiter' : 'Staff Member'}:</strong> ${providerName}</p>
                <p><strong>${isGerman ? 'Zeitraum' : 'Period'}:</strong> ${dateRange}</p>
                ${reason ? `<p><strong>${isGerman ? 'Grund' : 'Reason'}:</strong> ${reason}</p>` : ''}
                ${isRecurring ? `<p><strong>${isGerman ? 'Typ' : 'Type'}:</strong> ${isGerman ? 'Wiederkehrend' : 'Recurring'}</p>` : ''}
              </div>

              <p style="text-align: center;">
                <a href="${deepLinkUrl}" class="button">${isGerman ? 'Antrag prüfen' : 'Review Request'}</a>
              </p>
            </div>
            <div class="footer">
              <p>Viali Hospital Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send time-off request email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent time-off request notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending time-off request email:', error);
    return { success: false, error };
  }
}

export async function sendTimeOffDeclinedEmail(
  toEmail: string,
  providerName: string,
  clinicName: string,
  startDate: string,
  endDate: string,
  reason: string | undefined,
  declinedByName: string,
  language: 'de' | 'en' = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`;

    const subject = isGerman
      ? `Abwesenheitsantrag abgelehnt: ${dateRange}`
      : `Time-Off Request Declined: ${dateRange}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'Abwesenheitsantrag abgelehnt' : 'Time-Off Request Declined'}</h1>
              <p style="margin: 0;">${clinicName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Hallo' : 'Hello'} ${providerName},</p>
              <p>${isGerman
                ? `Ihr Abwesenheitsantrag bei ${clinicName} wurde abgelehnt.`
                : `Your time-off request at ${clinicName} has been declined.`}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Zeitraum' : 'Period'}:</strong> ${dateRange}</p>
                ${reason ? `<p><strong>${isGerman ? 'Grund' : 'Reason'}:</strong> ${reason}</p>` : ''}
                <p><strong>${isGerman ? 'Abgelehnt von' : 'Declined by'}:</strong> ${declinedByName}</p>
              </div>

              <p>${isGerman
                ? 'Bitte kontaktieren Sie Ihren Vorgesetzten für weitere Informationen.'
                : 'Please contact your manager for more information.'}</p>
              <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br>${clinicName}</p>
            </div>
            <div class="footer">
              <p>Viali Hospital Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send time-off declined email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent time-off declined notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending time-off declined email:', error);
    return { success: false, error };
  }
}

export async function sendInvoiceEmail(
  toEmail: string,
  invoiceNumber: number,
  customerName: string,
  total: string,
  clinicName: string,
  pdfBase64: string,
  language: 'de' | 'en' = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending invoice from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';
    const subject = isGerman 
      ? `Rechnung Nr. ${invoiceNumber} - ${clinicName}`
      : `Invoice No. ${invoiceNumber} - ${clinicName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .invoice-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .total { font-size: 24px; font-weight: bold; color: #2563eb; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${clinicName}</h1>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Dear'} ${customerName},</p>
              <p>${isGerman 
                ? 'anbei erhalten Sie Ihre Rechnung als PDF-Anhang.' 
                : 'Please find your invoice attached as a PDF.'}</p>
              
              <div class="invoice-details">
                <p><strong>${isGerman ? 'Rechnungsnummer' : 'Invoice Number'}:</strong> ${invoiceNumber}</p>
                <p><strong>${isGerman ? 'Gesamtbetrag' : 'Total Amount'}:</strong> <span class="total">CHF ${total}</span></p>
              </div>
              
              <p>${isGerman 
                ? 'Bei Fragen stehen wir Ihnen gerne zur Verfügung.' 
                : 'If you have any questions, please do not hesitate to contact us.'}</p>
              
              <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br/>${clinicName}</p>
            </div>
            <div class="footer">
              <p>${isGerman ? 'Diese E-Mail wurde automatisch generiert.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
      attachments: [
        {
          filename: `${isGerman ? 'Rechnung' : 'Invoice'}_${invoiceNumber}.pdf`,
          content: pdfBase64,
        }
      ]
    });

    if (error) {
      logger.error('Failed to send invoice email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Error sending invoice email:', error);
    return { success: false, error };
  }
}

export async function sendQuestionnaireSubmittedNotification(
  toEmail: string,
  userName: string,
  hospitalName: string,
  patientName: string,
  submittedAt: string,
  deepLinkUrl: string,
  language: 'de' | 'en' = 'en'
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending questionnaire submission notification from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

    const subject = isGerman
      ? `Neuer Fragebogen eingereicht: ${patientName}`
      : `New Questionnaire Submitted: ${patientName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #8b5cf6; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
            .button { display: inline-block; padding: 12px 24px; background-color: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'Neuer Fragebogen eingereicht' : 'New Questionnaire Submitted'}</h1>
              <p style="margin: 0;">${hospitalName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag' : 'Hello'} ${userName},</p>
              <p>${isGerman
                ? 'Ein neuer Fragebogen wurde über den allgemeinen Spital-Link eingereicht:'
                : 'A new questionnaire has been submitted via the general hospital link:'}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${patientName}</p>
                <p><strong>${isGerman ? 'Eingereicht am' : 'Submitted at'}:</strong> ${submittedAt}</p>
              </div>

              <p>${isGerman
                ? 'Bitte ordnen Sie diese Antwort einem Patienten zu.'
                : 'Please associate this response with a patient record.'}</p>

              <p style="text-align: center;">
                <a href="${deepLinkUrl}" class="button">${isGerman ? 'Fragebögen ansehen' : 'View Questionnaires'}</a>
              </p>
            </div>
            <div class="footer">
              <p>Viali Hospital Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send questionnaire submission notification:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent questionnaire submission notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending questionnaire submission notification:', error);
    return { success: false, error };
  }
}

export async function sendSurgerySummaryEmail(
  toEmail: string,
  patientName: string,
  procedureName: string,
  surgeryDate: string,
  pdfBase64: string,
  language: 'de' | 'en' = 'en'
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending surgery summary from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

    const subject = isGerman
      ? `OP-Zusammenfassung: ${patientName} – ${procedureName} (${surgeryDate})`
      : `Surgery Summary: ${patientName} – ${procedureName} (${surgeryDate})`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? 'OP-Zusammenfassung' : 'Surgery Summary'}</h1>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag,' : 'Hello,'}</p>
              <p>${isGerman
                ? 'Im Anhang finden Sie die Zusammenfassung der folgenden Operation:'
                : 'Please find attached the summary for the following surgery:'}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${patientName}</p>
                <p><strong>${isGerman ? 'Eingriff' : 'Procedure'}:</strong> ${procedureName}</p>
                <p><strong>${isGerman ? 'Datum' : 'Date'}:</strong> ${surgeryDate}</p>
              </div>

              <p>${isGerman
                ? 'Bei Fragen stehen wir Ihnen gerne zur Verfügung.'
                : 'Please do not hesitate to contact us if you have any questions.'}</p>
            </div>
            <div class="footer">
              <p>Viali</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
      attachments: [
        {
          filename: `Surgery_Summary_${patientName.replace(/\s+/g, '_')}_${surgeryDate.replace(/\//g, '-')}.pdf`,
          content: pdfBase64,
        }
      ]
    });

    if (error) {
      logger.error('Failed to send surgery summary email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent surgery summary to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending surgery summary email:', error);
    return { success: false, error };
  }
}

export async function sendPortalVerificationEmail(
  toEmail: string,
  code: string,
  magicLinkUrl: string,
  language: string = 'de',
  hospitalName: string = 'Viali',
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `${code} – Ihr Zugangscode für ${hospitalName}`
      : `${code} – Your access code for ${hospitalName}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">${hospitalName}</h2>
        </div>
        <div style="padding: 30px; background-color: #f9fafb;">
          <p>${isGerman ? 'Guten Tag,' : 'Hello,'}</p>
          <p>${isGerman
            ? 'Ihr Zugangscode:'
            : 'Your access code:'}</p>

          <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px;
                      padding: 16px; text-align: center; margin: 16px 0;
                      font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: monospace;">
            ${code}
          </div>

          <p style="color: #999; font-size: 12px; text-align: center;">
            ${isGerman ? 'Gültig für 15 Minuten.' : 'Valid for 15 minutes.'}
          </p>

          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            ${isGerman
              ? 'Oder klicken Sie auf den folgenden Button, um direkt auf Ihr Portal zuzugreifen:'
              : 'Or click the button below to access your portal directly:'}
          </p>

          <div style="text-align: center; margin: 16px 0;">
            <a href="${magicLinkUrl}"
               style="display: inline-block; background: #2563eb; color: white;
                      padding: 14px 32px; text-decoration: none; border-radius: 8px;
                      font-weight: 600; font-size: 16px;">
              ${isGerman ? 'Portal öffnen' : 'Open Portal'}
            </a>
          </div>
        </div>
        <div style="padding: 16px; text-align: center; font-size: 12px; color: #999;">
          <p>Viali – ${isGerman ? 'Dies ist eine automatische Nachricht.' : 'This is an automated message.'}</p>
        </div>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('[Email] Failed to send portal verification email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Portal verification sent to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('[Email] Error sending portal verification email:', error);
    return { success: false, error };
  }
}

export async function sendAppointmentConfirmationEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de',
  manageUrl: string = '',
  providerName: string = '',
  videoMeetingLink: string = ''
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `Terminbestätigung – ${clinicName}`
      : `Appointment Confirmation – ${clinicName}`;

    const cancelSection = manageUrl ? `
        <p style="margin-top: 16px; font-size: 14px; color: #6b7280;">${isGerman
          ? 'Falls Sie den Termin verschieben oder absagen möchten:'
          : 'If you need to reschedule or cancel this appointment:'}</p>
        <p style="text-align: center; margin: 12px 0;">
          <a href="${manageUrl}" style="color: #2563eb; font-size: 14px;">${isGerman ? 'Termin verwalten' : 'Manage Appointment'}</a>
        </p>` : '';

    const videoSection = videoMeetingLink ? `
        <p style="margin-top: 12px; padding: 12px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <strong>📹 ${isGerman ? 'Video-Termin' : 'Video Appointment'}</strong><br/>
          <a href="${videoMeetingLink}" style="color: #2563eb; word-break: break-all;">${isGerman ? 'Hier beitreten' : 'Join here'}: ${videoMeetingLink}</a>
        </p>` : '';

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${clinicName}</h2>
        <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
        <p>${isGerman
          ? `Ihr Termin am ${appointmentDate} um ${appointmentTime}${providerName ? ` bei ${providerName}` : ''} wurde bestätigt. Bei Fragen kontaktieren Sie uns bitte direkt.`
          : `Your appointment on ${appointmentDate} at ${appointmentTime}${providerName ? ` with ${providerName}` : ''} has been confirmed. For questions, please contact us directly.`}</p>
        ${videoSection}
        ${cancelSection}
        <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send appointment confirmation email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent appointment confirmation to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending appointment confirmation email:', error);
    return { success: false, error };
  }
}

export async function sendAppointmentRescheduleEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de',
  manageUrl: string = '',
  providerName: string = '',
  videoMeetingLink: string = ''
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `Terminverschiebung – ${clinicName}`
      : `Appointment Rescheduled – ${clinicName}`;

    const cancelSection = manageUrl ? `
        <p style="margin-top: 16px; font-size: 14px; color: #6b7280;">${isGerman
          ? 'Falls Sie den Termin verschieben oder absagen möchten:'
          : 'If you need to reschedule or cancel this appointment:'}</p>
        <p style="text-align: center; margin: 12px 0;">
          <a href="${manageUrl}" style="color: #2563eb; font-size: 14px;">${isGerman ? 'Termin verwalten' : 'Manage Appointment'}</a>
        </p>` : '';

    const videoSection = videoMeetingLink ? `
        <p style="margin-top: 12px; padding: 12px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <strong>📹 ${isGerman ? 'Video-Termin' : 'Video Appointment'}</strong><br/>
          <a href="${videoMeetingLink}" style="color: #2563eb; word-break: break-all;">${isGerman ? 'Hier beitreten' : 'Join here'}: ${videoMeetingLink}</a>
        </p>` : '';

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${clinicName}</h2>
        <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
        <p>${isGerman
          ? `Ihr Termin wurde verschoben auf ${appointmentDate} um ${appointmentTime}${providerName ? ` bei ${providerName}` : ''}. Bei Fragen kontaktieren Sie uns bitte direkt.`
          : `Your appointment has been rescheduled to ${appointmentDate} at ${appointmentTime}${providerName ? ` with ${providerName}` : ''}. For questions, please contact us directly.`}</p>
        ${videoSection}
        ${cancelSection}
        <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send appointment reschedule email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent appointment reschedule email to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending appointment reschedule email:', error);
    return { success: false, error };
  }
}

export async function sendAppointmentCancellationEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `Terminabsage – ${clinicName}`
      : `Appointment Cancelled – ${clinicName}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${clinicName}</h2>
        <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
        <p>${isGerman
          ? `Ihr Termin am ${appointmentDate} um ${appointmentTime} bei ${clinicName} wurde abgesagt. Bei Fragen kontaktieren Sie uns bitte direkt.`
          : `Your appointment on ${appointmentDate} at ${appointmentTime} at ${clinicName} has been cancelled. For questions, please contact us directly.`}</p>
        <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send appointment cancellation email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent appointment cancellation email to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending appointment cancellation email:', error);
    return { success: false, error };
  }
}

export async function sendSurgeonActionRequestNotification(
  toEmail: string,
  hospitalName: string,
  surgeonEmail: string,
  requestType: 'cancellation' | 'reschedule' | 'suspension',
  reason: string,
  surgeryInfo: { patientName: string; surgeryName: string; plannedDate: string },
  proposedDate?: string | null,
  language: 'de' | 'en' = 'de',
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending surgeon action request notification from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

    const typeLabels: Record<typeof requestType, { de: string; en: string }> = {
      cancellation: { de: 'Absage', en: 'Cancellation' },
      reschedule: { de: 'Verschiebung', en: 'Reschedule' },
      suspension: { de: 'Sistierung', en: 'Suspension' },
    };

    const typeLabel = isGerman ? typeLabels[requestType].de : typeLabels[requestType].en;

    const subject = isGerman
      ? `Neue Chirurg-Anfrage (${typeLabel}): ${surgeryInfo.patientName} – ${surgeryInfo.surgeryName}`
      : `New Surgeon Request (${typeLabel}): ${surgeryInfo.patientName} – ${surgeryInfo.surgeryName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isGerman ? `Neue Chirurg-Anfrage: ${typeLabel}` : `New Surgeon Request: ${typeLabel}`}</h1>
              <p style="margin: 0;">${hospitalName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Guten Tag,' : 'Hello,'}</p>
              <p>${isGerman
                ? `Ein Chirurg hat eine ${typeLabel}-Anfrage über das Chirurgenportal eingereicht:`
                : `A surgeon has submitted a ${typeLabel.toLowerCase()} request through the surgeon portal:`}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Anfragetyp' : 'Request Type'}:</strong> ${typeLabel}</p>
                <p><strong>${isGerman ? 'Chirurg (E-Mail)' : 'Surgeon (Email)'}:</strong> ${surgeonEmail}</p>
                <p><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${surgeryInfo.patientName}</p>
                <p><strong>${isGerman ? 'Eingriff' : 'Surgery'}:</strong> ${surgeryInfo.surgeryName}</p>
                <p><strong>${isGerman ? 'Geplantes Datum' : 'Planned Date'}:</strong> ${surgeryInfo.plannedDate}</p>
                <p><strong>${isGerman ? 'Begründung' : 'Reason'}:</strong> ${reason}</p>
                ${proposedDate ? `<p><strong>${isGerman ? 'Vorgeschlagenes neues Datum' : 'Proposed New Date'}:</strong> ${proposedDate}</p>` : ''}
              </div>

              <p>${isGerman
                ? 'Bitte prüfen und bearbeiten Sie diese Anfrage im Verwaltungsbereich.'
                : 'Please review and process this request in the admin panel.'}</p>
            </div>
            <div class="footer">
              <p>Viali Hospital Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send surgeon action request notification:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent surgeon action request notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending surgeon action request notification:', error);
    return { success: false, error };
  }
}

export async function sendSurgeonActionResponseEmail(
  toEmail: string,
  surgeonName: string,
  hospitalName: string,
  requestType: 'cancellation' | 'reschedule' | 'suspension',
  response: 'accepted' | 'refused',
  surgeryInfo: { patientName: string; surgeryName: string; plannedDate: string },
  portalUrl: string,
  responseNote?: string | null,
  language: 'de' | 'en' = 'de',
) {
  try {
    const { client, fromEmail } = getResendClient();
    logger.info('[Email] Sending surgeon action response email from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';
    const isAccepted = response === 'accepted';

    const typeLabels: Record<typeof requestType, { de: string; en: string }> = {
      cancellation: { de: 'Absage', en: 'Cancellation' },
      reschedule: { de: 'Verschiebung', en: 'Reschedule' },
      suspension: { de: 'Sistierung', en: 'Suspension' },
    };

    const typeLabel = isGerman ? typeLabels[requestType].de : typeLabels[requestType].en;
    const headerColor = isAccepted ? '#16a34a' : '#dc2626';

    const subject = isGerman
      ? `${typeLabel}-Anfrage ${isAccepted ? 'angenommen' : 'abgelehnt'}: ${surgeryInfo.patientName} – ${surgeryInfo.surgeryName}`
      : `${typeLabel} Request ${isAccepted ? 'Accepted' : 'Refused'}: ${surgeryInfo.patientName} – ${surgeryInfo.surgeryName}`;

    const headingText = isGerman
      ? `${typeLabel}-Anfrage ${isAccepted ? 'angenommen' : 'abgelehnt'}`
      : `${typeLabel} Request ${isAccepted ? 'Accepted' : 'Refused'}`;

    const bodyMessage = isAccepted
      ? (isGerman
          ? `Ihre ${typeLabel}-Anfrage bei ${hospitalName} wurde angenommen.`
          : `Your ${typeLabel.toLowerCase()} request at ${hospitalName} has been accepted.`)
      : (isGerman
          ? `Ihre ${typeLabel}-Anfrage bei ${hospitalName} wurde leider abgelehnt.`
          : `Your ${typeLabel.toLowerCase()} request at ${hospitalName} has been refused.`);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${headerColor}; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9fafb; }
            .details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${headerColor}; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${headingText}</h1>
              <p style="margin: 0;">${hospitalName}</p>
            </div>
            <div class="content">
              <p>${isGerman ? 'Sehr geehrte/r Dr.' : 'Dear Dr.'} ${surgeonName},</p>
              <p>${bodyMessage}</p>

              <div class="details">
                <p><strong>${isGerman ? 'Anfragetyp' : 'Request Type'}:</strong> ${typeLabel}</p>
                <p><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${surgeryInfo.patientName}</p>
                <p><strong>${isGerman ? 'Eingriff' : 'Surgery'}:</strong> ${surgeryInfo.surgeryName}</p>
                <p><strong>${isGerman ? 'Geplantes Datum' : 'Planned Date'}:</strong> ${surgeryInfo.plannedDate}</p>
                ${responseNote ? `<p><strong>${isGerman ? 'Anmerkung' : 'Note'}:</strong> ${responseNote}</p>` : ''}
              </div>

              <p style="text-align: center;">
                <a href="${portalUrl}" class="button">${isGerman ? 'Zum Chirurgenportal' : 'Go to Surgeon Portal'}</a>
              </p>

              <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br>${hospitalName}</p>
            </div>
            <div class="footer">
              <p>Viali Hospital Management System</p>
              <p>${isGerman ? 'Dies ist eine automatische E-Mail.' : 'This is an automated email.'}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send surgeon action response email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent surgeon action response email to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending surgeon action response email:', error);
    return { success: false, error };
  }
}

export async function sendAppointmentReminderEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  manageUrl: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `Terminerinnerung – ${clinicName}`
      : `Appointment Reminder – ${clinicName}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${clinicName}</h2>
        <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
        <p>${isGerman
          ? `Wir möchten Sie an Ihren Termin am <strong>${appointmentDate}</strong> um <strong>${appointmentTime}</strong> erinnern.`
          : `This is a reminder for your appointment on <strong>${appointmentDate}</strong> at <strong>${appointmentTime}</strong>.`}</p>
        <p>${isGerman
          ? 'Falls Sie den Termin verschieben oder absagen möchten:'
          : 'If you need to reschedule or cancel this appointment:'}</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${manageUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            ${isGerman ? 'Termin verwalten' : 'Manage Appointment'}
          </a>
        </p>
        <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send appointment reminder email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Successfully sent appointment reminder to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending appointment reminder email:', error);
    return { success: false, error };
  }
}

export async function sendAppointmentPatientCancelledAlertEmail(
  toEmail: string,
  patientName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de'
) {
  try {
    const { client, fromEmail } = getResendClient();
    const isGerman = language === 'de';

    const subject = isGerman
      ? `Patient hat Termin abgesagt – ${appointmentDate} ${appointmentTime}`
      : `Patient cancelled appointment – ${appointmentDate} ${appointmentTime}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">${isGerman ? 'Terminabsage durch Patient' : 'Appointment Cancelled by Patient'}</h2>
        <p>${isGerman
          ? `<strong>${patientName}</strong> hat folgenden Termin über den Absage-Link abgesagt:`
          : `<strong>${patientName}</strong> has cancelled the following appointment via the cancellation link:`}</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>${isGerman ? 'Datum' : 'Date'}:</strong> ${appointmentDate}</p>
          <p style="margin: 4px 0;"><strong>${isGerman ? 'Uhrzeit' : 'Time'}:</strong> ${appointmentTime}</p>
          <p style="margin: 4px 0;"><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${patientName}</p>
        </div>
        <p style="color: #6b7280; font-size: 14px;">${isGerman
          ? 'Diese E-Mail wurde automatisch gesendet.'
          : 'This email was sent automatically.'}</p>
      </div>
    `;

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send patient-cancelled alert email:', error);
      return { success: false, error };
    }

    logger.info(`[Email] Sent patient-cancelled alert to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    logger.error('Error sending patient-cancelled alert email:', error);
    return { success: false, error };
  }
}
