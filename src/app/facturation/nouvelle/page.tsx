'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Shield, ListChecks, PenLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/context/ConfirmContext';
import PatientSearch from '@/components/ui/PatientSearch';
import InvoiceLinesEditor, { InvoiceTotals } from '@/components/facturation/InvoiceLinesEditor';
import UnbilledItemsPanel from '@/components/facturation/UnbilledItemsPanel';
import {
  fetchActes, fetchElementsAFacturer, elementToLine, newLine, generateInvoiceNumber,
  type InvoiceLine, type ElementAFacturer,
} from '@/lib/invoice';
import { formatMoney, explainDbError } from '@/lib/format';
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
  const [resolving, setResolving] = useState(Boolean(!patientIdParam && (consultationId || hospitalisationId)));
  const [assureur, setAssureur] = useState<string | null>(null);

  const [elements, setElements] = useState<ElementAFacturer[]>([]);
  const [elementsLoading, setElementsLoading] = useState(false);
  const [elementsError, setElementsError] = useState('');

  // Lignes issues des prestations cochées + lignes saisies à la main
  const [lignes, setLignes] = useState<InvoiceLine[]>([]);
  const [tauxAssurance, setTauxAssurance] = useState<number>(0);

  // Catalogue des tarifs
  useEffect(() => {
    fetchActes().then(setActes);
  }, []);

  // Patient de la consultation / du séjour passé en paramètre
  useEffect(() => {
    if (patientIdParam || (!consultationId && !hospitalisationId)) return;
    const table = consultationId ? 'consultations' : 'hospitalisations';
    supabase.from(table).select('patient_id').eq('id', (consultationId || hospitalisationId)!).maybeSingle().then(({ data }) => {
      if (data?.patient_id) setInitialPatientId(data.patient_id);
      setResolving(false);
    });
  }, [patientIdParam, consultationId, hospitalisationId]);

  // Prestations non facturées du patient sélectionné
  useEffect(() => {
    if (!selectedPatientId) {
      setElements([]);
      setLignes([]);
      setAssureur(null);
      return;
    }
    let ignore = false;
    setElementsLoading(true);
    supabase.from('patients').select('assureur').eq('id', selectedPatientId).single().then(({ data }) => {
      if (!ignore) setAssureur(data?.assureur || null);
    });
    fetchElementsAFacturer(selectedPatientId).then(({ elements: els, error }) => {
      if (ignore) return;
      setElementsLoading(false);
      if (error) {
        setElementsError(explainDbError(error));
        setElements([]);
        setLignes([newLine()]);
        return;
      }
      setElementsError('');
      setElements(els);
      // Présélection : la consultation ou le séjour demandé, sinon tout ce qui reste dû
      const preselect = els.filter((e) =>
        consultationId ? (e.consultation_id === consultationId || e.source_id === consultationId)
          : hospitalisationId ? e.hospitalisation_id === hospitalisationId
            : true
      );
      setLignes(preselect.length ? preselect.map((e) => elementToLine(e, actes)) : [newLine()]);
    });
    return () => { ignore = true; };
    // Les tarifs sont appliqués à la présélection ; ils sont chargés avant le choix du patient
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId, consultationId, hospitalisationId]);

  // Si le catalogue arrive après les prestations, compléter les prix manquants
  useEffect(() => {
    if (!actes.length) return;
    setLignes((prev) => prev.map((l) => {
      if (l.source_type !== 'analyse' || l.prix_unitaire > 0) return l;
      const el = elements.find((e) => e.source_id === l.source_id);
      return el ? { ...elementToLine(el, actes), key: l.key } : l;
    }));
  }, [actes, elements]);

  const selected = useMemo(() => new Set(lignes.filter((l) => l.source_id).map((l) => l.source_id as string)), [lignes]);

  const toggleElement = (el: ElementAFacturer) => {
    setLignes((prev) => {
      if (prev.some((l) => l.source_id === el.source_id)) {
        const next = prev.filter((l) => l.source_id !== el.source_id);
        return next.length ? next : [newLine()];
      }
      // Remplace la ligne vide initiale le cas échéant
      const base = prev.filter((l) => l.source_id || l.description.trim() !== '');
      return [...base, elementToLine(el, actes)];
    });
  };

  const toggleAll = (select: boolean) => {
    setLignes((prev) => {
      const manuelles = prev.filter((l) => !l.source_id && l.description.trim() !== '');
      if (!select) return manuelles.length ? manuelles : [newLine()];
      const existantes = prev.filter((l) => l.source_id);
      const ajout = elements.filter((e) => !existantes.some((l) => l.source_id === e.source_id)).map((e) => elementToLine(e, actes));
      return [...existantes, ...ajout, ...manuelles];
    });
  };

  const priceOf = (el: ElementAFacturer) => {
    const ligne = lignes.find((l) => l.source_id === el.source_id);
    return ligne ? ligne.prix_unitaire : elementToLine(el, actes).prix_unitaire;
  };

  const lignesValides = lignes.filter((l) => l.description.trim() !== '');
  const totalGlobal = lignesValides.reduce((acc, l) => acc + l.quantite * l.prix_unitaire, 0);
  const montantAssurance = Math.round((totalGlobal * tauxAssurance) / 100);
  const montantPatient = totalGlobal - montantAssurance;
  const sansPrix = lignesValides.filter((l) => l.prix_unitaire <= 0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedPatientId) {
      setErrorMsg('Veuillez sélectionner un patient.');
      return;
    }
    if (lignesValides.length === 0 || totalGlobal <= 0) {
      setErrorMsg('La facture ne contient aucune prestation chiffrée.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Créer la facture',
      message: (
        <>
          Générer une facture de <strong>{formatMoney(totalGlobal)}</strong> (net patient : {formatMoney(montantPatient)}) pour {lignesValides.length} prestation(s) ?
          {sansPrix.length > 0 && <><br /><span style={{ color: 'var(--warning-600)' }}>{sansPrix.length} ligne(s) sans prix seront facturées à 0 FC.</span></>}
        </>
      ),
      confirmText: 'Oui, créer',
      type: sansPrix.length ? 'warning' : 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const sources = lignesValides.filter((l) => l.source_id);
    const uniqueConsult = consultationId && sources.every((l) => elements.find((e) => e.source_id === l.source_id)?.consultation_id === consultationId || l.source_id === consultationId);
    const uniqueHosp = hospitalisationId && sources.every((l) => l.source_id === hospitalisationId);

    const factureData = {
      numero_facture: generateInvoiceNumber(),
      patient_id: selectedPatientId,
      consultation_id: uniqueConsult ? consultationId : null,
      hospitalisation_id: uniqueHosp ? hospitalisationId : null,
      montant_total: totalGlobal,
      montant_assurance: montantAssurance,
      montant_patient: montantPatient,
      tva: 0,
      statut: montantPatient === 0 ? 'payée' : 'en_attente',
      date_facture: new Date().toISOString(),
    };

    const { error: factureError, data: facture } = await supabase.from('factures').insert([factureData]).select().single();
    if (factureError || !facture) {
      console.error(factureError);
      setErrorMsg(`Erreur de création de la facture : ${explainDbError(factureError)}`);
      setSaving(false);
      return;
    }

    const rows = lignesValides.map((l) => ({
      facture_id: facture.id,
      description: l.description.trim(),
      code_acte: l.code_acte || null,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      montant: l.quantite * l.prix_unitaire,
      couvert_assurance: tauxAssurance > 0,
      ...(l.source_id ? { source_type: l.source_type, source_id: l.source_id } : {}),
    }));
    const { error: ligneError } = await supabase.from('lignes_facture').insert(rows);
    if (ligneError) {
      console.error(ligneError);
      // La facture sans lignes est annulée pour ne pas bloquer les prestations
      await supabase.from('factures').update({ statut: 'annulée' }).eq('id', facture.id);
      setErrorMsg(`Les lignes n'ont pas pu être enregistrées (facture annulée) : ${explainDbError(ligneError)}`);
      setSaving(false);
      return;
    }

    toast.success('Facture créée avec succès !');
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
            <p className="page-subtitle">Consultations, médicaments, examens et séjours du patient sur une seule facture</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      {resolving ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Patient</span></div>
            <div className="card-body">
              <div style={{ maxWidth: 600 }}>
                <PatientSearch
                  label="Rechercher le patient (nom, prénom ou ID)"
                  value={selectedPatientId}
                  onChange={(id) => setSelectedPatientId(id)}
                  initialPatientId={initialPatientId}
                />
              </div>
              <div className="form-group" style={{ marginTop: 8, maxWidth: 320, marginBottom: 0 }}>
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

          {selectedPatientId && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <span className="card-title"><ListChecks size={16} /> Prestations en attente de facturation</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {elementsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader2 size={20} className="animate-spin" /></div>
                ) : elementsError ? (
                  <div className="alert alert-warning" style={{ margin: 16 }}><AlertCircle size={18} /> {elementsError}</div>
                ) : (
                  <UnbilledItemsPanel
                    elements={elements}
                    selected={selected}
                    onToggle={toggleElement}
                    onToggleAll={toggleAll}
                    priceOf={priceOf}
                  />
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title"><PenLine size={16} /> Détail de la facture</span>
              <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Vous pouvez ajuster les prix et ajouter d&apos;autres actes</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {sansPrix.length > 0 && (
                <div className="alert alert-warning" style={{ margin: 16 }}>
                  <AlertCircle size={18} /> {sansPrix.length} prestation(s) sans prix : complétez le prix unitaire (ou ajoutez l&apos;acte dans Facturation → Tarifs).
                </div>
              )}
              <InvoiceLinesEditor lines={lignes.length ? lignes : [newLine()]} onChange={setLignes} actes={actes} />
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
