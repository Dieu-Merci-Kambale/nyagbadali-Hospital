'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, Printer, CreditCard, CheckCircle, Clock, FileText, Edit, Ban } from 'lucide-react';
import Link from 'next/link';
import { downloadInvoicePdf } from '@/lib/invoice';
import { FACTURE_STATUTS, statusBadge, MODES_PAIEMENT, explainDbError } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/context/ConfirmContext';
import { buildPaymentReceiptPdf } from '@/lib/document-models';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-permissions';

function formatMoneySafe(value: number | string): string {
  const cleaned = typeof value === 'string' ? value.replace(/[^\d,.-]/g, '').replace(',', '.') : value;
  const numericValue = Number(cleaned || 0);
  return `${Math.round(numericValue).toLocaleString('fr-FR', { maximumFractionDigits: 0, useGrouping: true })} FC`;
}

export default function FactureDetailsPage() {
  const router = useRouter();
  const { id } = useParams();
  const { confirm } = useConfirm();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [facture, setFacture] = useState<any>(null);
  
  const [montantPaiement, setMontantPaiement] = useState('');
  const [modePaiement, setModePaiement] = useState('cash');
  const [referencePaiement, setReferencePaiement] = useState('');

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    if (!id) return;
    const { data, error } = await supabase
      .from('factures')
      .select(`
        *,
        patients(nom, prenom, code_patient, adresse, telephone),
        lignes_facture(id, description, code_acte, quantite, prix_unitaire, montant),
        paiements(id, montant, mode_paiement, date_paiement, reference)
      `)
      .eq('id', id)
      .single();
      
    if (!error && data) {
      // Calcul du total payé
      const totalPaye = data.paiements?.reduce((sum: number, p: any) => sum + Number(p.montant || 0), 0) || 0;
      setFacture({ ...data, totalPaye });
      setMontantPaiement((data.montant_patient - totalPaye).toString());
    }
    setLoading(false);
  }

  const handlePaiement = async (e: React.FormEvent) => {
    e.preventDefault();
    const montant = parseFloat(montantPaiement);
    if (!montant || montant <= 0) {
      toast.error("Veuillez entrer un montant valide.");
      return;
    }

    const reste = facture.montant_patient - facture.totalPaye;
    if (montant > reste) {
      toast.error("Le montant saisi dépasse le reste à payer par le patient.");
      return;
    }

    const isConfirmed = await confirm({
      title: 'Encaisser un paiement',
      message: `Voulez-vous vraiment enregistrer cet encaissement de ${montant} FC en ${modePaiement.replace('_', ' ')} ?`,
      confirmText: 'Oui, encaisser',
      type: 'success'
    });

    if (!isConfirmed) return;

    setSaving(true);
    
    // Paiement + statut de la facture en une seule transaction, avec contrôle
    // du reste à payer côté base (deux encaissements simultanés ne peuvent pas dépasser le dû)
    const { data: res, error: pError } = await supabase.rpc('encaisser_paiement', {
      p_facture_id: facture.id,
      p_montant: montant,
      p_mode: modePaiement,
      p_reference: referencePaiement.trim() || null,
    });

    if (pError) {
      toast.error(explainDbError(pError));
      setSaving(false);
      fetchData();
      return;
    }

    const nouveauTotalPaye = Number(res?.total_paye ?? facture.totalPaye + montant);
    const nouveauStatut = res?.statut ?? (nouveauTotalPaye >= facture.montant_patient ? 'payée' : 'partielle');

    toast.success("Paiement enregistré avec succès !");
    
    // Optimistic UI Update
    const nouveauPaiement = {
      id: Date.now().toString(),
      montant,
      mode_paiement: modePaiement,
      reference: referencePaiement.trim() || null,
      date_paiement: new Date().toISOString()
    };

    setFacture({
      ...facture,
      statut: nouveauStatut,
      totalPaye: nouveauTotalPaye,
      paiements: [...(facture.paiements || []), nouveauPaiement]
    });
    setMontantPaiement((facture.montant_patient - nouveauTotalPaye).toString());
    setReferencePaiement('');
    
    setSaving(false);
    router.refresh();
    fetchData(); // Toujours appeler pour synchroniser, mais l'UI est déjà à jour
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!facture) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Facture introuvable</h3>
        <button className="btn btn-outline" onClick={() => router.push('/facturation')}>Retour</button>
      </div>
    );
  }

  const resteAPayer = facture.montant_patient - facture.totalPaye;

  const handleDownloadReceipt = async (payment?: any) => {
    try {
      const pdf = await buildPaymentReceiptPdf({
        facture: { ...facture, totalPaye: facture.totalPaye },
        payment,
        paiements: facture.paiements || [],
        printedBy: profile ? {
          prenom: profile.prenom,
          nom: profile.nom,
          role: roleLabels[profile.role] || profile.role,
        } : undefined,
        printedAt: new Date().toISOString(),
      });
      pdf.save(`recu-${facture.numero_facture || facture.id}.pdf`);
    } catch (error: any) {
      console.error('Erreur génération reçu PDF:', error);
      toast.error('Le reçu n’a pas pu être généré. Vérifiez les données de facturation.');
    }
  };

  const printedBy = profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] || profile.role } : undefined;
  const isAnnulee = facture.statut === 'annulée';
  const hasPaiements = (facture.paiements || []).length > 0;
  const statut = statusBadge(FACTURE_STATUTS, facture.statut);

  const handleDownloadInvoice = async () => {
    try {
      await downloadInvoicePdf(facture.id, printedBy);
    } catch (error) {
      console.error(error);
      toast.error("La facture n'a pas pu être générée.");
    }
  };

  const handleAnnuler = async () => {
    const ok = await confirm({
      title: 'Annuler la facture',
      message: `La facture ${facture.numero_facture} sera annulée et ne pourra plus être encaissée. Continuer ?`,
      confirmText: 'Oui, annuler la facture',
      type: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase.from('factures').update({ statut: 'annulée' }).eq('id', facture.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Facture annulée.');
    setFacture({ ...facture, statut: 'annulée' });
  };

  return (
    <div className="animate-fade-in">
      {isAnnulee && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <Ban size={18} /> Cette facture est annulée : aucun encaissement n&apos;est possible.
        </div>
      )}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/facturation')} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Facture {facture.numero_facture}</h1>
            <p className="page-subtitle">Émise le {new Date(facture.date_facture).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`badge ${statut.badge}`} style={{ fontSize: 14, padding: '8px 12px' }}>
            {facture.statut === 'payée' && <CheckCircle size={16} style={{ marginRight: 6 }} />}
            {facture.statut === 'en_attente' && <Clock size={16} style={{ marginRight: 6 }} />}
            {statut.label}
          </span>
          <button className="btn btn-outline" onClick={handleDownloadInvoice}>
            <FileText size={16} /> Facture PDF
          </button>
          {hasPaiements && (
            <button className="btn btn-outline" onClick={() => handleDownloadReceipt()}>
              <Printer size={16} /> Reçu PDF
            </button>
          )}
          {!isAnnulee && !hasPaiements && (
            <>
              <Link href={`/facturation/${facture.id}/edit`} className="btn btn-outline">
                <Edit size={16} /> Modifier
              </Link>
              <button className="btn btn-outline" onClick={handleAnnuler} style={{ color: 'var(--danger)' }}>
                <Ban size={16} /> Annuler
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        
        {/* Colonne Gauche : Détails Facture */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Patient Info */}
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: 14, color: 'var(--neutral-500)', textTransform: 'uppercase', marginBottom: 12 }}>Facturé à</h3>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neutral-900)' }}>{facture.patients?.prenom} {facture.patients?.nom}</div>
              <div style={{ color: 'var(--neutral-600)', marginTop: 4 }}>ID: {facture.patients?.code_patient}</div>
              {facture.patients?.telephone && <div style={{ color: 'var(--neutral-600)' }}>Tél: {facture.patients.telephone}</div>}
            </div>
          </div>

          {/* Lignes de Facture */}
          <div className="card">
            <div className="card-header"><span className="card-title">Détails des prestations</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table" style={{ margin: 0, border: 'none' }}>
                <thead style={{ background: 'var(--neutral-50)' }}>
                  <tr>
                    <th>Description</th>
                    <th style={{ textAlign: 'center' }}>Quantité</th>
                    <th style={{ textAlign: 'right' }}>Prix Unitaire</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {facture.lignes_facture?.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.description}</td>
                      <td style={{ textAlign: 'center' }}>{l.quantite}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoneySafe(l.prix_unitaire)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoneySafe(l.montant)}</td>
                    </tr>
                  ))}
                  {(!facture.lignes_facture || facture.lignes_facture.length === 0) && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--neutral-400)' }}>Aucun détail disponible</td></tr>
                  )}
                </tbody>
              </table>

              <div style={{ padding: '20px 24px', background: 'var(--neutral-50)', borderTop: '1px solid var(--neutral-200)', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: 300 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ color: 'var(--neutral-600)' }}>Total Brut</span>
                    <span style={{ fontWeight: 500 }}>{formatMoneySafe(facture.montant_total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ color: 'var(--neutral-600)' }}>Prise en charge Assurance</span>
                    <span style={{ fontWeight: 500, color: facture.montant_assurance > 0 ? 'var(--primary-600)' : 'var(--neutral-800)' }}>
                      {facture.montant_assurance > 0 ? `- ${formatMoneySafe(facture.montant_assurance)}` : '0 FC'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--neutral-200)', fontSize: 18, fontWeight: 700 }}>
                    <span>Net à payer (Patient)</span>
                    <span style={{ color: 'var(--primary-600)' }}>{formatMoneySafe(facture.montant_patient)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne Droite : Paiements */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Formulaire de paiement */}
          {resteAPayer > 0 && !isAnnulee && (
            <div className="card" style={{ border: '2px solid var(--primary-100)' }}>
              <div className="card-header" style={{ background: 'var(--primary-50)' }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={18} className="text-primary-600" /> Enregistrer un paiement
                </span>
              </div>
              <div className="card-body">
                <form onSubmit={handlePaiement}>
                  <div className="form-group">
                    <label className="form-label">Montant à encaisser (FC)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={montantPaiement} 
                      onChange={e => setMontantPaiement(e.target.value)} 
                      min="1" 
                      max={resteAPayer} 
                      required 
                    />
                    <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 4 }}>Reste à payer : {formatMoneySafe(resteAPayer)}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mode de paiement</label>
                    <select className="form-select" value={modePaiement} onChange={e => setModePaiement(e.target.value)}>
                      <option value="cash">Espèces (Cash)</option>
                      <option value="mobile_money">Mobile Money (M-Pesa, Orange, Airtel)</option>
                      <option value="carte">Carte Bancaire</option>
                      <option value="virement">Virement Bancaire</option>
                      <option value="chèque">Chèque</option>
                    </select>
                  </div>
                  {modePaiement !== 'cash' && (
                    <div className="form-group">
                      <label className="form-label">Référence de la transaction</label>
                      <input
                        type="text"
                        className="form-input"
                        value={referencePaiement}
                        onChange={e => setReferencePaiement(e.target.value)}
                        placeholder={modePaiement === 'mobile_money' ? 'Ex : MP-883421' : 'N° de transaction / chèque'}
                      />
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : 'Encaisser'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Historique des paiements */}
          <div className="card">
            <div className="card-header"><span className="card-title">Historique des Paiements</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              {facture.paiements && facture.paiements.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {facture.paiements.map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--neutral-100)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{formatMoneySafe(p.montant)}</div>
                        <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                          {MODES_PAIEMENT[p.mode_paiement] || p.mode_paiement}{p.reference ? ` • ${p.reference}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 13, color: 'var(--neutral-400)' }}>
                          {new Date(p.date_paiement).toLocaleDateString('fr-FR')} à {new Date(p.date_paiement).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDownloadReceipt(p)}>
                          <Printer size={14} /> Reçu
                        </button>
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: '16px 20px', background: 'var(--success-50)', display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--success-700)' }}>
                    <span>Total Encaissé</span>
                    <span>{formatMoneySafe(facture.totalPaye)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                  Aucun paiement enregistré pour cette facture.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
