import jsPDF from 'jspdf';

export type PatientDocumentModel = {
  patient: any;
  consultations: any[];
  factures: any[];
};

export type ConsultationDocumentModel = {
  consultation: any;
  prescriptions: any[];
};

export type PaymentReceiptModel = {
  facture: any;
  payment?: any;
  paiements?: any[];
  printedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  printedAt?: string | Date;
};

export type AdmissionDocumentModel = {
  hospitalisation: any;
  printedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  printedAt?: string | Date;
};

export type LaboratoryDocumentModel = {
  analyse: any;
  printedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  printedAt?: string | Date;
};

export type AppointmentDocumentModel = {
  rendezVous: any;
  printedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  printedAt?: string | Date;
};

export type PrescriptionDocumentModel = {
  consultation: any;
  prescriptions: any[];
  printedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  printedAt?: string | Date;
};

export type FullInvoiceDocumentModel = {
  facture: any;
  lignes: any[];
  paiements: any[];
  printedBy?: {
    prenom?: string;
    nom?: string;
    role?: string;
  };
  printedAt?: string | Date;
};

const loadLogo = () => new Promise<HTMLImageElement | null>((resolve) => {
  if (typeof window === 'undefined') {
    resolve(null);
    return;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = `${window.location.origin}/logo.png`;
});

async function addHospitalHeader(doc: jsPDF, title: string, subtitle: string) {
  const logo = await loadLogo();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, 10, pageWidth - margin * 2, 26, 4, 4, 'F');

  if (logo) {
    doc.addImage(logo, 'PNG', margin + 6, 14, 16, 16);
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Nyagbadali', margin + 28, 20);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Système de gestion hospitalière', margin + 28, 25);

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, pageWidth - margin - 12, 20, { align: 'right' });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(subtitle, pageWidth - margin - 12, 25, { align: 'right' });
}

function addSectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(text, 14, y);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y + 2, 196, y + 2);
}

function addInfoRow(doc: jsPDF, label: string, value: string, y: number, xLabel = 14, xValue = 74) {
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), xLabel, y);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(String(value || 'Non renseigné'), xValue, y, { maxWidth: 118 });
}

function formatMoney(value: number | string) {
  const cleaned = typeof value === 'string' ? value.replace(/[^\d,.-]/g, '').replace(',', '.') : value;
  const numericValue = Number(cleaned || 0);
  const rounded = Math.round(numericValue);
  return `${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 0, useGrouping: true })} FC`;
}

function addMoneyLine(doc: jsPDF, label: string, value: number | string, y: number, alignRight = true) {
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(label, 14, y);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const text = typeof value === 'number' ? formatMoney(value) : String(value);
  if (alignRight) {
    doc.text(text, 196, y, { align: 'right' });
  } else {
    doc.text(text, 120, y);
  }
}

export async function buildPatientDocumentPdf(model: PatientDocumentModel) {
  const { patient, consultations, factures } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  await addHospitalHeader(doc, 'DOSSIER PATIENT', `${new Date().toLocaleDateString('fr-FR')} • ${patient.code_patient}`);

  let y = 46;
  addSectionTitle(doc, 'Identité du patient', y);
  y += 10;
  addInfoRow(doc, 'Nom', `${patient.prenom || ''} ${patient.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', patient.code_patient || '', y + 6, 14, 74);
  addInfoRow(doc, 'Sexe', patient.sexe === 'M' ? 'Masculin' : 'Féminin', y + 12, 14, 74);
  addInfoRow(doc, 'Âge', `${patient.date_naissance ? `${new Date().getFullYear() - new Date(patient.date_naissance).getFullYear()} ans` : 'Non renseigné'}`, y + 18, 14, 74);
  addInfoRow(doc, 'Téléphone', patient.telephone || 'Non renseigné', y + 24, 14, 74);
  addInfoRow(doc, 'Email', patient.email || 'Non renseigné', y + 30, 14, 74);
  addInfoRow(doc, 'Adresse', patient.adresse || 'Non renseignée', y + 36, 14, 74);

  y = 92;
  addSectionTitle(doc, 'Suivi médical', y);
  y += 10;
  addInfoRow(doc, 'Groupe sanguin', patient.groupe_sanguin || 'Inconnu', y);
  addInfoRow(doc, 'Assurance', patient.assureur || 'Aucune', y + 6, 14, 74);
  addInfoRow(doc, 'Statut', patient.statut || 'Actif', y + 12, 14, 74);

  y = 124;
  addSectionTitle(doc, 'Historique', y);
  y += 10;
  const historiques = consultations.slice(0, 4);
  if (historiques.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucune consultation enregistrée.', 14, y);
  } else {
    historiques.forEach((consultation) => {
      const date = new Date(consultation.date_consultation).toLocaleDateString('fr-FR');
      const motif = consultation.motif || 'Consultation';
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${date} • ${motif}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`Diagnostic: ${consultation.diagnostic_principal || 'Non renseigné'}`, 20, y + 5, { maxWidth: 160 });
      y += 12;
    });
  }

  y = 190;
  addSectionTitle(doc, 'Factures', y);
  y += 10;

  if (factures.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucune facture enregistrée.', 14, y);
  } else {
    factures.slice(0, 3).forEach((facture) => {
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${facture.numero_facture || 'Facture'} • ${Number(facture.montant_patient || 0).toLocaleString('fr-FR')} FC`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`Statut: ${facture.statut || 'inconnu'}`, 14, y + 5);
      y += 12;
    });
  }

  return doc;
}

