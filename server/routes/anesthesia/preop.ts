import { Router } from "express";
import type { Request } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import { insertPreOpAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import { requireWriteAccess, requireStrictHospitalAccess } from "../../utils";
import { Resend } from "resend";
import { sendSms, isSmsConfiguredForHospital } from "../../sms";
import { nanoid } from "nanoid";
import logger from "../../logger";

const router = Router();

router.get('/api/anesthesia/preop', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const assessments = await storage.getPreOpAssessments(hospitalId as string);
    
    res.json(assessments);
  } catch (error) {
    logger.error("Error fetching pre-op assessments:", error);
    res.status(500).json({ message: "Failed to fetch pre-op assessments" });
  }
});

router.get('/api/anesthesia/preop/surgery/:surgeryId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const assessment = await storage.getPreOpAssessment(surgeryId);
    
    res.json(assessment || null);
  } catch (error) {
    logger.error("Error fetching pre-op assessment:", error);
    res.status(500).json({ message: "Failed to fetch pre-op assessment" });
  }
});

router.get('/api/anesthesia/preop-assessments/bulk', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryIds } = req.query;
    const userId = req.user.id;

    if (!surgeryIds) {
      return res.json([]);
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hospitalIds = hospitals.map(h => h.id);

    const surgeryIdArray = (surgeryIds as string).split(',');
    
    const assessments = await storage.getPreOpAssessmentsBySurgeryIds(surgeryIdArray, hospitalIds);
    
    res.json(assessments);
  } catch (error) {
    logger.error("Error fetching bulk pre-op assessments:", error);
    res.status(500).json({ message: "Failed to fetch pre-op assessments" });
  }
});

router.post('/api/anesthesia/preop', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertPreOpAssessmentSchema.parse(req.body);

    const surgery = await storage.getSurgery(validatedData.surgeryId);

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    if (validatedData.allergies !== undefined || validatedData.allergiesOther !== undefined) {
      const patientUpdates: any = {};
      
      if (validatedData.allergies !== undefined) {
        patientUpdates.allergies = validatedData.allergies;
      }
      
      if (validatedData.allergiesOther !== undefined) {
        patientUpdates.otherAllergies = validatedData.allergiesOther;
      }
      
      await storage.updatePatient(surgery.patientId, patientUpdates);
    }

    const newAssessment = await storage.createPreOpAssessment(validatedData);
    
    res.status(201).json(newAssessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating pre-op assessment:", error);
    res.status(500).json({ message: "Failed to create pre-op assessment" });
  }
});

router.patch('/api/anesthesia/preop/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const assessment = await storage.getPreOpAssessmentById(id);

    if (!assessment) {
      return res.status(404).json({ message: "Pre-op assessment not found" });
    }

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    if (req.body.allergies !== undefined || req.body.allergiesOther !== undefined) {
      const patientUpdates: any = {};
      
      if (req.body.allergies !== undefined) {
        patientUpdates.allergies = req.body.allergies;
      }
      
      if (req.body.allergiesOther !== undefined) {
        patientUpdates.otherAllergies = req.body.allergiesOther;
      }
      
      await storage.updatePatient(surgery.patientId, patientUpdates);
    }

    const updatedAssessment = await storage.updatePreOpAssessment(id, req.body);
    
    res.json(updatedAssessment);
  } catch (error) {
    logger.error("Error updating pre-op assessment:", error);
    res.status(500).json({ message: "Failed to update pre-op assessment" });
  }
});

