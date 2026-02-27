# VeKa-Center Address Lookup — Research Note (No Action)

**Date:** 2026-02-27
**Status:** Deferred — address remains a manual field

## Context

The card reader bridge reads Swiss eCH-0064 insurance cards but does NOT extract address data — the card chip doesn't contain it. The question was: how does competing software (E-PAT by Vitabyte) get patient addresses from the card?

## Findings

**E-PAT uses the SASIS AG VeKa-Center "Abfragedienst Leistungserbringer" service.**

Flow:
```
Card scan → card number (VeKa-No) → SASIS VeKa-Center API → full patient data incl. address
```

VeKa-Center returns (per contract agreement):
- Patient name, AHV, policy/insured number
- **Patient address** (if agreed upon)
- Insurer contact + billing address (for Tiers payant invoicing)
- Coverage info (KVG basic + VVG supplemental)
- Card validity period

Access requires:
- Formal registration agreement with SASIS AG → lsp-online@sasis.ch
- Integration of their SOAP Webservice: https://docs.sasis.ch/pages/viewpage.action?pageId=330301881

## Decision

**Skipped for now.** Address remains a manual entry field when creating a new patient via card scan.

## If implemented in future

1. Register Viali as a "Leistungserbringer" software with SASIS AG (contact: lsp-online@sasis.ch)
2. Add server-side SOAP call to VeKa-Center in `/server/routes/cardReader.ts` after card data arrives
3. Enrich the patient data payload before returning lookup result to the bridge
4. No client-side changes needed — the `street`/`postalCode`/`city` fields already flow through the URL params to the new patient form