export async function buildConsultationDocumentPdf(model: ConsultationDocumentModel) {
  const { consultation, prescriptions } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  await addHospitalHeader(doc, 'FICHE DE CONSULTATION', new Date(consultation.date_consultation).toLocaleString('fr-FR'));

  let y = 44;
  addInfoRow(doc, 'Patient', `${consultation.patients?.prenom || ''} ${consultation.patients?.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', consultation.patients?.code_patient || '', y + 6, 14, 74);
  addInfoRow(doc, 'Médecin', `Dr. ${consultation.personnel?.nom || ''} ${consultation.personnel?.prenom || ''}`.trim(), y + 12, 14, 74);
  addInfoRow(doc, 'Motif', consultation.motif || 'Non renseigné', y + 18, 14, 74);
  addInfoRow(doc, 'Statut', consultation.statut || 'inconnu', y + 24, 14, 74);

  y = 82;
  addSectionTitle(doc, 'Diagnostic & notes', y);
  y += 10;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Diagnostic principal', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(String(consultation.diagnostic_principal || 'Non renseigné'), 14, y + 6, { maxWidth: 170 });

  y += 18;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Notes cliniques', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const notes = consultation.notes_privees || 'Aucune note détaillée.';
  doc.text(String(notes), 14, y + 6, { maxWidth: 170 });

  y = 152;
  addSectionTitle(doc, 'Constantes vitales', y);
  y += 8;
  const constantes = consultation.constantes || {};
  addInfoRow(doc, 'Poids', `${constantes.poids || '0'} kg`, y, 14, 74);
  addInfoRow(doc, 'Température', `${constantes.temperature || '0'} °C`, y + 6, 14, 74);
  addInfoRow(doc, 'Tension', constantes.tension || constantes.tension_systolique ? `${constantes.tension || `${constantes.tension_systolique || 0}/${constantes.tension_diastolique || 0}`}` : 'Non renseignée', y + 12, 14, 74);
  addInfoRow(doc, 'Pouls', `${constantes.pouls || '0'} bpm`, y + 18, 14, 74);

  y = 190;
  addSectionTitle(doc, 'Prescriptions', y);
  y += 8;
  if (!prescriptions || prescriptions.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucune prescription enregistrée pour cette consultation.', 14, y);
  } else {
    prescriptions.slice(0, 5).forEach((pres) => {
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${pres.medicament?.nom_commercial || pres.nom_medicament || 'Médicament'}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${pres.dosage || ''} • ${pres.frequence || ''} • ${pres.duree || ''}`.trim(), 14, y + 4, { maxWidth: 170 });
      y += 10;
    });
  }

  return doc;
}

