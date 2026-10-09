'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Shield, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/context/ConfirmContext';
import PatientSearch from '@/components/ui/PatientSearch';
import InvoiceLinesEditor, { InvoiceTotals } from '@/components/facturation/InvoiceLinesEditor';
import { fetchActes, matchActe, newLine, generateInvoiceNumber, type InvoiceLine } from '@/lib/invoice';
import { formatMoney, daysBetween, explainDbError } from '@/lib/format';
import type { ActeTarif } from '@/types';

function NouvelleFactureForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const consultationId = searchParams.get('consultation_id');
  const hospitalisationId = searchParams.get('hospitalisation_id');
  const { confirm } = useConfirm();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [actes, setActes] = useState<ActeTarif[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [initialPatientId, setInitialPatientId] = useState<string | null>(patientIdParam);
  const [assureur, setAssureur] = useState<string | null>(null);
  const [origine, setOrigine] = useState('');
  const [prefilling, setPrefilling] = useState(Boolean(consultationId || hospitalisationId));

  const [lignes, setLignes] = useState<InvoiceLine[]>([newLine()]);
  const [tauxAssurance, setTauxAssurance] = useState<number>(0);

  // Catalogue + pré-remplissage depuis une consultation ou un séjour
  useEffect(() => {
    let ignore = false;
    async function init() {
      const catalogue = await fetchActes();
      if (ignore) return;
      setActes(catalogue);

      if (consultationId) {
        const { data: c } = await supabase
          .from('consultations')
          .select('id, patient_id, motif, date_consultation, personnel(specialite)')
          .eq('id', consultationId)
          .single();
        if (!c || ignore) { setPrefilling(false); return; }

        const lines: InvoiceLine[] = [];
        const specialite = ((c as any).personnel?.specialite || '').toLowerCase();
        const acteConsult = catalogue.find((a) => a.code === (specialite && !specialite.includes('générale') ? 'CS-SPE' : 'CS-GEN'));
        lines.push(newLine({
          description: acteConsult?.libelle || 'Consultation médicale',
          code_acte: acteConsult?.code || '',
          prix_unitaire: Number(acteConsult?.prix || 0),
        }));

        // Médicaments délivrés par la pharmacie
        const { data: pres } = await supabase
          .from('prescriptions')
          .select('id, nom_medicament, dosage, statut, medicament:medicaments(nom_commercial, prix_unitaire)')
          .eq('consultation_id', consultationId)
          .eq('statut', 'dispensée');
        const presIds = (pres || []).map((p: any) => p.id);
        const { data: mvts } = presIds.length
          ? await supabase.from('mouvements_stock').select('prescription_id, quantite').in('prescription_id', presIds)
          : { data: [] as any[] };
        (pres || []).forEach((p: any) => {
          const qty = (mvts || []).filter((m: any) => m.prescription_id === p.id).reduce((s: number, m: any) => s + Math.abs(m.quantite || 0), 0);
          lines.push(newLine({
            description: `${p.medicament?.nom_commercial || p.nom_medicament}${p.dosage ? ` ${p.dosage}` : ''}`,
            code_acte: 'PHARMA',
            quantite: qty || 1,
            prix_unitaire: Number(p.medicament?.prix_unitaire || 0),
          }));
        });

        // Examens de laboratoire demandés
        const { data: labs } = await supabase
          .from('analyses_laboratoire')
          .select('type_analyse, statut')
          .eq('consultation_id', consultationId)
          .neq('statut', 'annulé');
        (labs || []).forEach((l: any) => {
          const acte = matchActe(catalogue, l.type_analyse, 'laboratoire');
          lines.push(newLine({
            description: acte?.libelle || l.type_analyse,
            code_acte: acte?.code || '',
            prix_unitaire: Number(acte?.prix || 0),
          }));
        });

        if (!ignore) {
          setInitialPatientId(c.patient_id);
          setLignes(lines);
          setOrigine(`Consultation du ${new Date(c.date_consultation).toLocaleDateString('fr-FR')} — ${c.motif}`);
        }
      } else if (hospitalisationId) {
        const { data: h } = await supabase
          .from('hospitalisations')
          .select('id, patient_id, date_admission, date_sortie, motif_admission, lits(type_lit)')
          .eq('id', hospitalisationId)
          .single();
        if (!h || ignore) { setPrefilling(false); return; }
        const jours = daysBetween(h.date_admission, h.date_sortie || new Date());
        const soinsIntensifs = (h as any).lits?.type_lit === 'soins_intensifs';
        const acte = catalogue.find((a) => a.code === (soinsIntensifs ? 'HOSP-SI' : 'HOSP-STD'));
        if (!ignore) {
          setInitialPatientId(h.patient_id);
          setLignes([newLine({
            description: acte?.libelle || "Journée d'hospitalisation",
            code_acte: acte?.code || '',
            quantite: jours,
            prix_unitaire: Number(acte?.prix || 0),
          })]);
          setOrigine(`Séjour du ${new Date(h.date_admission).toLocaleDateString('fr-FR')} (${jours} jour${jours > 1 ? 's' : ''}) — ${h.motif_admission}`);
        }
      }
      if (!ignore) setPrefilling(false);
    }
    init();
    return () => { ignore = true; };
  }, [consultationId, hospitalisationId]);

  // Couverture d'assurance du patient
  useEffect(() => {
    if (!selectedPatientId) {
      setAssureur(null);
      return;
    }
    supabase.from('patients').select('assureur').eq('id', selectedPatientId).single().then(({ data }) => setAssureur(data?.assureur || null));
  }, [selectedPatientId]);

  const lignesValides = lignes.filter((l) => l.description.trim() !== '');
  const totalGlobal = lignesValides.reduce((acc, l) => acc + l.quantite * l.prix_unitaire, 0);
  const montantAssurance = Math.round((totalGlobal * tauxAssurance) / 100);
  const montantPatient = totalGlobal - montantAssurance;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedPatientId) {
      setErrorMsg('Veuillez sélectionner un patient.');
      return;
    }
    if (totalGlobal <= 0) {
      setErrorMsg('Le montant total de la facture ne peut pas être nul. Vérifiez les prix unitaires.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Créer la facture',
      message: `Générer une facture de ${formatMoney(totalGlobal)} (net patient : ${formatMoney(montantPatient)}) ?`,
      confirmText: 'Oui, créer',
      type: 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const factureData = {
      numero_facture: generateInvoiceNumber(),
      patient_id: selectedPatientId,
      consultation_id: consultationId || null,
      hospitalisation_id: hospitalisationId || null,
      montant_total: totalGlobal,
      montant_assurance: montantAssurance,
      montant_patient: montantPatient,
      tva: 0,
      statut: montantPatient === 0 ? 'payée' : 'en_attente',
      date_facture: new Date().toISOString(),
    };

    const { error: factureError, data: facture } = await supabase
      .from('factures')
      .insert([factureData])
      .select()
      .single();

    if (factureError || !facture) {
      console.error(factureError);
      setErrorMsg(`Erreur de création de la facture : ${explainDbError(factureError)}`);
      setSaving(false);
      return;
    }

    const { error: ligneError } = await supabase.from('lignes_facture').insert(
      lignesValides.map((l) => ({
        facture_id: facture.id,
        description: l.description.trim(),
        code_acte: l.code_acte || null,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        montant: l.quantite * l.prix_unitaire,
        couvert_assurance: tauxAssurance > 0,
      }))
    );
    if (ligneError) {
      console.error(ligneError);
      toast.error("Facture créée, mais certaines lignes n'ont pas pu être enregistrées.");
    } else {
      toast.success('Facture créée avec succès !');
    }
    router.push(`/facturation/${facture.id}`);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle facture</h1>
            <p className="page-subtitle">Création et émission d&apos;une facture détaillée</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      {origine && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Wand2 size={18} /> Prestations pré-remplies depuis : <strong>{origine}</strong>. Vérifiez les quantités et les prix avant de valider.
        </div>
      )}

      {prefilling ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Informations générales</span></div>
            <div className="card-body">
              <div style={{ maxWidth: 600 }}>
                <PatientSearch
                  label="Rechercher le patient (nom, prénom ou ID)"
                  value={selectedPatientId}
                  onChange={(id) => setSelectedPatientId(id)}
                  initialPatientId={initialPatientId}
                  disabled={Boolean(consultationId || hospitalisationId)}
                />
              </div>

              <div className="form-group" style={{ marginTop: 8, maxWidth: 320 }}>
                <label className="form-label">Taux de couverture assurance (%)</label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  max="100"
                  value={tauxAssurance}
                  onChange={(e) => setTauxAssurance(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                />
                <p className="form-help">0 = aucune assurance (le patient paie tout). 100 = prise en charge totale.</p>
                {assureur && (
                  <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--primary-700)', marginTop: 6, fontWeight: 600 }}>
                    <Shield size={14} /> Patient assuré : {assureur}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Détail des actes & prestations</span>
              {actes.length === 0 && <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Catalogue des tarifs indisponible</span>}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <InvoiceLinesEditor lines={lignes} onChange={setLignes} actes={actes} />
              <InvoiceTotals total={totalGlobal} tauxAssurance={tauxAssurance} montantAssurance={montantAssurance} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Créer et procéder au paiement
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function NouvelleFacturePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <NouvelleFactureForm />
    </Suspense>
  );
}
