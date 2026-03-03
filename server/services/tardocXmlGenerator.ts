/**
 * TARDOC XML Invoice Generator
 * Generates generalInvoiceRequest XML 5.0 for Swiss insurance billing.
 * Reference: Forum Datenaustausch - https://www.forum-datenaustausch.ch/xml-standards/rechnung
 */

import { db } from '../db';
import { tardocInvoices, tardocInvoiceItems, hospitals } from '@shared/schema';
import { eq, asc } from 'drizzle-orm';

interface InvoiceWithItems {
  id: string;
  hospitalId: string;
  invoiceNumber: number;
  billingModel: string;
  treatmentType: string | null;
  treatmentReason: string | null;
  lawType: string;
  caseNumber: string | null;
  caseDate: string | null;
  caseDateEnd: string | null;
  treatmentCanton: string | null;
  billerGln: string | null;
  billerZsr: string | null;
  providerGln: string | null;
  providerZsr: string | null;
  referringPhysicianGln: string | null;
  insurerGln: string | null;
  insurerName: string | null;
  insuranceNumber: string | null;
  ahvNumber: string | null;
  patientSurname: string | null;
  patientFirstName: string | null;
  patientBirthday: string | null;
  patientSex: string | null;
  patientStreet: string | null;
  patientPostalCode: string | null;
  patientCity: string | null;
  tpValue: string | null;
  subtotalTp: string | null;
  subtotalChf: string | null;
  vatAmount: string | null;
  totalChf: string | null;
  status: string;
  createdAt: Date | null;
  items: Array<{
    id: string;
    tardocCode: string;
    description: string;
    treatmentDate: string;
    session: number | null;
    quantity: number;
    taxPoints: string;
    tpValue: string;
    scalingFactor: string | null;
    sideCode: string | null;
    providerGln: string | null;
    amountAl: string | null;
    amountTl: string | null;
    amountChf: string;
    vatRate: string | null;
    vatAmount: string | null;
  }>;
  hospital?: {
    companyName: string | null;
    companyStreet: string | null;
    companyPostalCode: string | null;
    companyCity: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
    companyGln: string | null;
    companyZsr: string | null;
    companyBankIban: string | null;
    companyBankName: string | null;
  };
}

function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  // Ensure YYYY-MM-DD format
  return dateStr.split('T')[0];
}

function genderCode(sex: string | null): string {
  if (sex === 'M') return 'male';
  if (sex === 'F') return 'female';
  return 'male'; // Default
}

/**
 * Generate generalInvoiceRequest XML 5.0
 */
