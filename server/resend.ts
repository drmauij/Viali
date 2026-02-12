import { Resend } from 'resend';

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
  loginUrl: string
) {
  try {
    const { client, fromEmail } = getResendClient();
    console.log('[Email] Sending from:', fromEmail, 'to:', toEmail);

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
    const { client, fromEmail } = getResendClient();
    
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

export async function sendHospitalAddedNotification(
  toEmail: string,
  firstName: string,
  hospitalName: string,
  addedByName: string,
  loginUrl: string
) {
  try {
    const { client, fromEmail } = getResendClient();
    console.log('[Email] Sending hospital added notification from:', fromEmail, 'to:', toEmail);

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
              <h1>You've Been Added to a New Hospital</h1>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              <p>Good news! You have been added to a new hospital in the Viali inventory management system.</p>
              
              <div class="highlight">
                <p><strong>Hospital:</strong> ${hospitalName}</p>
                <p><strong>Added by:</strong> ${addedByName}</p>
              </div>
              
              <p>You can now access this hospital using your existing credentials. Simply log in and switch to the new hospital from your hospital selector.</p>
              
              <p style="text-align: center;">
                <a href="${loginUrl}" class="button">Go to Viali</a>
              </p>
              
              <p>If you have any questions, please contact your hospital administrator.</p>
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
      subject: `You've been added to ${hospitalName} - Viali`,
      html,
    });

    if (error) {
      console.error('Failed to send hospital added notification:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending hospital added notification:', error);
    return { success: false, error };
  }
}

export async function sendBulkImportCompleteEmail(
  toEmail: string,
  userName: string,
  itemsExtracted: number,
  previewUrl: string
) {
  try {
    const { client, fromEmail } = getResendClient();
    
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
              <h1>✅ Bulk Import Complete!</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>Great news! Your bulk import has finished processing.</p>
              
              <div class="stats">
                <p><strong>Items Extracted:</strong> ${itemsExtracted}</p>
              </div>
              
              <p>Click the button below to review and import the items:</p>
              <p style="text-align: center;">
                <a href="${previewUrl}" class="button">Review Import</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #10b981;">${previewUrl}</p>
              
              <p>You can review the extracted items, make adjustments, and confirm the import.</p>
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
      subject: `Bulk Import Complete - ${itemsExtracted} Items Ready`,
      html,
    });

    if (error) {
      console.error('Failed to send bulk import email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending bulk import email:', error);
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
  language: 'de' | 'en' = 'en'
) {
  try {
    const { client, fromEmail } = getResendClient();
    console.log('[Email] Sending external surgery request notification from:', fromEmail, 'to:', toEmail);

    const isGerman = language === 'de';

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
                <p><strong>${isGerman ? 'Gewünschtes Datum' : 'Requested Date'}:</strong> ${wishedDate}</p>
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
      console.error('Failed to send external surgery request notification:', error);
      return { success: false, error };
    }

    console.log(`[Email] Successfully sent external surgery request notification to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    console.error('Error sending external surgery request notification:', error);
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
    console.log('[Email] Sending stock alert from:', fromEmail, 'to:', toEmail);

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
      console.error('Failed to send stock alert email:', error);
      return { success: false, error };
    }

    console.log(`[Email] Successfully sent stock alert to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    console.error('Error sending stock alert email:', error);
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
    console.log('[Email] Sending signed contract from:', fromEmail, 'to:', toEmail);

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
      console.error('Failed to send signed contract email:', error);
      return { success: false, error };
    }

    console.log(`[Email] Successfully sent signed contract to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    console.error('Error sending signed contract email:', error);
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
    console.log('[Email] Sending invoice from:', fromEmail, 'to:', toEmail);

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
      console.error('Failed to send invoice email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error sending invoice email:', error);
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
    console.log('[Email] Sending surgery summary from:', fromEmail, 'to:', toEmail);

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
      console.error('Failed to send surgery summary email:', error);
      return { success: false, error };
    }

    console.log(`[Email] Successfully sent surgery summary to ${toEmail}`);
    return { success: true, data };
  } catch (error) {
    console.error('Error sending surgery summary email:', error);
    return { success: false, error };
  }
}