export async function buildPaymentReceiptPdf(model: PaymentReceiptModel) {
  const { facture, payment, paiements, printedBy, printedAt } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const allPaiements = Array.isArray(paiements) && paiements.length > 0 ? paiements : (Array.isArray(facture?.paiements) ? facture.paiements : []);
  const totalFacture = Number(facture?.montant_total ?? facture?.montant_patient ?? 0);
  const totalPaye = allPaiements.reduce((sum: number, p: any) => sum + Number(p?.montant || 0), 0);
  const resteAPayer = Math.max(totalFacture - totalPaye, 0);
  const printedByName = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || 'Utilisateur';
  const printedRole = printedBy?.role || 'Personnel';
  const printDateText = printedAt ? new Date(printedAt).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await addHospitalHeader(doc, 'REÇU DE PAIEMENT', `N° ${facture.numero_facture || facture.id}`);

  let y = 46;
  addInfoRow(doc, 'Patient', `${facture.patients?.prenom || ''} ${facture.patients?.nom || ''}`.trim(), y, 14, 74);
  addInfoRow(doc, 'Code', facture.patients?.code_patient || '', y + 6, 14, 74);
  addInfoRow(doc, 'Date', new Date(payment?.date_paiement || facture.date_facture).toLocaleDateString('fr-FR'), y + 12, 14, 74);
  addInfoRow(doc, 'Mode', (payment?.mode_paiement || '—').replace('_', ' '), y + 18, 14, 74);
  addInfoRow(doc, 'Référence', payment?.reference || facture.numero_facture || '—', y + 24, 14, 74);

  y = 88;
  addSectionTitle(doc, 'Historique des paiements', y);
  y += 8;

  if (allPaiements.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucun paiement enregistré pour cette facture.', 14, y);
  } else {
    allPaiements.forEach((p: any, index: number) => {
      const montant = Number(p?.montant || 0);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${index + 1}. ${String((p?.mode_paiement || 'cash').replace('_', ' ')).toUpperCase()}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${new Date(p?.date_paiement || Date.now()).toLocaleDateString('fr-FR')} • Réf: ${p?.reference || '—'}`, 14, y + 4, { maxWidth: 130 });
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoney(montant), 196, y + 4, { align: 'right' });
      y += 12;
    });
  }

  y = 150;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);
  y += 8;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Résumé de la facture', 14, y);
  y += 10;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Montant total de la facture', 14, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formatMoney(totalFacture), 196, y, { align: 'right' });

  y += 9;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Montant payé', 14, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formatMoney(totalPaye), 196, y, { align: 'right' });

  y += 9;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Reste à payer', 14, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formatMoney(resteAPayer), 196, y, { align: 'right' });

  y = 194;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);

  const impressionText = `Imprimé par: ${printedByName}`;
  const impressionRoleText = `(${printedRole})`;
  const impressionDateText = `Le ${printDateText}`;

  const tableY = y + 10;
  const leftX = 14;
  const rightX = 120;
  const cellWidth = 70;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(leftX, tableY, 80, 26, 3, 3, 'F');
  doc.roundedRect(rightX, tableY, 72, 26, 3, 3, 'F');

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, tableY, 80, 26, 3, 3);
  doc.roundedRect(rightX, tableY, 72, 26, 3, 3);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Imprimé par', leftX + 5, tableY + 8);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(printedByName, leftX + 5, tableY + 14, { maxWidth: 70 });
  doc.text(impressionRoleText, leftX + 5, tableY + 20, { maxWidth: 70 });
  doc.text(impressionDateText, leftX + 5, tableY + 26, { maxWidth: 70 });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Merci pour votre confiance', rightX + 5, tableY + 16);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Document généré automatiquement par le système Nyagbadali.', 14, tableY + 36);

  return doc;
}
export async function buildAdmissionDocumentPdf(model: AdmissionDocumentModel) {
  const { hospitalisation, printedBy, printedAt } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const patient = hospitalisation?.patients || {};
  const medecin = hospitalisation?.medecin || hospitalisation?.personnel || {};
  const lit = hospitalisation?.lits || {};
  const chambre = lit?.chambres || {};

  await addHospitalHeader(doc, 'ADMISSION HOSPITALIÈRE', `${new Date(hospitalisation.date_admission || Date.now()).toLocaleDateString('fr-FR')}`);

  let y = 46;
  addSectionTitle(doc, 'Informations patient', y);
  y += 10;
  addInfoRow(doc, 'Patient', `${patient.prenom || ''} ${patient.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', patient.code_patient || '—', y + 6, 14, 74);
  addInfoRow(doc, 'Sexe', patient.sexe || '—', y + 12, 14, 74);
  addInfoRow(doc, 'Téléphone', patient.telephone || '—', y + 18, 14, 74);

  y = 90;
  addSectionTitle(doc, 'Fiche d’admission', y);
  y += 10;
  addInfoRow(doc, 'Date admission', new Date(hospitalisation.date_admission || Date.now()).toLocaleDateString('fr-FR'), y);
  addInfoRow(doc, 'Type', hospitalisation.type_admission || 'Standard', y + 6, 14, 74);
  addInfoRow(doc, 'Motif', hospitalisation.motif_admission || 'Non renseigné', y + 12, 14, 74);
  addInfoRow(doc, 'Médecin', `${medecin.prenom || ''} ${medecin.nom || ''}`.trim() || 'Non assigné', y + 18, 14, 74);
  addInfoRow(doc, 'Chambre / lit', `${chambre.numero || '—'} / ${lit.numero || '—'}`, y + 24, 14, 74);

  y = 150;
  addSectionTitle(doc, 'Diagnostic et observations', y);
  y += 8;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Diagnostic d’entrée', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(String(hospitalisation.diagnostic_entree || 'Aucun diagnostic renseigné.'), 14, y + 6, { maxWidth: 170 });

  y += 20;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Résumé de sortie', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(String(hospitalisation.resume_sortie || 'Aucune note de sortie.'), 14, y + 6, { maxWidth: 170 });

  const printedByName = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || 'Utilisateur';
  const printedRole = printedBy?.role || 'Personnel';
  const printDateText = printedAt ? new Date(printedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 255, 196, 255);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Imprimé par: ${printedByName} (${printedRole})`, 14, 264);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Le ${printDateText}`, 14, 270);
  doc.text('Document généré automatiquement par le système Nyagbadali.', 14, 278);

  return doc;
}

export async function buildLaboratoryDocumentPdf(model: LaboratoryDocumentModel) {
  const { analyse, printedBy, printedAt } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const patient = analyse?.patients || {};
  const resultats = analyse?.resultats || {};

  await addHospitalHeader(doc, 'RÉSULTAT LABORATOIRE', `N° ${analyse.id || '—'}`);

  let y = 46;
  addSectionTitle(doc, 'Informations', y);
  y += 10;
  addInfoRow(doc, 'Patient', `${patient.prenom || ''} ${patient.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', patient.code_patient || '—', y + 6, 14, 74);
  addInfoRow(doc, 'Type d’analyse', analyse.type_analyse || '—', y + 12, 14, 74);
  addInfoRow(doc, 'Date demande', new Date(analyse.date_demande || Date.now()).toLocaleDateString('fr-FR'), y + 18, 14, 74);
  addInfoRow(doc, 'Statut', analyse.statut || 'demandé', y + 24, 14, 74);

  y = 92;
  addSectionTitle(doc, 'Résultat', y);
  y += 10;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Description', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(String(analyse.description || 'Aucune description.'), 14, y + 6, { maxWidth: 170 });

  y += 22;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Observations', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(String(analyse.observations || 'Aucune observation.'), 14, y + 6, { maxWidth: 170 });

  y += 22;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Valeurs / résultats', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const resultText = resultats.texte || resultats.resultat || analyse.resultats || 'Aucun résultat disponible.';
  doc.text(String(resultText), 14, y + 6, { maxWidth: 170 });

  const printedByName = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || 'Utilisateur';
  const printedRole = printedBy?.role || 'Personnel';
  const printDateText = printedAt ? new Date(printedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 255, 196, 255);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Imprimé par: ${printedByName} (${printedRole})`, 14, 264);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Le ${printDateText}`, 14, 270);
  doc.text('Document généré automatiquement par le système Nyagbadali.', 14, 278);

  return doc;
}

export async function buildAppointmentDocumentPdf(model: AppointmentDocumentModel) {
  const { rendezVous, printedBy, printedAt } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const patient = rendezVous?.patients || {};
  const medecin = rendezVous?.personnel || {};

  await addHospitalHeader(doc, 'RENDEZ-VOUS', new Date(rendezVous.date_heure || Date.now()).toLocaleDateString('fr-FR'));

  let y = 46;
  addSectionTitle(doc, 'Informations', y);
  y += 10;
  addInfoRow(doc, 'Patient', `${patient.prenom || ''} ${patient.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', patient.code_patient || '—', y + 6, 14, 74);
  addInfoRow(doc, 'Médecin', `${medecin.prenom || ''} ${medecin.nom || ''}`.trim() || 'Non assigné', y + 12, 14, 74);
  addInfoRow(doc, 'Date', new Date(rendezVous.date_heure || Date.now()).toLocaleString('fr-FR'), y + 18, 14, 74);
  addInfoRow(doc, 'Motif', rendezVous.motif || 'Non renseigné', y + 24, 14, 74);
  addInfoRow(doc, 'Statut', rendezVous.statut || 'planifié', y + 30, 14, 74);

  y = 118;
  addSectionTitle(doc, 'Détail', y);
  y += 10;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Observations', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(String(rendezVous.notes || 'Aucune observation ajoutée.'), 14, y + 6, { maxWidth: 170 });

  const printedByName = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || 'Utilisateur';
  const printedRole = printedBy?.role || 'Personnel';
  const printDateText = printedAt ? new Date(printedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 255, 196, 255);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Imprimé par: ${printedByName} (${printedRole})`, 14, 264);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Le ${printDateText}`, 14, 270);
  doc.text('Document généré automatiquement par le système Nyagbadali.', 14, 278);

  return doc;
}

export async function buildPrescriptionDocumentPdf(model: PrescriptionDocumentModel) {
  const { consultation, prescriptions, printedBy, printedAt } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  await addHospitalHeader(doc, 'ORDONNANCE', new Date(consultation.date_consultation || Date.now()).toLocaleDateString('fr-FR'));

  let y = 46;
  addSectionTitle(doc, 'Patient & médecin', y);
  y += 10;
  addInfoRow(doc, 'Patient', `${consultation.patients?.prenom || ''} ${consultation.patients?.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', consultation.patients?.code_patient || '—', y + 6, 14, 74);
  addInfoRow(doc, 'Médecin', `Dr. ${consultation.personnel?.nom || ''} ${consultation.personnel?.prenom || ''}`.trim(), y + 12, 14, 74);
  addInfoRow(doc, 'Motif', consultation.motif || 'Non renseigné', y + 18, 14, 74);

  y = 100;
  addSectionTitle(doc, 'Médicaments prescrits', y);
  y += 8;

  if (!prescriptions || prescriptions.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucune prescription enregistrée.', 14, y);
  } else {
    prescriptions.forEach((pres: any, index: number) => {
      const nom = pres.medicament?.nom_commercial || pres.nom_medicament || 'Médicament';
      const dosage = pres.dosage || '—';
      const frequence = pres.frequence || '—';
      const duree = pres.duree || '—';
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${index + 1}. ${nom}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${dosage} • ${frequence} • ${duree}`, 18, y + 5, { maxWidth: 170 });
      y += 12;
    });
  }

  const printedByName = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || 'Utilisateur';
  const printedRole = printedBy?.role || 'Personnel';
  const printDateText = printedAt ? new Date(printedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 255, 196, 255);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Imprimé par: ${printedByName} (${printedRole})`, 14, 264);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Le ${printDateText}`, 14, 270);
  doc.text('Document généré automatiquement par le système Nyagbadali.', 14, 278);

  return doc;
}