export function generateTardocXml(invoice: InvoiceWithItems): string {
  const requestId = `${invoice.invoiceNumber}-${Date.now()}`;
  const requestDate = new Date().toISOString();
  const h = invoice.hospital;

  // Build services XML
  const servicesXml = invoice.items.map((item, idx) => {
    const recordId = idx + 1;
    const dateFrom = formatDate(item.treatmentDate);
    const tp = parseFloat(item.taxPoints) || 0;
    const tpv = parseFloat(item.tpValue) || 1;
    const sf = parseFloat(item.scalingFactor || '1') || 1;
    const amount = parseFloat(item.amountChf) || 0;
    const provGln = item.providerGln || invoice.providerGln || '';

    return `      <invoice:service_ex
        tariff_type="590"
        code="${escapeXml(item.tardocCode)}"
        name="${escapeXml(item.description)}"
        session="${item.session || 1}"
        quantity="${item.quantity}"
        date_begin="${dateFrom}"
        provider_id="${escapeXml(provGln)}"
        responsible_id="${escapeXml(provGln)}"
        unit="${tp.toFixed(2)}"
        unit_factor="${tpv.toFixed(4)}"
        external_factor="${sf.toFixed(2)}"
        amount="${amount.toFixed(2)}"
        vat_rate="${parseFloat(item.vatRate || '0').toFixed(2)}"
        record_id="${recordId}"
        ${item.sideCode ? `side="${escapeXml(item.sideCode)}"` : ''}
      />`;
  }).join('\n');

  // Build tiers section based on billing model
  const billerSection = `
        <invoice:biller ean_party="${escapeXml(invoice.billerGln)}" zsr="${escapeXml(invoice.billerZsr)}">
          <invoice:company>
            <invoice:companyname>${escapeXml(h?.companyName)}</invoice:companyname>
            <invoice:postal>
              <invoice:street>${escapeXml(h?.companyStreet)}</invoice:street>
              <invoice:zip>${escapeXml(h?.companyPostalCode)}</invoice:zip>
              <invoice:city>${escapeXml(h?.companyCity)}</invoice:city>
            </invoice:postal>
          </invoice:company>
        </invoice:biller>`;

  const providerSection = `
        <invoice:provider ean_party="${escapeXml(invoice.providerGln)}" zsr="${escapeXml(invoice.providerZsr)}">
          <invoice:company>
            <invoice:companyname>${escapeXml(h?.companyName)}</invoice:companyname>
            <invoice:postal>
              <invoice:street>${escapeXml(h?.companyStreet)}</invoice:street>
              <invoice:zip>${escapeXml(h?.companyPostalCode)}</invoice:zip>
              <invoice:city>${escapeXml(h?.companyCity)}</invoice:city>
            </invoice:postal>
          </invoice:company>
        </invoice:provider>`;

  const insuranceSection = `
        <invoice:insurance ean_party="${escapeXml(invoice.insurerGln)}">
          <invoice:company>
            <invoice:companyname>${escapeXml(invoice.insurerName)}</invoice:companyname>
          </invoice:company>
        </invoice:insurance>`;

  const patientSection = `
        <invoice:patient gender="${genderCode(invoice.patientSex)}" birthdate="${formatDate(invoice.patientBirthday)}" ssn="${escapeXml(invoice.ahvNumber)}">
          <invoice:person salutation="none">
            <invoice:familyname>${escapeXml(invoice.patientSurname)}</invoice:familyname>
            <invoice:givenname>${escapeXml(invoice.patientFirstName)}</invoice:givenname>
            <invoice:postal>
              <invoice:street>${escapeXml(invoice.patientStreet)}</invoice:street>
              <invoice:zip>${escapeXml(invoice.patientPostalCode)}</invoice:zip>
              <invoice:city>${escapeXml(invoice.patientCity)}</invoice:city>
            </invoice:postal>
          </invoice:person>
        </invoice:patient>`;

  const balanceSection = `
        <invoice:balance
          currency="CHF"
          amount="${parseFloat(invoice.subtotalChf || '0').toFixed(2)}"
          amount_obligations="${parseFloat(invoice.totalChf || '0').toFixed(2)}"
          amount_due="${parseFloat(invoice.totalChf || '0').toFixed(2)}"
        >
          <invoice:vat>
            <invoice:vat_rate vat_rate="0.00" amount="${parseFloat(invoice.subtotalChf || '0').toFixed(2)}" vat="${parseFloat(invoice.vatAmount || '0').toFixed(2)}" />
          </invoice:vat>
        </invoice:balance>`;

  let tiersSection: string;

  if (invoice.billingModel === 'TG') {
    // Tiers Garant: patient pays, gets reimbursed by insurer
    const guarantorSection = `
        <invoice:guarantor>
          <invoice:person salutation="none">
            <invoice:familyname>${escapeXml(invoice.patientSurname)}</invoice:familyname>
            <invoice:givenname>${escapeXml(invoice.patientFirstName)}</invoice:givenname>
            <invoice:postal>
              <invoice:street>${escapeXml(invoice.patientStreet)}</invoice:street>
              <invoice:zip>${escapeXml(invoice.patientPostalCode)}</invoice:zip>
              <invoice:city>${escapeXml(invoice.patientCity)}</invoice:city>
            </invoice:postal>
          </invoice:person>
        </invoice:guarantor>`;

    tiersSection = `
      <invoice:tiers_garant payment_period="30">
${billerSection}
${providerSection}
${insuranceSection}
${patientSection}
${guarantorSection}
${balanceSection}
      </invoice:tiers_garant>`;
  } else {
    // Tiers Payant: insurer pays directly
    tiersSection = `
      <invoice:tiers_payant>
${billerSection}
${providerSection}
${insuranceSection}
${patientSection}
${balanceSection}
      </invoice:tiers_payant>`;
  }

  // Treatment section
  const treatmentSection = `
      <invoice:treatment
        date_begin="${formatDate(invoice.caseDate)}"
        date_end="${formatDate(invoice.caseDateEnd || invoice.caseDate)}"
        canton="${escapeXml(invoice.treatmentCanton) || 'ZH'}"
        reason="${escapeXml(invoice.treatmentReason) || 'disease'}"
        type="${escapeXml(invoice.treatmentType) || 'ambulatory'}"
      />`;

  // Assemble full XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<invoice:request
  xmlns:invoice="http://www.forum-datenaustausch.ch/invoice"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.forum-datenaustausch.ch/invoice generalInvoiceRequest_500.xsd"
  language="de"
  modus="production"
  validation_status="0"
>
  <invoice:processing>
    <invoice:transport from="${escapeXml(invoice.billerGln)}" to="${escapeXml(invoice.insurerGln)}">
      <invoice:via via="${escapeXml(invoice.billerGln)}" sequence_id="1" />
    </invoice:transport>
  </invoice:processing>

  <invoice:payload type="invoice" copy="0" storno="0">
    <invoice:invoice
      request_timestamp="${Math.floor(Date.now() / 1000)}"
      request_date="${formatDate(null)}"
      request_id="${escapeXml(requestId)}"
    />
    <invoice:body role="physician" place="practice">
${tiersSection}

${treatmentSection}

    <invoice:services>
${servicesXml}
    </invoice:services>
    </invoice:body>
  </invoice:payload>
</invoice:request>`;

  return xml;
}

/**
 * Load invoice data and generate XML
 */
export async function generateXmlForInvoice(invoiceId: string, hospitalId: string): Promise<string> {
  const [invoice] = await db
    .select()
    .from(tardocInvoices)
    .where(eq(tardocInvoices.id, invoiceId));

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.hospitalId !== hospitalId) {
    throw new Error('Invoice does not belong to this hospital');
  }

  const items = await db
    .select()
    .from(tardocInvoiceItems)
    .where(eq(tardocInvoiceItems.invoiceId, invoiceId))
    .orderBy(asc(tardocInvoiceItems.sortOrder));

  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId));

  // Update export timestamp
  await db
    .update(tardocInvoices)
    .set({ xmlExportedAt: new Date(), updatedAt: new Date() })
    .where(eq(tardocInvoices.id, invoiceId));

  return generateTardocXml({
    ...invoice,
    items: items.map(i => ({
      ...i,
      treatmentDate: i.treatmentDate,
      quantity: i.quantity,
      taxPoints: i.taxPoints,
      tpValue: i.tpValue,
      amountChf: i.amountChf,
    })),
    hospital: hospital ? {
      companyName: hospital.companyName,
      companyStreet: hospital.companyStreet,
      companyPostalCode: hospital.companyPostalCode,
      companyCity: hospital.companyCity,
      companyPhone: hospital.companyPhone,
      companyEmail: hospital.companyEmail,
      companyGln: hospital.companyGln,
      companyZsr: hospital.companyZsr,
      companyBankIban: hospital.companyBankIban,
      companyBankName: hospital.companyBankName,
    } : undefined,
  });
}