router.post('/api/anesthesia/preop/batch-export', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { assessmentIds, language = 'de' } = req.body;

    if (!assessmentIds || !Array.isArray(assessmentIds) || assessmentIds.length === 0) {
      return res.status(400).json({ message: "assessmentIds array is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hospitalIds = hospitals.map(h => h.id);

    const { jsPDF } = await import('jspdf');
    const archiver = (await import('archiver')).default;

    const translations: Record<string, Record<string, string>> = {
      en: {
        title: 'Pre-Op Assessment / Anesthesia Informed Consent',
        patientInfo: 'Patient Information',
        name: 'Name',
        birthday: 'Birthday',
        years: 'years',
        gender: 'Gender',
        male: 'Male',
        female: 'Female',
        other: 'Other',
        surgeryInfo: 'Surgery Information',
        plannedSurgery: 'Planned Surgery',
        surgeon: 'Surgeon',
        plannedDate: 'Planned Date',
        preOpAssessment: 'Pre-Op Assessment',
        asaClassification: 'ASA Classification',
        weight: 'Weight',
        height: 'Height',
        allergies: 'Allergies',
        cave: 'CAVE',
        medications: 'Medications',
        anticoagulation: 'Anticoagulation',
        generalMeds: 'General Meds',
        medicationNotes: 'Medication Notes',
        medicalHistory: 'Medical History',
        heart: 'Heart / Cardiovascular',
        lungs: 'Lungs / Respiratory',
        gi: 'Gastrointestinal',
        kidney: 'Kidney / Urological',
        metabolic: 'Metabolic / Endocrine',
        neuro: 'Neurological',
        psych: 'Psychiatric',
        skeletal: 'Musculoskeletal',
        coagulation: 'Coagulation Disorders',
        infectious: 'Infectious Diseases',
        women: "Women's Health",
        noxen: 'Substance Use (Noxen)',
        pediatric: 'Pediatric Issues',
        notes: 'Notes',
        anesthesiaSurgicalHistory: 'Anesthesia & Surgical History',
        anesthesiaHistoryIssues: 'Anesthesia History Issues',
        dentalIssues: 'Dental Issues',
        ponvTransfusion: 'PONV / Transfusion',
        previousSurgeries: 'Previous Surgeries',
        plannedAnesthesia: 'Planned Anesthesia',
        techniques: 'Techniques',
        generalAnesthesia: 'General Anesthesia',
        spinal: 'Spinal',
        epidural: 'Epidural',
        regional: 'Regional',
        sedation: 'Sedation',
        combined: 'Combined',
        generalOptions: 'General Options',
        epiduralOptions: 'Epidural Options',
        regionalOptions: 'Regional Options',
        postOpICU: 'Post-Op ICU',
        yes: 'Yes',
        otherAnesthesiaNotes: 'Other Anesthesia Notes',
        specialNotes: 'Special Notes',
        anesthesiaTechniqueInfo: 'Anesthesia Technique Information',
        techniqueGeneral: 'General Anesthesia',
        techniqueGeneralDesc: 'Complete loss of consciousness through intravenous and/or inhaled medications.',
        techniqueGeneralRisks: 'Possible adverse events: Nausea, vomiting, sore throat, dental damage, awareness during anesthesia (rare), allergic reactions, cardiovascular complications.',
        techniqueSpinal: 'Spinal Anesthesia',
        techniqueSpinalDesc: 'Injection of local anesthetic into the cerebrospinal fluid for lower body numbness.',
        techniqueSpinalRisks: 'Possible adverse events: Post-dural puncture headache, hypotension, urinary retention, back pain, nerve damage (rare).',
        techniqueEpidural: 'Epidural Anesthesia',
        techniqueEpiduralDesc: 'Injection of local anesthetic into the epidural space, often with catheter placement for continuous administration.',
        techniqueEpiduralRisks: 'Possible adverse events: Hypotension, headache (if dura punctured), back pain, incomplete block, epidural hematoma or abscess (rare).',
        techniqueRegional: 'Regional Anesthesia',
        techniqueRegionalDesc: 'Numbing of a specific region through local anesthetic injections (Spinal, Epidural, Nerve Blocks).',
        techniqueRegionalRisks: 'Possible adverse events: Headache, back pain, nerve damage (rare), hypotension, bleeding, infection at the injection site.',
        techniqueSedation: 'Sedation / Monitored Anesthesia Care',
        techniqueSedationDesc: 'Administration of sedative medications to reduce anxiety and provide comfort while maintaining consciousness.',
        techniqueSedationRisks: 'Possible adverse events: Respiratory depression, nausea, paradoxical reactions, delayed awakening, aspiration (if not fasting).',
        techniqueCombined: 'Combined Technique',
        techniqueCombinedDesc: 'Combination of general anesthesia with regional techniques for optimal pain control.',
        techniqueCombinedRisks: 'Risks associated with each individual technique apply. May provide enhanced pain relief with potentially reduced overall anesthetic requirements.',
        fastingRequirements: 'Pre-Operative Fasting Requirements',
        fastingFood: 'No solid food for 6 hours before surgery',
        fastingLiquids: 'No liquids for 2 hours before surgery (water only allowed until then)',
        ambulatorySupervision: 'Post-Anesthesia Care for Outpatients',
        ambulatorySupervisionText: 'For outpatient (ambulatory) procedures: The patient must be accompanied and supervised by a responsible adult for 24 hours after anesthesia.',
        informedConsent: 'Informed Consent',
        consentFor: 'Consent for',
        generalConsentGiven: 'General Consent Given',
        analgosedation: 'Analgosedation',
        regionalAnesthesia: 'Regional Anesthesia',
        installations: 'Installations (IV, Arterial, etc.)',
        icuIntensiveCare: 'ICU / Intensive Care',
        consentInfo: 'Consent Information',
        additionalConsentNotes: 'Additional Consent Notes',
        doctorSignature: 'Doctor Signature',
        date: 'Date',
        patientSignatureQuestionnaire: 'Patient Signature (from questionnaire)',
        patientSignaturePhysical: 'Patient Signature (physical)',
        signature: 'Signature',
      },
      de: {
        title: 'Präoperative Beurteilung / Anästhesie-Einwilligung',
        patientInfo: 'Patienteninformationen',
        name: 'Name',
        birthday: 'Geburtsdatum',
        years: 'Jahre',
        gender: 'Geschlecht',
        male: 'Männlich',
        female: 'Weiblich',
        other: 'Andere',
        surgeryInfo: 'Operationsinformationen',
        plannedSurgery: 'Geplante Operation',
        surgeon: 'Chirurg',
        plannedDate: 'Geplantes Datum',
        preOpAssessment: 'Präoperative Beurteilung',
        asaClassification: 'ASA-Klassifikation',
        weight: 'Gewicht',
        height: 'Größe',
        allergies: 'Allergien',
        cave: 'CAVE',
        medications: 'Medikamente',
        anticoagulation: 'Antikoagulation',
        generalMeds: 'Allgemeine Medikamente',
        medicationNotes: 'Medikamenten-Hinweise',
        medicalHistory: 'Anamnese',
        heart: 'Herz / Kreislauf',
        lungs: 'Lunge / Atmung',
        gi: 'Magen-Darm',
        kidney: 'Niere / Urologie',
        metabolic: 'Stoffwechsel / Endokrin',
        neuro: 'Neurologie',
        psych: 'Psychiatrie',
        skeletal: 'Bewegungsapparat',
        coagulation: 'Gerinnungsstörungen',
        infectious: 'Infektionskrankheiten',
        women: 'Frauengesundheit',
        noxen: 'Substanzgebrauch (Noxen)',
        pediatric: 'Pädiatrische Probleme',
        notes: 'Hinweise',
        anesthesiaSurgicalHistory: 'Anästhesie- & OP-Vorgeschichte',
        anesthesiaHistoryIssues: 'Anästhesie-Vorgeschichte',
        dentalIssues: 'Zahnprobleme',
        ponvTransfusion: 'PONV / Transfusion',
        previousSurgeries: 'Frühere Operationen',
        plannedAnesthesia: 'Geplante Anästhesie',
        techniques: 'Verfahren',
        generalAnesthesia: 'Allgemeinanästhesie',
        spinal: 'Spinal',
        epidural: 'Epidural',
        regional: 'Regional',
        sedation: 'Sedierung',
        combined: 'Kombiniert',
        generalOptions: 'Allgemein-Optionen',
        epiduralOptions: 'Epidural-Optionen',
        regionalOptions: 'Regional-Optionen',
        postOpICU: 'Post-OP Intensivstation',
        yes: 'Ja',
        otherAnesthesiaNotes: 'Weitere Anästhesie-Hinweise',
        specialNotes: 'Besondere Hinweise',
        anesthesiaTechniqueInfo: 'Informationen zu Anästhesieverfahren',
        techniqueGeneral: 'Allgemeinanästhesie',
        techniqueGeneralDesc: 'Vollständiger Bewusstseinsverlust durch intravenöse und/oder inhalierte Medikamente.',
        techniqueGeneralRisks: 'Mögliche unerwünschte Ereignisse: Übelkeit, Erbrechen, Halsschmerzen, Zahnschäden, Wachheit während der Anästhesie (selten), allergische Reaktionen, kardiovaskuläre Komplikationen.',
        techniqueSpinal: 'Spinalanästhesie',
        techniqueSpinalDesc: 'Injektion von Lokalanästhetikum in die Cerebrospinalflüssigkeit zur Betäubung des unteren Körperbereichs.',
        techniqueSpinalRisks: 'Mögliche unerwünschte Ereignisse: Postpunktioneller Kopfschmerz, Hypotonie, Harnverhalt, Rückenschmerzen, Nervenschäden (selten).',
        techniqueEpidural: 'Epiduralanästhesie',
        techniqueEpiduralDesc: 'Injektion von Lokalanästhetikum in den Epiduralraum, oft mit Katheteranlage für kontinuierliche Verabreichung.',
        techniqueEpiduralRisks: 'Mögliche unerwünschte Ereignisse: Hypotonie, Kopfschmerzen (bei Durapunktion), Rückenschmerzen, unvollständige Blockade, Epiduralhämatom oder -abszess (selten).',
        techniqueRegional: 'Regionalanästhesie',
        techniqueRegionalDesc: 'Betäubung einer bestimmten Region durch Lokalanästhetika-Injektionen (Spinal, Epidural, Nervenblockaden).',
        techniqueRegionalRisks: 'Mögliche unerwünschte Ereignisse: Kopfschmerzen, Rückenschmerzen, Nervenschäden (selten), Hypotonie, Blutung, Infektion an der Injektionsstelle.',
        techniqueSedation: 'Sedierung / Überwachte Anästhesiepflege',
        techniqueSedationDesc: 'Verabreichung von Beruhigungsmitteln zur Angstreduktion und Komfortsteigerung bei erhaltenem Bewusstsein.',
        techniqueSedationRisks: 'Mögliche unerwünschte Ereignisse: Atemdepression, Übelkeit, paradoxe Reaktionen, verzögertes Erwachen, Aspiration (bei fehlendem Nüchternsein).',
        techniqueCombined: 'Kombinierte Technik',
        techniqueCombinedDesc: 'Kombination von Allgemeinanästhesie mit Regionalverfahren für optimale Schmerzkontrolle.',
        techniqueCombinedRisks: 'Die Risiken der einzelnen Techniken gelten entsprechend. Kann eine verbesserte Schmerzlinderung bei potenziell reduziertem Gesamtanästhetikabedarf bieten.',
        fastingRequirements: 'Präoperative Nüchternheitsanforderungen',
        fastingFood: 'Keine feste Nahrung für 6 Stunden vor der Operation',
        fastingLiquids: 'Keine Flüssigkeiten für 2 Stunden vor der Operation (nur Wasser bis dahin erlaubt)',
        ambulatorySupervision: 'Postanästhetische Versorgung für ambulante Patienten',
        ambulatorySupervisionText: 'Für ambulante Eingriffe: Der Patient muss für 24 Stunden nach der Anästhesie von einer verantwortlichen erwachsenen Person begleitet und beaufsichtigt werden.',
        informedConsent: 'Einverständniserklärung',
        consentFor: 'Einwilligung für',
        generalConsentGiven: 'Allgemeine Einwilligung erteilt',
        analgosedation: 'Analgosedierung',
        regionalAnesthesia: 'Regionalanästhesie',
        installations: 'Installationen (IV, Arteriell, etc.)',
        icuIntensiveCare: 'Intensivstation',
        consentInfo: 'Aufklärungstext',
        additionalConsentNotes: 'Zusätzliche Einwilligungshinweise',
        doctorSignature: 'Arzt-Unterschrift',
        date: 'Datum',
        patientSignatureQuestionnaire: 'Patientenunterschrift (aus Fragebogen)',
        patientSignaturePhysical: 'Patientenunterschrift (handschriftlich)',
        signature: 'Unterschrift',
      }
    };
    
    const t = translations[language] || translations.de;

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="preop-assessments.zip"');
    
    archive.pipe(res);

    for (const assessmentId of assessmentIds) {
      const assessment = await storage.getPreOpAssessmentById(assessmentId);
      if (!assessment) continue;

      const surgery = await storage.getSurgery(assessment.surgeryId);
      if (!surgery) continue;

      if (!hospitalIds.includes(surgery.hospitalId)) continue;

      const patient = await storage.getPatient(surgery.patientId);
      const hospital = await storage.getHospital(surgery.hospitalId);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let yPos = 20;

      const checkNewPage = (requiredSpace: number = 15) => {
        if (yPos > 280 - requiredSpace) {
          doc.addPage();
          yPos = 20;
        }
      };

      const renderIllnessSection = (title: string, illnesses: Record<string, boolean> | null | undefined, notes: string | null | undefined) => {
        if (!illnesses && !notes) return;
        const activeIllnesses = illnesses ? Object.entries(illnesses).filter(([_, v]) => v).map(([k]) => k) : [];
        if (activeIllnesses.length === 0 && !notes) return;
        
        checkNewPage(15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 25, yPos);
        yPos += 4;
        doc.setFont('helvetica', 'normal');
        
        if (activeIllnesses.length > 0) {
          const text = activeIllnesses.join(', ');
          const lines = doc.splitTextToSize(text, 160);
          lines.forEach((line: string) => {
            checkNewPage();
            doc.text(line, 25, yPos);
            yPos += 4;
          });
        }
        if (notes) {
          const noteLines = doc.splitTextToSize(`Notes: ${notes}`, 160);
          noteLines.forEach((line: string) => {
            checkNewPage();
            doc.text(line, 25, yPos);
            yPos += 4;
          });
        }
        yPos += 2;
      };

      const hospitalData = hospital as any;
      const hasLogo = hospitalData?.companyLogoUrl;
      
      if (hasLogo) {
        try {
          const response = await fetch(hospitalData.companyLogoUrl);
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/png';
          const dataUrl = `data:${mimeType};base64,${base64}`;
          doc.addImage(dataUrl, 'PNG', 20, yPos - 5, 25, 25);
        } catch (e) {
          logger.warn('Could not load hospital logo:', e);
        }
      }
      
      const headerStartX = hasLogo ? 50 : 20;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      if (hospital?.name) {
        doc.text(hospital.name, headerStartX, yPos);
        yPos += 5;
      }
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      if (hospitalData?.companyAddress) {
        doc.text(hospitalData.companyAddress, headerStartX, yPos);
        yPos += 4;
      }
      if (hospitalData?.companyPhone) {
        doc.text(hospitalData.companyPhone, headerStartX, yPos);
        yPos += 4;
      }
      
      yPos = hasLogo ? Math.max(yPos, 45) : yPos + 3;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(t.title, 105, yPos, { align: 'center' });
      yPos += 10;

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(20, yPos, 190, yPos);
      yPos += 8;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(t.patientInfo, 20, yPos);
      yPos += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const patientSurname = patient?.surname || '';
      const patientFirstName = patient?.firstName || '';
      const patientName = `${patientSurname}, ${patientFirstName}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Unknown';
      doc.text(`${t.name}: ${patientName}`, 20, yPos);
      yPos += 5;

      if (patient?.birthday) {
        const birthDate = new Date(patient.birthday);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        const formattedBirthday = birthDate.toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE');
        doc.text(`${t.birthday}: ${formattedBirthday} (${age} ${t.years})`, 20, yPos);
        yPos += 5;
      }

      if (patient?.sex) {
        const genderText = patient.sex === 'M' ? t.male : patient.sex === 'F' ? t.female : t.other;
        doc.text(`${t.gender}: ${genderText}`, 20, yPos);
        yPos += 5;
      }

      yPos += 5;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(t.surgeryInfo, 20, yPos);
      yPos += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      if (surgery.plannedSurgery) {
        const surgeryLines = doc.splitTextToSize(`${t.plannedSurgery}: ${surgery.plannedSurgery}`, 165);
        surgeryLines.forEach((line: string) => {
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
      if (surgery.surgeon) {
        doc.text(`${t.surgeon}: ${surgery.surgeon}`, 20, yPos);
        yPos += 5;
      }
      if (surgery.plannedDate) {
        const plannedDate = new Date(surgery.plannedDate).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE');
        doc.text(`${t.plannedDate}: ${plannedDate}`, 20, yPos);
        yPos += 5;
      }

      yPos += 5;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(t.preOpAssessment, 20, yPos);
      yPos += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      if (assessment.asa) {
        doc.text(`${t.asaClassification}: ${assessment.asa}`, 20, yPos);
        yPos += 5;
      }
      if (assessment.weight) {
        doc.text(`${t.weight}: ${assessment.weight} kg`, 20, yPos);
        yPos += 5;
      }
      if (assessment.height) {
        doc.text(`${t.height}: ${assessment.height} cm`, 20, yPos);
        yPos += 5;
      }

      const allergies: string[] = [];
      if (patient?.allergies && Array.isArray(patient.allergies)) {
        allergies.push(...patient.allergies.filter(a => a));
      }
      if (patient?.otherAllergies) {
        allergies.push(patient.otherAllergies);
      }
      if (allergies.length > 0) {
        const allergyText = `${t.allergies}: ${allergies.join(', ')}`;
        const allergyLines = doc.splitTextToSize(allergyText, 165);
        allergyLines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }

      if (assessment.cave) {
        const caveLines = doc.splitTextToSize(`${t.cave}: ${assessment.cave}`, 165);
        caveLines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }

      yPos += 3;
      checkNewPage(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(t.medications, 20, yPos);
      yPos += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      if (assessment.anticoagulationMeds && assessment.anticoagulationMeds.length > 0) {
        const meds = assessment.anticoagulationMeds.filter(m => m).join(', ');
        if (meds) {
          const lines = doc.splitTextToSize(`${t.anticoagulation}: ${meds}${assessment.anticoagulationMedsOther ? ', ' + assessment.anticoagulationMedsOther : ''}`, 165);
          lines.forEach((line: string) => {
            checkNewPage();
            doc.text(line, 20, yPos);
            yPos += 5;
          });
        }
      }

      if (assessment.generalMeds && assessment.generalMeds.length > 0) {
        const meds = assessment.generalMeds.filter(m => m).join(', ');
        if (meds) {
          const lines = doc.splitTextToSize(`${t.generalMeds}: ${meds}${assessment.generalMedsOther ? ', ' + assessment.generalMedsOther : ''}`, 165);
          lines.forEach((line: string) => {
            checkNewPage();
            doc.text(line, 20, yPos);
            yPos += 5;
          });
        }
      }

      if (assessment.medicationsNotes) {
        const lines = doc.splitTextToSize(`${t.medicationNotes}: ${assessment.medicationsNotes}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }

      yPos += 3;
      checkNewPage(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(t.medicalHistory, 20, yPos);
      yPos += 6;

      renderIllnessSection(`${t.heart}:`, assessment.heartIllnesses as Record<string, boolean> | null, assessment.heartNotes);
      renderIllnessSection(`${t.lungs}:`, assessment.lungIllnesses as Record<string, boolean> | null, assessment.lungNotes);
      renderIllnessSection(`${t.gi}:`, assessment.giIllnesses as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.kidney}:`, assessment.kidneyIllnesses as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.metabolic}:`, assessment.metabolicIllnesses as Record<string, boolean> | null, assessment.giKidneyMetabolicNotes);
      renderIllnessSection(`${t.neuro}:`, assessment.neuroIllnesses as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.psych}:`, assessment.psychIllnesses as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.skeletal}:`, assessment.skeletalIllnesses as Record<string, boolean> | null, assessment.neuroPsychSkeletalNotes);
      renderIllnessSection(`${t.coagulation}:`, assessment.coagulationIllnesses as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.infectious}:`, assessment.infectiousIllnesses as Record<string, boolean> | null, assessment.coagulationInfectiousNotes);
      renderIllnessSection(`${t.women}:`, assessment.womanIssues as Record<string, boolean> | null, assessment.womanNotes);
      renderIllnessSection(`${t.noxen}:`, assessment.noxen as Record<string, boolean> | null, assessment.noxenNotes);
      renderIllnessSection(`${t.pediatric}:`, assessment.childrenIssues as Record<string, boolean> | null, assessment.childrenNotes);

      yPos += 3;
      checkNewPage(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(t.anesthesiaSurgicalHistory, 20, yPos);
      yPos += 6;

      renderIllnessSection(`${t.anesthesiaHistoryIssues}:`, assessment.anesthesiaHistoryIssues as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.dentalIssues}:`, assessment.dentalIssues as Record<string, boolean> | null, null);
      renderIllnessSection(`${t.ponvTransfusion}:`, assessment.ponvTransfusionIssues as Record<string, boolean> | null, null);

      if (assessment.previousSurgeries) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(`${t.previousSurgeries}: ${assessment.previousSurgeries}`, 160);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 25, yPos);
          yPos += 4;
        });
        yPos += 2;
      }

      if (assessment.anesthesiaSurgicalHistoryNotes) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(`${t.notes}: ${assessment.anesthesiaSurgicalHistoryNotes}`, 160);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 25, yPos);
          yPos += 4;
        });
        yPos += 2;
      }

      const techniques = assessment.anesthesiaTechniques as { general?: boolean; generalOptions?: Record<string, boolean>; spinal?: boolean; epidural?: boolean; epiduralOptions?: Record<string, boolean>; regional?: boolean; regionalOptions?: Record<string, boolean>; sedation?: boolean; combined?: boolean } | null;
      if (techniques) {
        yPos += 3;
        checkNewPage(20);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(t.plannedAnesthesia, 20, yPos);
        yPos += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const plannedTypes: string[] = [];
        if (techniques.general) plannedTypes.push(t.generalAnesthesia);
        if (techniques.spinal) plannedTypes.push(t.spinal);
        if (techniques.epidural) plannedTypes.push(t.epidural);
        if (techniques.regional) plannedTypes.push(t.regional);
        if (techniques.sedation) plannedTypes.push(t.sedation);
        if (techniques.combined) plannedTypes.push(t.combined);

        if (plannedTypes.length > 0) {
          doc.text(`${t.techniques}: ${plannedTypes.join(', ')}`, 20, yPos);
          yPos += 5;
        }

        if (techniques.generalOptions) {
          const options = Object.entries(techniques.generalOptions).filter(([_, v]) => v).map(([k]) => k);
          if (options.length > 0) {
            doc.text(`${t.generalOptions}: ${options.join(', ')}`, 25, yPos);
            yPos += 5;
          }
        }

        if (techniques.epiduralOptions) {
          const options = Object.entries(techniques.epiduralOptions).filter(([_, v]) => v).map(([k]) => k);
          if (options.length > 0) {
            doc.text(`${t.epiduralOptions}: ${options.join(', ')}`, 25, yPos);
            yPos += 5;
          }
        }

        if (techniques.regionalOptions) {
          const options = Object.entries(techniques.regionalOptions).filter(([_, v]) => v).map(([k]) => k);
          if (options.length > 0) {
            doc.text(`${t.regionalOptions}: ${options.join(', ')}`, 25, yPos);
            yPos += 5;
          }
        }
      }

      if (assessment.postOpICU) {
        checkNewPage();
        doc.text(`${t.postOpICU}: ${t.yes}`, 20, yPos);
        yPos += 5;
      }

      if (assessment.anesthesiaOther) {
        const lines = doc.splitTextToSize(`${t.otherAnesthesiaNotes}: ${assessment.anesthesiaOther}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }

      if (assessment.specialNotes) {
        yPos += 3;
        checkNewPage(15);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(t.specialNotes, 20, yPos);
        yPos += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(assessment.specialNotes, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }

      if (techniques && (techniques.general || techniques.spinal || techniques.epidural || techniques.regional || techniques.sedation || techniques.combined)) {
        yPos += 8;
        checkNewPage(40);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(t.anesthesiaTechniqueInfo, 20, yPos);
        yPos += 8;
        doc.setFontSize(9);

        const renderTechniqueInfo = (title: string, description: string, risks: string) => {
          checkNewPage(25);
          doc.setFont('helvetica', 'bold');
          doc.text(title, 20, yPos);
          yPos += 4;
          doc.setFont('helvetica', 'normal');
          const descLines = doc.splitTextToSize(description, 165);
          descLines.forEach((line: string) => {
            checkNewPage();
            doc.text(line, 20, yPos);
            yPos += 3.5;
          });
          const riskLines = doc.splitTextToSize(risks, 165);
          riskLines.forEach((line: string) => {
            checkNewPage();
            doc.text(line, 20, yPos);
            yPos += 3.5;
          });
          yPos += 3;
        };

        if (techniques.general) {
          renderTechniqueInfo(t.techniqueGeneral, t.techniqueGeneralDesc, t.techniqueGeneralRisks);
        }
        if (techniques.spinal) {
          renderTechniqueInfo(t.techniqueSpinal, t.techniqueSpinalDesc, t.techniqueSpinalRisks);
        }
        if (techniques.epidural) {
          renderTechniqueInfo(t.techniqueEpidural, t.techniqueEpiduralDesc, t.techniqueEpiduralRisks);
        }
        if (techniques.regional) {
          renderTechniqueInfo(t.techniqueRegional, t.techniqueRegionalDesc, t.techniqueRegionalRisks);
        }
        if (techniques.sedation) {
          renderTechniqueInfo(t.techniqueSedation, t.techniqueSedationDesc, t.techniqueSedationRisks);
        }
        if (techniques.combined) {
          renderTechniqueInfo(t.techniqueCombined, t.techniqueCombinedDesc, t.techniqueCombinedRisks);
        }
      }

      yPos += 5;
      checkNewPage(25);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(t.fastingRequirements, 20, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`• ${t.fastingFood}`, 20, yPos);
      yPos += 4;
      doc.text(`• ${t.fastingLiquids}`, 20, yPos);
      yPos += 6;

      checkNewPage(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(t.ambulatorySupervision, 20, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const ambLines = doc.splitTextToSize(t.ambulatorySupervisionText, 165);
      ambLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 4;
      });

      yPos += 8;
      checkNewPage(30);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(t.informedConsent, 20, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const consentOptions: string[] = [];
      if (assessment.consentGiven) consentOptions.push(t.generalConsentGiven);
      if (assessment.consentAnalgosedation) consentOptions.push(t.analgosedation);
      if (assessment.consentRegional) consentOptions.push(t.regionalAnesthesia);
      if (assessment.consentInstallations) consentOptions.push(t.installations);
      if (assessment.consentICU) consentOptions.push(t.icuIntensiveCare);

      if (consentOptions.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text(`${t.consentFor}:`, 20, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        consentOptions.forEach(opt => {
          checkNewPage();
          doc.text(`• ${opt}`, 25, yPos);
          yPos += 5;
        });
        yPos += 3;
      }

      if (assessment.consentText) {
        checkNewPage(20);
        doc.setFont('helvetica', 'bold');
        doc.text(`${t.consentInfo}:`, 20, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const consentLines = doc.splitTextToSize(assessment.consentText, 165);
        consentLines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 4;
        });
        yPos += 5;
        doc.setFontSize(10);
      }

      if (assessment.consentNotes) {
        checkNewPage(15);
        doc.setFont('helvetica', 'bold');
        doc.text(`${t.additionalConsentNotes}:`, 20, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(assessment.consentNotes, 165);
        noteLines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
        yPos += 3;
      }

      if (assessment.consentDoctorSignature || assessment.consentDate) {
        checkNewPage(35);
        doc.setFont('helvetica', 'bold');
        doc.text(`${t.doctorSignature}:`, 20, yPos);
        yPos += 3;

        if (assessment.consentDate) {
          doc.setFont('helvetica', 'normal');
          doc.text(`${t.date}: ${assessment.consentDate}`, 20, yPos);
          yPos += 5;
        }

        if (assessment.consentDoctorSignature) {
          try {
            doc.addImage(assessment.consentDoctorSignature, 'PNG', 20, yPos, 50, 20);
            doc.setDrawColor(200, 200, 200);
            doc.rect(20, yPos, 50, 20);
          } catch (e) {
            doc.rect(20, yPos, 50, 20);
          }
          yPos += 25;
        } else {
          yPos += 5;
        }
      }

      if (assessment.patientSignature) {
        checkNewPage(30);
        doc.setFont('helvetica', 'bold');
        doc.text(`${t.patientSignatureQuestionnaire}:`, 20, yPos);
        yPos += 3;
        try {
          doc.addImage(assessment.patientSignature, 'PNG', 20, yPos, 50, 20);
          doc.setDrawColor(200, 200, 200);
          doc.rect(20, yPos, 50, 20);
        } catch (e) {
          doc.rect(20, yPos, 50, 20);
        }
        yPos += 25;
      }

      checkNewPage(40);
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${t.patientSignaturePhysical}:`, 20, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setDrawColor(0, 0, 0);
      doc.line(20, yPos + 15, 100, yPos + 15);
      doc.setFontSize(8);
      doc.text(t.signature, 20, yPos + 20);

      doc.line(120, yPos + 15, 180, yPos + 15);
      doc.text(t.date, 120, yPos + 20);

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      
      const dateStr = surgery.plannedDate 
        ? new Date(surgery.plannedDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const safeFullName = `${patientSurname}_${patientFirstName}`.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '_');
      const filename = `preop-${dateStr}-${safeFullName}.pdf`;

      archive.append(pdfBuffer, { name: filename });
    }

    await archive.finalize();
  } catch (error) {
    logger.error("Error exporting pre-op assessments:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to export pre-op assessments" });
    }
  }
});