export async function buildFullInvoiceDocumentPdf(model: FullInvoiceDocumentModel) {
  const { facture, lignes, paiements, printedBy, printedAt } = model;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const totalFacture = Number(facture?.montant_total ?? facture?.montant_patient ?? 0);
  const totalPaye = (paiements || []).reduce((sum: number, p: any) => sum + Number(p?.montant || 0), 0);
  const resteAPayer = Math.max(totalFacture - totalPaye, 0);

  await addHospitalHeader(doc, 'FACTURE COMPLÈTE', `N° ${facture.numero_facture || facture.id}`);

  let y = 46;
  addSectionTitle(doc, 'Client & facture', y);
  y += 10;
  addInfoRow(doc, 'Patient', `${facture.patients?.prenom || ''} ${facture.patients?.nom || ''}`.trim(), y);
  addInfoRow(doc, 'Code', facture.patients?.code_patient || '—', y + 6, 14, 74);
  addInfoRow(doc, 'Date facture', new Date(facture.date_facture || Date.now()).toLocaleDateString('fr-FR'), y + 12, 14, 74);
  addInfoRow(doc, 'Statut', facture.statut || '—', y + 18, 14, 74);

  y = 94;
  addSectionTitle(doc, 'Détails', y);
  y += 8;
  const allLignes = lignes && lignes.length > 0 ? lignes : facture.lignes_facture || [];

  if (!allLignes.length) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucune ligne de facture.', 14, y);
  } else {
    allLignes.forEach((ligne: any, index: number) => {
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${index + 1}. ${ligne.description || 'Prestation'}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`${Number(ligne.quantite || 0)} x ${Number(ligne.prix_unitaire || 0).toLocaleString('fr-FR')} FC`, 18, y + 4, { maxWidth: 120 });
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoney(Number(ligne.montant || 0)), 196, y + 4, { align: 'right' });
      y += 12;
    });
  }

  y = 170;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);
  y += 10;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Montant total', 14, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formatMoney(totalFacture), 196, y, { align: 'right' });

  y += 9;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Montant payé', 14, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formatMoney(totalPaye), 196, y, { align: 'right' });

  y += 9;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Reste à payer', 14, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(formatMoney(resteAPayer), 196, y, { align: 'right' });

  const printedByName = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || 'Utilisateur';
  const printedRole = printedBy?.role || 'Personnel';
  const printDateText = printedAt ? new Date(printedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 255, 196, 255);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Imprimé par: ${printedByName} (${printedRole})`, 14, 264);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Le ${printDateText}`, 14, 270);
  doc.text('Document généré automatiquement par le système Nyagbadali.', 14, 278);

  return doc;
}