router.get('/api/anesthesia/preop/:assessmentId/pdf', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { assessmentId } = req.params;
    const language = (req.query.language as string) || 'de';
    const userId = req.user.id;

    const assessment = await storage.getPreOpAssessmentById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ message: "Assessment not found" });
    }

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const patient = await storage.getPatient(surgery.patientId);
    const hospital = await storage.getHospital(surgery.hospitalId);

    const { jsPDF } = await import('jspdf');

    const translations: Record<string, Record<string, string>> = {
      en: {
        title: 'Pre-Op Assessment / Anesthesia Informed Consent',
        patientInfo: 'Patient Information',
        name: 'Name',
        birthday: 'Birthday',
        years: 'years',
        gender: 'Gender',
        male: 'Male',
        female: 'Female',
        other: 'Other',
        surgeryInfo: 'Surgery Information',
        plannedSurgery: 'Planned Surgery',
        surgeon: 'Surgeon',
        plannedDate: 'Planned Date',
        preOpAssessment: 'Pre-Op Assessment',
        asaClassification: 'ASA Classification',
        weight: 'Weight',
        height: 'Height',
        allergies: 'Allergies',
        cave: 'CAVE',
        medications: 'Medications',
        anticoagulation: 'Anticoagulation',
        generalMeds: 'General Meds',
        medicationNotes: 'Medication Notes',
        medicalHistory: 'Medical History',
        heart: 'Heart / Cardiovascular',
        lungs: 'Lungs / Respiratory',
        gi: 'Gastrointestinal',
        kidney: 'Kidney / Urological',
        metabolic: 'Metabolic / Endocrine',
        neuro: 'Neurological',
        psych: 'Psychiatric',
        skeletal: 'Musculoskeletal',
        coagulation: 'Coagulation Disorders',
        infectious: 'Infectious Diseases',
        women: "Women's Health",
        noxen: 'Substance Use (Noxen)',
        pediatric: 'Pediatric Issues',
        notes: 'Notes',
        anesthesiaSurgicalHistory: 'Anesthesia & Surgical History',
        anesthesiaHistoryIssues: 'Anesthesia History Issues',
        dentalIssues: 'Dental Issues',
        ponvTransfusion: 'PONV / Transfusion',
        previousSurgeries: 'Previous Surgeries',
        plannedAnesthesia: 'Planned Anesthesia',
        techniques: 'Techniques',
        generalAnesthesia: 'General Anesthesia',
        spinal: 'Spinal',
        epidural: 'Epidural',
        regional: 'Regional',
        sedation: 'Sedation',
        combined: 'Combined',
        generalOptions: 'General Options',
        epiduralOptions: 'Epidural Options',
        regionalOptions: 'Regional Options',
        postOpICU: 'Post-Op ICU',
        yes: 'Yes',
        otherAnesthesiaNotes: 'Other Anesthesia Notes',
        specialNotes: 'Special Notes',
        anesthesiaTechniqueInfo: 'Anesthesia Technique Information',
        techniqueGeneral: 'General Anesthesia',
        techniqueGeneralDesc: 'Complete loss of consciousness through intravenous and/or inhaled medications.',
        techniqueGeneralRisks: 'Possible adverse events: Nausea, vomiting, sore throat, dental damage, awareness during anesthesia (rare), allergic reactions, cardiovascular complications.',
        techniqueSpinal: 'Spinal Anesthesia',
        techniqueSpinalDesc: 'Injection of local anesthetic into the cerebrospinal fluid for lower body numbness.',
        techniqueSpinalRisks: 'Possible adverse events: Post-dural puncture headache, hypotension, urinary retention, back pain, nerve damage (rare).',
        techniqueEpidural: 'Epidural Anesthesia',
        techniqueEpiduralDesc: 'Injection of local anesthetic into the epidural space, often with catheter placement for continuous administration.',
        techniqueEpiduralRisks: 'Possible adverse events: Hypotension, headache (if dura punctured), back pain, incomplete block, epidural hematoma or abscess (rare).',
        techniqueRegional: 'Regional Anesthesia',
        techniqueRegionalDesc: 'Numbing of a specific region through local anesthetic injections (Spinal, Epidural, Nerve Blocks).',
        techniqueRegionalRisks: 'Possible adverse events: Headache, back pain, nerve damage (rare), hypotension, bleeding, infection at the injection site.',
        techniqueSedation: 'Sedation / Monitored Anesthesia Care',
        techniqueSedationDesc: 'Administration of sedative medications to reduce anxiety and provide comfort while maintaining consciousness.',
        techniqueSedationRisks: 'Possible adverse events: Respiratory depression, nausea, paradoxical reactions, delayed awakening, aspiration (if not fasting).',
        techniqueCombined: 'Combined Technique',
        techniqueCombinedDesc: 'Combination of general anesthesia with regional techniques for optimal pain control.',
        techniqueCombinedRisks: 'Risks associated with each individual technique apply. May provide enhanced pain relief with potentially reduced overall anesthetic requirements.',
        fastingRequirements: 'Pre-Operative Fasting Requirements',
        fastingFood: 'No solid food for 6 hours before surgery',
        fastingLiquids: 'No liquids for 2 hours before surgery (water only allowed until then)',
        ambulatorySupervision: 'Post-Anesthesia Care for Outpatients',
        ambulatorySupervisionText: 'For outpatient (ambulatory) procedures: The patient must be accompanied and supervised by a responsible adult for 24 hours after anesthesia.',
        informedConsent: 'Informed Consent',
        consentFor: 'Consent for',
        generalConsentGiven: 'General Consent Given',
        analgosedation: 'Analgosedation',
        regionalAnesthesia: 'Regional Anesthesia',
        installations: 'Installations (IV, Arterial, etc.)',
        icuIntensiveCare: 'ICU / Intensive Care',
        consentInfo: 'Consent Information',
        additionalConsentNotes: 'Additional Consent Notes',
        doctorSignature: 'Doctor Signature',
        date: 'Date',
        patientSignatureQuestionnaire: 'Patient Signature (from questionnaire)',
        patientSignaturePhysical: 'Patient Signature (physical)',
        signature: 'Signature',
      },
      de: {
        title: 'Präoperative Beurteilung / Anästhesie-Einwilligung',
        patientInfo: 'Patienteninformationen',
        name: 'Name',
        birthday: 'Geburtsdatum',
        years: 'Jahre',
        gender: 'Geschlecht',
        male: 'Männlich',
        female: 'Weiblich',
        other: 'Andere',
        surgeryInfo: 'Operationsinformationen',
        plannedSurgery: 'Geplante Operation',
        surgeon: 'Chirurg',
        plannedDate: 'Geplantes Datum',
        preOpAssessment: 'Präoperative Beurteilung',
        asaClassification: 'ASA-Klassifikation',
        weight: 'Gewicht',
        height: 'Größe',
        allergies: 'Allergien',
        cave: 'CAVE',
        medications: 'Medikamente',
        anticoagulation: 'Antikoagulation',
        generalMeds: 'Allgemeine Medikamente',
        medicationNotes: 'Medikamenten-Hinweise',
        medicalHistory: 'Anamnese',
        heart: 'Herz / Kreislauf',
        lungs: 'Lunge / Atmung',
        gi: 'Magen-Darm',
        kidney: 'Niere / Urologie',
        metabolic: 'Stoffwechsel / Endokrin',
        neuro: 'Neurologie',
        psych: 'Psychiatrie',
        skeletal: 'Bewegungsapparat',
        coagulation: 'Gerinnungsstörungen',
        infectious: 'Infektionskrankheiten',
        women: 'Frauengesundheit',
        noxen: 'Substanzgebrauch (Noxen)',
        pediatric: 'Pädiatrische Probleme',
        notes: 'Hinweise',
        anesthesiaSurgicalHistory: 'Anästhesie- & OP-Vorgeschichte',
        anesthesiaHistoryIssues: 'Anästhesie-Vorgeschichte',
        dentalIssues: 'Zahnprobleme',
        ponvTransfusion: 'PONV / Transfusion',
        previousSurgeries: 'Frühere Operationen',
        plannedAnesthesia: 'Geplante Anästhesie',
        techniques: 'Verfahren',
        generalAnesthesia: 'Allgemeinanästhesie',
        spinal: 'Spinal',
        epidural: 'Epidural',
        regional: 'Regional',
        sedation: 'Sedierung',
        combined: 'Kombiniert',
        generalOptions: 'Allgemein-Optionen',
        epiduralOptions: 'Epidural-Optionen',
        regionalOptions: 'Regional-Optionen',
        postOpICU: 'Post-OP Intensivstation',
        yes: 'Ja',
        otherAnesthesiaNotes: 'Weitere Anästhesie-Hinweise',
        specialNotes: 'Besondere Hinweise',
        anesthesiaTechniqueInfo: 'Informationen zu Anästhesieverfahren',
        techniqueGeneral: 'Allgemeinanästhesie',
        techniqueGeneralDesc: 'Vollständiger Bewusstseinsverlust durch intravenöse und/oder inhalierte Medikamente.',
        techniqueGeneralRisks: 'Mögliche unerwünschte Ereignisse: Übelkeit, Erbrechen, Halsschmerzen, Zahnschäden, Wachheit während der Anästhesie (selten), allergische Reaktionen, kardiovaskuläre Komplikationen.',
        techniqueSpinal: 'Spinalanästhesie',
        techniqueSpinalDesc: 'Injektion von Lokalanästhetikum in die Cerebrospinalflüssigkeit zur Betäubung des unteren Körperbereichs.',
        techniqueSpinalRisks: 'Mögliche unerwünschte Ereignisse: Postpunktioneller Kopfschmerz, Hypotonie, Harnverhalt, Rückenschmerzen, Nervenschäden (selten).',
        techniqueEpidural: 'Epiduralanästhesie',
        techniqueEpiduralDesc: 'Injektion von Lokalanästhetikum in den Epiduralraum, oft mit Katheteranlage für kontinuierliche Verabreichung.',
        techniqueEpiduralRisks: 'Mögliche unerwünschte Ereignisse: Hypotonie, Kopfschmerzen (bei Durapunktion), Rückenschmerzen, unvollständige Blockade, Epiduralhämatom oder -abszess (selten).',
        techniqueRegional: 'Regionalanästhesie',
        techniqueRegionalDesc: 'Betäubung einer bestimmten Region durch Lokalanästhetika-Injektionen (Spinal, Epidural, Nervenblockaden).',
        techniqueRegionalRisks: 'Mögliche unerwünschte Ereignisse: Kopfschmerzen, Rückenschmerzen, Nervenschäden (selten), Hypotonie, Blutung, Infektion an der Injektionsstelle.',
        techniqueSedation: 'Sedierung / Überwachte Anästhesiepflege',
        techniqueSedationDesc: 'Verabreichung von Beruhigungsmitteln zur Angstreduktion und Komfortsteigerung bei erhaltenem Bewusstsein.',
        techniqueSedationRisks: 'Mögliche unerwünschte Ereignisse: Atemdepression, Übelkeit, paradoxe Reaktionen, verzögertes Erwachen, Aspiration (bei fehlendem Nüchternsein).',
        techniqueCombined: 'Kombinierte Technik',
        techniqueCombinedDesc: 'Kombination von Allgemeinanästhesie mit Regionalverfahren für optimale Schmerzkontrolle.',
        techniqueCombinedRisks: 'Die Risiken der einzelnen Techniken gelten entsprechend. Kann eine verbesserte Schmerzlinderung bei potenziell reduziertem Gesamtanästhetikabedarf bieten.',
        fastingRequirements: 'Präoperative Nüchternheitsanforderungen',
        fastingFood: 'Keine feste Nahrung für 6 Stunden vor der Operation',
        fastingLiquids: 'Keine Flüssigkeiten für 2 Stunden vor der Operation (nur Wasser bis dahin erlaubt)',
        ambulatorySupervision: 'Postanästhetische Versorgung für ambulante Patienten',
        ambulatorySupervisionText: 'Für ambulante Eingriffe: Der Patient muss für 24 Stunden nach der Anästhesie von einer verantwortlichen erwachsenen Person begleitet und beaufsichtigt werden.',
        informedConsent: 'Einverständniserklärung',
        consentFor: 'Einwilligung für',
        generalConsentGiven: 'Allgemeine Einwilligung erteilt',
        analgosedation: 'Analgosedierung',
        regionalAnesthesia: 'Regionalanästhesie',
        installations: 'Installationen (IV, Arteriell, etc.)',
        icuIntensiveCare: 'Intensivstation',
        consentInfo: 'Aufklärungstext',
        additionalConsentNotes: 'Zusätzliche Einwilligungshinweise',
        doctorSignature: 'Arzt-Unterschrift',
        date: 'Datum',
        patientSignatureQuestionnaire: 'Patientenunterschrift (aus Fragebogen)',
        patientSignaturePhysical: 'Patientenunterschrift (handschriftlich)',
        signature: 'Unterschrift',
      }
    };
    
    const t = translations[language] || translations.de;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let yPos = 20;

    const checkNewPage = (requiredSpace: number = 15) => {
      if (yPos > 280 - requiredSpace) {
        doc.addPage();
        yPos = 20;
      }
    };

    const renderIllnessSection = (title: string, illnesses: Record<string, boolean> | null | undefined, notes: string | null | undefined) => {
      if (!illnesses && !notes) return;
      const activeIllnesses = illnesses ? Object.entries(illnesses).filter(([_, v]) => v).map(([k]) => k) : [];
      if (activeIllnesses.length === 0 && !notes) return;
      
      checkNewPage(15);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 25, yPos);
      yPos += 4;
      doc.setFont('helvetica', 'normal');
      
      if (activeIllnesses.length > 0) {
        const text = activeIllnesses.join(', ');
        const lines = doc.splitTextToSize(text, 160);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 25, yPos);
          yPos += 4;
        });
      }
      if (notes) {
        const noteLines = doc.splitTextToSize(`Notes: ${notes}`, 160);
        noteLines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 25, yPos);
          yPos += 4;
        });
      }
      yPos += 2;
    };

    const hospitalData = hospital as any;
    const hasLogo = hospitalData?.companyLogoUrl;
    
    if (hasLogo) {
      try {
        const response = await fetch(hospitalData.companyLogoUrl);
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        doc.addImage(dataUrl, 'PNG', 20, yPos - 5, 25, 25);
      } catch (e) {
        logger.warn('Could not load hospital logo:', e);
      }
    }
    
    const headerStartX = hasLogo ? 50 : 20;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    if (hospital?.name) {
      doc.text(hospital.name, headerStartX, yPos);
      yPos += 5;
    }
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (hospitalData?.companyAddress) {
      doc.text(hospitalData.companyAddress, headerStartX, yPos);
      yPos += 4;
    }
    if (hospitalData?.companyPhone) {
      doc.text(hospitalData.companyPhone, headerStartX, yPos);
      yPos += 4;
    }
    
    yPos = hasLogo ? Math.max(yPos, 45) : yPos + 3;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(t.title, 105, yPos, { align: 'center' });
    yPos += 10;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.patientInfo, 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const patientSurname = patient?.surname || '';
    const patientFirstName = patient?.firstName || '';
    const patientName = `${patientSurname}, ${patientFirstName}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Unknown';
    doc.text(`${t.name}: ${patientName}`, 20, yPos);
    yPos += 5;

    if (patient?.birthday) {
      const birthDate = new Date(patient.birthday);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      const formattedBirthday = birthDate.toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE');
      doc.text(`${t.birthday}: ${formattedBirthday} (${age} ${t.years})`, 20, yPos);
      yPos += 5;
    }

    if (patient?.sex) {
      const genderText = patient.sex === 'M' ? t.male : patient.sex === 'F' ? t.female : t.other;
      doc.text(`${t.gender}: ${genderText}`, 20, yPos);
      yPos += 5;
    }

    yPos += 5;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.surgeryInfo, 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (surgery.plannedSurgery) {
      const surgeryLines = doc.splitTextToSize(`${t.plannedSurgery}: ${surgery.plannedSurgery}`, 165);
      surgeryLines.forEach((line: string) => {
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }
    if (surgery.surgeon) {
      doc.text(`${t.surgeon}: ${surgery.surgeon}`, 20, yPos);
      yPos += 5;
    }
    if (surgery.plannedDate) {
      const plannedDate = new Date(surgery.plannedDate).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE');
      doc.text(`${t.plannedDate}: ${plannedDate}`, 20, yPos);
      yPos += 5;
    }

    yPos += 5;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.preOpAssessment, 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (assessment.asa) {
      doc.text(`${t.asaClassification}: ${assessment.asa}`, 20, yPos);
      yPos += 5;
    }
    if (assessment.weight) {
      doc.text(`${t.weight}: ${assessment.weight} kg`, 20, yPos);
      yPos += 5;
    }
    if (assessment.height) {
      doc.text(`${t.height}: ${assessment.height} cm`, 20, yPos);
      yPos += 5;
    }

    const allergies: string[] = [];
    if (patient?.allergies && Array.isArray(patient.allergies)) {
      allergies.push(...patient.allergies.filter(a => a));
    }
    if (patient?.otherAllergies) {
      allergies.push(patient.otherAllergies);
    }
    if (allergies.length > 0) {
      const allergyText = `${t.allergies}: ${allergies.join(', ')}`;
      const allergyLines = doc.splitTextToSize(allergyText, 165);
      allergyLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    if (assessment.cave) {
      const caveLines = doc.splitTextToSize(`${t.cave}: ${assessment.cave}`, 165);
      caveLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    yPos += 3;
    checkNewPage(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.medications, 20, yPos);
    yPos += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (assessment.anticoagulationMeds && assessment.anticoagulationMeds.length > 0) {
      const meds = assessment.anticoagulationMeds.filter(m => m).join(', ');
      if (meds) {
        const lines = doc.splitTextToSize(`${t.anticoagulation}: ${meds}${assessment.anticoagulationMedsOther ? ', ' + assessment.anticoagulationMedsOther : ''}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
    }

    if (assessment.generalMeds && assessment.generalMeds.length > 0) {
      const meds = assessment.generalMeds.filter(m => m).join(', ');
      if (meds) {
        const lines = doc.splitTextToSize(`${t.generalMeds}: ${meds}${assessment.generalMedsOther ? ', ' + assessment.generalMedsOther : ''}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
    }

    if (assessment.medicationsNotes) {
      const lines = doc.splitTextToSize(`${t.medicationNotes}: ${assessment.medicationsNotes}`, 165);
      lines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    yPos += 3;
    checkNewPage(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.medicalHistory, 20, yPos);
    yPos += 6;

    renderIllnessSection(`${t.heart}:`, assessment.heartIllnesses as Record<string, boolean> | null, assessment.heartNotes);
    renderIllnessSection(`${t.lungs}:`, assessment.lungIllnesses as Record<string, boolean> | null, assessment.lungNotes);
    renderIllnessSection(`${t.gi}:`, assessment.giIllnesses as Record<string, boolean> | null, null);
    renderIllnessSection(`${t.kidney}:`, assessment.kidneyIllnesses as Record<string, boolean> | null, null);
    renderIllnessSection(`${t.metabolic}:`, assessment.metabolicIllnesses as Record<string, boolean> | null, assessment.giKidneyMetabolicNotes);
    renderIllnessSection(`${t.neuro}:`, assessment.neuroIllnesses as Record<string, boolean> | null, null);
    renderIllnessSection(`${t.psych}:`, assessment.psychIllnesses as Record<string, boolean> | null, assessment.neuroPsychNotes);
    renderIllnessSection(`${t.skeletal}:`, assessment.skeletalIllnesses as Record<string, boolean> | null, assessment.skeletalNotes);
    renderIllnessSection(`${t.coagulation}:`, assessment.coagulationIllnesses as Record<string, boolean> | null, null);
    renderIllnessSection(`${t.infectious}:`, assessment.infectiousIllnesses as Record<string, boolean> | null, assessment.coagulationInfectiousNotes);
    renderIllnessSection(`${t.women}:`, assessment.womenIllnesses as Record<string, boolean> | null, assessment.womenNotes);
    renderIllnessSection(`${t.noxen}:`, assessment.noxenIllnesses as Record<string, boolean> | null, assessment.noxenNotes);
    renderIllnessSection(`${t.pediatric}:`, assessment.pediatricIllnesses as Record<string, boolean> | null, assessment.pediatricNotes);

    yPos += 3;
    checkNewPage(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.anesthesiaSurgicalHistory, 20, yPos);
    yPos += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    if (assessment.anesthesiaHistory && assessment.anesthesiaHistory.length > 0) {
      const items = assessment.anesthesiaHistory.filter(h => h).join(', ');
      if (items) {
        const lines = doc.splitTextToSize(`${t.anesthesiaHistoryIssues}: ${items}${assessment.anesthesiaHistoryOther ? ', ' + assessment.anesthesiaHistoryOther : ''}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
    }

    if (assessment.dentalIssues && assessment.dentalIssues.length > 0) {
      const items = assessment.dentalIssues.filter(d => d).join(', ');
      if (items) {
        const lines = doc.splitTextToSize(`${t.dentalIssues}: ${items}${assessment.dentalIssuesOther ? ', ' + assessment.dentalIssuesOther : ''}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
    }

    if (assessment.ponvTransfusion && assessment.ponvTransfusion.length > 0) {
      const items = assessment.ponvTransfusion.filter(p => p).join(', ');
      if (items) {
        const lines = doc.splitTextToSize(`${t.ponvTransfusion}: ${items}${assessment.ponvTransfusionOther ? ', ' + assessment.ponvTransfusionOther : ''}`, 165);
        lines.forEach((line: string) => {
          checkNewPage();
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
    }

    if (assessment.previousSurgeries) {
      const lines = doc.splitTextToSize(`${t.previousSurgeries}: ${assessment.previousSurgeries}`, 165);
      lines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    yPos += 3;
    checkNewPage(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.plannedAnesthesia, 20, yPos);
    yPos += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const techniques: string[] = [];
    if (assessment.anesthesiaTechniques) {
      const techMap: Record<string, string> = {
        general: t.generalAnesthesia,
        spinal: t.spinal,
        epidural: t.epidural,
        regional: t.regional,
        sedation: t.sedation,
        combined: t.combined,
      };
      for (const [key, val] of Object.entries(assessment.anesthesiaTechniques)) {
        if (val && techMap[key]) {
          techniques.push(techMap[key]);
        }
      }
    }
    if (techniques.length > 0) {
      doc.text(`${t.techniques}: ${techniques.join(', ')}`, 20, yPos);
      yPos += 5;
    }

    if (assessment.generalOptions && assessment.generalOptions.length > 0) {
      const opts = assessment.generalOptions.filter(o => o).join(', ');
      if (opts) {
        doc.text(`${t.generalOptions}: ${opts}`, 20, yPos);
        yPos += 5;
      }
    }

    if (assessment.epiduralOptions && assessment.epiduralOptions.length > 0) {
      const opts = assessment.epiduralOptions.filter(o => o).join(', ');
      if (opts) {
        doc.text(`${t.epiduralOptions}: ${opts}`, 20, yPos);
        yPos += 5;
      }
    }

    if (assessment.regionalOptions && assessment.regionalOptions.length > 0) {
      const opts = assessment.regionalOptions.filter(o => o).join(', ');
      if (opts) {
        doc.text(`${t.regionalOptions}: ${opts}`, 20, yPos);
        yPos += 5;
      }
    }

    if (assessment.postOpIcu) {
      doc.text(`${t.postOpICU}: ${t.yes}`, 20, yPos);
      yPos += 5;
    }

    if (assessment.otherAnesthesiaNotes) {
      const lines = doc.splitTextToSize(`${t.otherAnesthesiaNotes}: ${assessment.otherAnesthesiaNotes}`, 165);
      lines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    if (assessment.specialNotes) {
      yPos += 3;
      checkNewPage(15);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(t.specialNotes, 20, yPos);
      yPos += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(assessment.specialNotes, 165);
      lines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    yPos += 5;
    checkNewPage(40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.anesthesiaTechniqueInfo, 20, yPos);
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const renderTechniqueInfo = (title: string, desc: string, risks: string) => {
      checkNewPage(25);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 25, yPos);
      yPos += 4;
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(desc, 155);
      descLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 30, yPos);
        yPos += 4;
      });
      const riskLines = doc.splitTextToSize(risks, 155);
      riskLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 30, yPos);
        yPos += 4;
      });
      yPos += 2;
    };

    if (assessment.anesthesiaTechniques) {
      const techData = assessment.anesthesiaTechniques as Record<string, boolean>;
      if (techData.general) {
        renderTechniqueInfo(t.techniqueGeneral, t.techniqueGeneralDesc, t.techniqueGeneralRisks);
      }
      if (techData.spinal) {
        renderTechniqueInfo(t.techniqueSpinal, t.techniqueSpinalDesc, t.techniqueSpinalRisks);
      }
      if (techData.epidural) {
        renderTechniqueInfo(t.techniqueEpidural, t.techniqueEpiduralDesc, t.techniqueEpiduralRisks);
      }
      if (techData.regional) {
        renderTechniqueInfo(t.techniqueRegional, t.techniqueRegionalDesc, t.techniqueRegionalRisks);
      }
      if (techData.sedation) {
        renderTechniqueInfo(t.techniqueSedation, t.techniqueSedationDesc, t.techniqueSedationRisks);
      }
      if (techData.combined) {
        renderTechniqueInfo(t.techniqueCombined, t.techniqueCombinedDesc, t.techniqueCombinedRisks);
      }
    }

    yPos += 3;
    checkNewPage(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.fastingRequirements, 20, yPos);
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`• ${t.fastingFood}`, 25, yPos);
    yPos += 4;
    doc.text(`• ${t.fastingLiquids}`, 25, yPos);
    yPos += 6;

    checkNewPage(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(t.ambulatorySupervision, 20, yPos);
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const ambLines = doc.splitTextToSize(t.ambulatorySupervisionText, 165);
    ambLines.forEach((line: string) => {
      checkNewPage();
      doc.text(line, 20, yPos);
      yPos += 4;
    });

    yPos += 5;
    checkNewPage(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.informedConsent, 20, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const consentItems: string[] = [];
    if (assessment.consentGeneral) consentItems.push(t.generalConsentGiven);
    if (assessment.consentAnalgosedation) consentItems.push(t.analgosedation);
    if (assessment.consentRegional) consentItems.push(t.regionalAnesthesia);
    if (assessment.consentInstallations) consentItems.push(t.installations);
    if (assessment.consentIcu) consentItems.push(t.icuIntensiveCare);

    if (consentItems.length > 0) {
      doc.text(`${t.consentFor}: ${consentItems.join(', ')}`, 20, yPos);
      yPos += 6;
    }

    if (assessment.consentInfo) {
      const consentLines = doc.splitTextToSize(`${t.consentInfo}: ${assessment.consentInfo}`, 165);
      consentLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    if (assessment.additionalConsentNotes) {
      const noteLines = doc.splitTextToSize(`${t.additionalConsentNotes}: ${assessment.additionalConsentNotes}`, 165);
      noteLines.forEach((line: string) => {
        checkNewPage();
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    yPos += 5;
    checkNewPage(30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(t.doctorSignature, 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');

    if (assessment.doctorSignature) {
      try {
        doc.addImage(assessment.doctorSignature, 'PNG', 20, yPos, 60, 20);
        yPos += 22;
      } catch {
        yPos += 5;
      }
    } else {
      doc.setDrawColor(0, 0, 0);
      doc.line(20, yPos + 15, 100, yPos + 15);
      doc.setFontSize(8);
      doc.text(t.signature, 20, yPos + 20);
      yPos += 25;
    }

    if (assessment.patientSignature) {
      checkNewPage(30);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(t.patientSignatureQuestionnaire, 20, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      try {
        doc.addImage(assessment.patientSignature, 'PNG', 20, yPos, 60, 20);
        yPos += 22;
      } catch {
        yPos += 5;
      }
    }

    yPos += 5;
    checkNewPage(30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(t.patientSignaturePhysical, 20, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(0, 0, 0);
    doc.line(20, yPos + 15, 100, yPos + 15);
    doc.setFontSize(8);
    doc.text(t.signature, 20, yPos + 20);

    doc.line(120, yPos + 15, 180, yPos + 15);
    doc.text(t.date, 120, yPos + 20);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    
    const dateStr = surgery.plannedDate 
      ? new Date(surgery.plannedDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const safeFullName = `${patientSurname}_${patientFirstName}`.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '_');
    const filename = `preop-${dateStr}-${safeFullName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error("Error downloading pre-op PDF:", error);
    res.status(500).json({ message: "Failed to download pre-op PDF" });
  }
});

router.post('/api/anesthesia/preop/:assessmentId/send-email', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { assessmentId } = req.params;
    const userId = req.user.id;

    logger.info("[Email] Starting email send for assessment:", assessmentId);

    const assessment = await storage.getPreOpAssessmentById(assessmentId);
    if (!assessment) {
      logger.info("[Email] Assessment not found:", assessmentId);
      return res.status(404).json({ message: "Assessment not found" });
    }

    logger.info("[Email] Assessment found, emailForCopy:", assessment.emailForCopy, "emailLanguage:", assessment.emailLanguage);

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const recipientEmail = assessment.emailForCopy;
    if (!recipientEmail) {
      return res.status(400).json({ message: "No email address specified for this assessment" });
    }
    
    const language = (assessment.emailLanguage as 'en' | 'de') || 'de';
    const patient = await storage.getPatient(surgery.patientId);
    const hospital = await storage.getHospital(surgery.hospitalId);
    
    const { jsPDF } = await import('jspdf');
    
    const translations: Record<string, Record<string, string>> = {
      en: {
        title: 'Pre-Operative Assessment',
        patientInfo: 'Patient Information',
        name: 'Name',
        birthday: 'Date of Birth',
        gender: 'Gender',
        male: 'Male',
        female: 'Female',
        other: 'Other',
        years: 'years',
        surgeryInfo: 'Surgery Information',
        plannedSurgery: 'Planned Surgery',
        surgeon: 'Surgeon',
        plannedDate: 'Planned Date',
        preOpAssessment: 'Pre-Operative Assessment',
        asaClassification: 'ASA Classification',
        weight: 'Weight',
        height: 'Height',
        allergies: 'Allergies',
        cave: 'CAVE',
        medications: 'Medications',
        anticoagulation: 'Anticoagulation Medications',
        generalMeds: 'General Medications',
        medicationNotes: 'Medication Notes',
        medicalHistory: 'Medical History',
        heart: 'Heart & Circulation',
        lungs: 'Lungs',
        gi: 'Gastrointestinal',
        kidney: 'Kidney',
        metabolic: 'Metabolic',
        neuro: 'Neurological',
        psych: 'Psychological',
        skeletal: 'Skeletal/Muscular',
        coagulation: 'Coagulation',
        infectious: 'Infectious',
        women: 'Women\'s Health',
        noxen: 'Smoking/Alcohol/Drugs',
        pediatric: 'Pediatric Issues',
        notes: 'Notes',
        anesthesiaSurgicalHistory: 'Anesthesia & Surgical History',
        anesthesiaHistoryIssues: 'Anesthesia History Issues',
        dentalIssues: 'Dental Issues',
        ponvTransfusion: 'PONV / Transfusion',
        previousSurgeries: 'Previous Surgeries',
        plannedAnesthesia: 'Planned Anesthesia',
        techniques: 'Techniques',
        emailSubject: 'Your Pre-Operative Assessment',
        emailBody: 'Please find attached your pre-operative assessment document.',
      },
      de: {
        title: 'Präoperative Beurteilung',
        patientInfo: 'Patienteninformation',
        name: 'Name',
        birthday: 'Geburtsdatum',
        gender: 'Geschlecht',
        male: 'Männlich',
        female: 'Weiblich',
        other: 'Andere',
        years: 'Jahre',
        surgeryInfo: 'Operationsinformation',
        plannedSurgery: 'Geplante Operation',
        surgeon: 'Chirurg',
        plannedDate: 'Geplantes Datum',
        preOpAssessment: 'Präoperative Beurteilung',
        asaClassification: 'ASA-Klassifikation',
        weight: 'Gewicht',
        height: 'Größe',
        allergies: 'Allergien',
        cave: 'CAVE',
        medications: 'Medikamente',
        anticoagulation: 'Antikoagulation',
        generalMeds: 'Allgemeine Medikamente',
        medicationNotes: 'Medikationshinweise',
        medicalHistory: 'Krankengeschichte',
        heart: 'Herz & Kreislauf',
        lungs: 'Lunge',
        gi: 'Magen-Darm',
        kidney: 'Niere',
        metabolic: 'Stoffwechsel',
        neuro: 'Neurologie',
        psych: 'Psychologie',
        skeletal: 'Skelett/Muskel',
        coagulation: 'Gerinnung',
        infectious: 'Infektiös',
        women: 'Frauengesundheit',
        noxen: 'Rauchen/Alkohol/Drogen',
        pediatric: 'Pädiatrische Probleme',
        notes: 'Hinweise',
        anesthesiaSurgicalHistory: 'Anästhesie- & OP-Vorgeschichte',
        anesthesiaHistoryIssues: 'Anästhesie-Vorgeschichte',
        dentalIssues: 'Zahnprobleme',
        ponvTransfusion: 'PONV / Transfusion',
        previousSurgeries: 'Frühere Operationen',
        plannedAnesthesia: 'Geplante Anästhesie',
        techniques: 'Verfahren',
        emailSubject: 'Ihre präoperative Beurteilung',
        emailBody: 'Im Anhang finden Sie Ihr präoperatives Beurteilungsdokument.',
      }
    };
    
    const t = translations[language] || translations.de;
    
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let yPos = 20;
    
    const checkNewPage = (requiredSpace: number = 15) => {
      if (yPos > 280 - requiredSpace) {
        doc.addPage();
        yPos = 20;
      }
    };
    
    const hospitalData = hospital as any;
    const hasLogo = hospitalData?.companyLogoUrl;
    
    if (hasLogo) {
      try {
        const response = await fetch(hospitalData.companyLogoUrl);
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        doc.addImage(dataUrl, 'PNG', 20, yPos - 5, 25, 25);
      } catch (e) {
        logger.warn('Could not load hospital logo:', e);
      }
    }
    
    const headerStartX = hasLogo ? 50 : 20;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    if (hospital?.name) {
      doc.text(hospital.name, headerStartX, yPos);
      yPos += 5;
    }
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (hospitalData?.companyAddress) {
      doc.text(hospitalData.companyAddress, headerStartX, yPos);
      yPos += 4;
    }
    if (hospitalData?.companyPhone) {
      doc.text(hospitalData.companyPhone, headerStartX, yPos);
      yPos += 4;
    }
    
    yPos = hasLogo ? Math.max(yPos, 45) : yPos + 3;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(t.title, 105, yPos, { align: 'center' });
    yPos += 10;
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.patientInfo, 20, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const patientSurname = patient?.surname || '';
    const patientFirstName = patient?.firstName || '';
    const patientName = `${patientSurname}, ${patientFirstName}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Unknown';
    doc.text(`${t.name}: ${patientName}`, 20, yPos);
    yPos += 5;
    
    if (patient?.birthday) {
      const birthDate = new Date(patient.birthday);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      const formattedBirthday = birthDate.toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE');
      doc.text(`${t.birthday}: ${formattedBirthday} (${age} ${t.years})`, 20, yPos);
      yPos += 5;
    }
    
    if (patient?.sex) {
      const genderText = patient.sex === 'M' ? t.male : patient.sex === 'F' ? t.female : t.other;
      doc.text(`${t.gender}: ${genderText}`, 20, yPos);
      yPos += 5;
    }
    
    yPos += 5;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.surgeryInfo, 20, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (surgery.plannedSurgery) {
      const surgeryLines = doc.splitTextToSize(`${t.plannedSurgery}: ${surgery.plannedSurgery}`, 165);
      surgeryLines.forEach((line: string) => {
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }
    if (surgery.surgeon) {
      doc.text(`${t.surgeon}: ${surgery.surgeon}`, 20, yPos);
      yPos += 5;
    }
    if (surgery.plannedDate) {
      const plannedDate = new Date(surgery.plannedDate).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE');
      doc.text(`${t.plannedDate}: ${plannedDate}`, 20, yPos);
      yPos += 5;
    }
    
    yPos += 5;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t.preOpAssessment, 20, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (assessment.asa) {
      doc.text(`${t.asaClassification}: ${assessment.asa}`, 20, yPos);
      yPos += 5;
    }
    if (assessment.weight) {
      doc.text(`${t.weight}: ${assessment.weight} kg`, 20, yPos);
      yPos += 5;
    }
    if (assessment.height) {
      doc.text(`${t.height}: ${assessment.height} cm`, 20, yPos);
      yPos += 5;
    }
    
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    
    const dateStr = surgery.plannedDate 
      ? new Date(surgery.plannedDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const safeFullName = `${patientSurname}_${patientFirstName}`.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '_');
    const filename = `preop-${dateStr}-${safeFullName}.pdf`;
    
    logger.info("[Email] PDF size:", pdfBuffer.length, "bytes");
    
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@viali.app',
      to: recipientEmail,
      subject: `${t.emailSubject} - ${hospital?.name || 'Hospital'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${t.title}</h2>
          <p>${t.emailBody}</p>
          <p style="color: #666; font-size: 14px;">
            ${patientName}<br/>
            ${surgery.plannedSurgery || ''}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">
            ${hospital?.name || ''}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: filename,
          content: pdfBuffer,
        }
      ]
    });
    
    logger.info("[Email] Email sent successfully:", emailResult);
    
    await storage.updatePreOpAssessment(assessmentId, {
      emailSentAt: new Date()
    });
    
    res.json({ 
      success: true, 
      message: language === 'en' ? 'Email sent successfully' : 'E-Mail erfolgreich gesendet',
      sentTo: recipientEmail
    });
  } catch (error: any) {
    logger.error("Error sending pre-op email:", {
      message: error.message,
      name: error.name,
      statusCode: error.statusCode,
      response: error.response,
      stack: error.stack
    });
    
    let userMessage = "Failed to send email";
    if (error.message?.includes("API key")) {
      userMessage = "Email service not configured correctly";
    } else if (error.message?.includes("domain")) {
      userMessage = "Email domain not verified";
    } else if (error.message?.includes("rate limit")) {
      userMessage = "Too many emails sent, please try again later";
    } else if (error.statusCode === 422) {
      userMessage = "Invalid email address or attachment";
    }
    
    res.status(500).json({ 
      message: userMessage, 
      error: error.message 
    });
  }
});

router.post('/api/anesthesia/preop/:id/send-consent-invitation', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { method } = req.body as { method?: 'sms' | 'email' };

    const hospitalId = req.resolvedHospitalId as string;

    const assessment = await storage.getPreOpAssessmentById(id);
    if (!assessment) {
      return res.status(404).json({ message: "Pre-op assessment not found" });
    }

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    if (surgery.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const patient = await storage.getPatient(surgery.patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const existingLinks = await storage.getQuestionnaireLinksForPatient(patient.id);
    const now = new Date();
    let activeLink = existingLinks.find(l =>
      l.hospitalId === hospitalId &&
      l.status !== 'expired' &&
      l.expiresAt && new Date(l.expiresAt) > now
    );

    if (!activeLink) {
      const token = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      activeLink = await storage.createQuestionnaireLink({
        token,
        hospitalId,
        patientId: patient.id,
        surgeryId: surgery.id,
        createdBy: userId,
        expiresAt,
        status: 'pending',
        language: 'de',
      });
    }

    const baseUrl = process.env.PRODUCTION_URL || 'http://localhost:5000';
    const portalUrl = `${baseUrl}/patient/${activeLink.token}`;

    const hospital = await storage.getHospital(hospitalId);
    const hospitalName = hospital?.name || 'Hospital';

    let sentMethod: 'sms' | 'email' | null = null;
    let sentRecipient = '';
    let sentMessageContent = '';

    if (method === 'sms' || (!method && patient.phone)) {
      if (patient.phone && await isSmsConfiguredForHospital(hospitalId)) {
        const message = `${hospitalName}: Sie können Ihre Einwilligungserklärung online unterschreiben / You can sign the informed consent online:\n${portalUrl}`;
        const smsResult = await sendSms(patient.phone, message, hospitalId);
        if (smsResult.success) {
          sentMethod = 'sms';
          sentRecipient = patient.phone;
          sentMessageContent = message;
        }
      }
    }

    if (!sentMethod && (method === 'email' || !method)) {
      if (patient.email) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const emailSubject = `${hospitalName}: Einwilligungserklärung online unterschreiben / Sign informed consent online`;
          const emailResult = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@viali.app',
            to: patient.email,
            subject: emailSubject,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>${hospitalName}</h2>
                <p>Sie können Ihre Einwilligungserklärung online unterschreiben.<br/>You can sign the informed consent online.</p>
                <a href="${portalUrl}" 
                   style="display: inline-block; background: #2563eb; color: white; 
                          padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                          font-weight: 500; margin: 16px 0;">
                  Einwilligung unterschreiben / Sign consent
                </a>
                <p style="color: #999; font-size: 12px;">
                  ${portalUrl}
                </p>
              </div>
            `,
          });
          if (emailResult.data) {
            sentMethod = 'email';
            sentRecipient = patient.email;
            sentMessageContent = `${emailSubject}\n\nSie können Ihre Einwilligungserklärung online unterschreiben. / You can sign the informed consent online.\n${portalUrl}`;
          }
        } catch (emailError) {
          logger.error("Error sending consent invitation email:", emailError);
        }
      }
    }

    if (!sentMethod) {
      return res.status(400).json({ message: "Could not send invitation. Patient has no valid phone number or email, or messaging services are not configured." });
    }

    await storage.updatePreOpAssessment(id, {
      consentInvitationSentAt: new Date(),
      consentInvitationMethod: sentMethod,
    });

    try {
      await storage.createPatientMessage({
        hospitalId,
        patientId: patient.id,
        sentBy: userId,
        channel: sentMethod,
        recipient: sentRecipient,
        message: sentMessageContent,
        status: 'sent',
        isAutomatic: true,
        messageType: 'auto_consent_invitation',
      });
    } catch (msgErr) {
      logger.error("Error saving consent invitation to communication history:", msgErr);
    }

    res.json({
      success: true,
      method: sentMethod,
      portalUrl,
    });
  } catch (error) {
    logger.error("Error sending consent invitation:", error);
    res.status(500).json({ message: "Failed to send consent invitation" });
  }
});

router.post('/api/anesthesia/preop/:id/send-callback-appointment', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { appointmentSlots, phoneNumber, method } = req.body as {
      appointmentSlots: Array<{ date: string; fromTime: string; toTime: string }>;
      phoneNumber: string;
      method?: 'sms' | 'email';
    };

    if (!appointmentSlots || appointmentSlots.length === 0) {
      return res.status(400).json({ message: "At least one appointment slot is required" });
    }

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const hospitalId = req.resolvedHospitalId as string;

    const assessment = await storage.getPreOpAssessmentById(id);
    if (!assessment) {
      return res.status(404).json({ message: "Pre-op assessment not found" });
    }

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    if (surgery.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const patient = await storage.getPatient(surgery.patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const existingLinks = await storage.getQuestionnaireLinksForPatient(patient.id);
    const now = new Date();
    let activeLink = existingLinks.find(l =>
      l.hospitalId === hospitalId &&
      l.status !== 'expired' &&
      l.expiresAt && new Date(l.expiresAt) > now
    );

    if (!activeLink) {
      const token = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      activeLink = await storage.createQuestionnaireLink({
        token,
        hospitalId,
        patientId: patient.id,
        surgeryId: surgery.id,
        createdBy: userId,
        expiresAt,
        status: 'pending',
        language: 'de',
      });
    }

    const baseUrl = process.env.PRODUCTION_URL || 'http://localhost:5000';
    const portalUrl = `${baseUrl}/patient/${activeLink.token}`;

    const hospital = await storage.getHospital(hospitalId);
    const hospitalName = hospital?.name || 'Hospital';

    const dayNames: Record<string, { de: string; en: string }> = {
      '0': { de: 'Sonntag', en: 'Sunday' },
      '1': { de: 'Montag', en: 'Monday' },
      '2': { de: 'Dienstag', en: 'Tuesday' },
      '3': { de: 'Mittwoch', en: 'Wednesday' },
      '4': { de: 'Donnerstag', en: 'Thursday' },
      '5': { de: 'Freitag', en: 'Friday' },
      '6': { de: 'Samstag', en: 'Saturday' },
    };

    const formatSlot = (slot: { date: string; fromTime: string; toTime: string }, lang: 'de' | 'en') => {
      const d = new Date(slot.date);
      const dayOfWeek = dayNames[d.getDay().toString()] || { de: '', en: '' };
      const dateStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      return `${dayOfWeek[lang]} ${dateStr}, ${slot.fromTime} - ${slot.toTime}`;
    };

    const slotsTextDe = appointmentSlots.map(s => `- ${formatSlot(s, 'de')}`).join('\n');
    const slotsTextEn = appointmentSlots.map(s => `- ${formatSlot(s, 'en')}`).join('\n');

    let sentMethod: 'sms' | 'email' | null = null;
    let sentRecipient = '';
    let sentMessageContent = '';

    if (method === 'sms' || (!method && patient.phone)) {
      if (patient.phone && await isSmsConfiguredForHospital(hospitalId)) {
        const message = `${hospitalName}: Bitte rufen Sie uns an für ein Aufklärungsgespräch / Please call us for a consent talk.\n\nTel: ${phoneNumber}\n\n${slotsTextDe}\n\nPatientenportal / Patient Portal:\n${portalUrl}`;
        const smsResult = await sendSms(patient.phone, message, hospitalId);
        if (smsResult.success) {
          sentMethod = 'sms';
          sentRecipient = patient.phone;
          sentMessageContent = message;
        }
      }
    }

    if (!sentMethod && (method === 'email' || !method)) {
      if (patient.email) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const emailSubject = `${hospitalName}: Termin für Aufklärungsgespräch / Consent talk appointment`;
          const slotsHtml = appointmentSlots.map(s => 
            `<li style="margin: 4px 0;">${formatSlot(s, 'de')} / ${formatSlot(s, 'en')}</li>`
          ).join('');
          const emailResult = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@viali.app',
            to: patient.email,
            subject: emailSubject,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>${hospitalName}</h2>
                <p>Bitte rufen Sie uns für ein Aufklärungsgespräch an.<br/>Please call us for a consent talk.</p>
                <p style="font-size: 18px; font-weight: bold;">
                  <a href="tel:${phoneNumber}" style="color: #2563eb; text-decoration: none;">📞 ${phoneNumber}</a>
                </p>
                <p><strong>Termine / Appointments:</strong></p>
                <ul style="list-style: none; padding: 0;">${slotsHtml}</ul>
                <a href="${portalUrl}" 
                   style="display: inline-block; background: #2563eb; color: white; 
                          padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                          font-weight: 500; margin: 16px 0;">
                  Patientenportal öffnen / Open Patient Portal
                </a>
                <p style="color: #999; font-size: 12px;">
                  ${portalUrl}
                </p>
              </div>
            `,
          });
          if (emailResult.data) {
            sentMethod = 'email';
            sentRecipient = patient.email;
            sentMessageContent = `${emailSubject}\n\nTel: ${phoneNumber}\n\n${slotsTextDe}\n\n${portalUrl}`;
          }
        } catch (emailError) {
          logger.error("Error sending callback appointment email:", emailError);
        }
      }
    }

    if (!sentMethod) {
      return res.status(400).json({ message: "Could not send invitation. Patient has no valid phone number or email, or messaging services are not configured." });
    }

    await storage.updatePreOpAssessment(id, {
      callbackAppointmentSlots: appointmentSlots,
      callbackPhoneNumber: phoneNumber,
      callbackInvitationSentAt: new Date(),
      callbackInvitationMethod: sentMethod,
    });

    try {
      await storage.createPatientMessage({
        hospitalId,
        patientId: patient.id,
        sentBy: userId,
        channel: sentMethod,
        recipient: sentRecipient,
        message: sentMessageContent,
        status: 'sent',
        isAutomatic: true,
        messageType: 'auto_callback_appointment',
      });
    } catch (msgErr) {
      logger.error("Error saving callback appointment to communication history:", msgErr);
    }

    res.json({
      success: true,
      method: sentMethod,
      portalUrl,
    });
  } catch (error) {
    logger.error("Error sending callback appointment:", error);
    res.status(500).json({ message: "Failed to send callback appointment" });
  }
});

export default router;
