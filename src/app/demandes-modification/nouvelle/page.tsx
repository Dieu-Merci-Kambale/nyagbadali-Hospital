'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send, FilePenLine, User, AlertTriangle, PenLine } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-permissions';
import { EXPLICATION_MIN, MODULES_DEMANDE } from '@/lib/demandes-modification';
import { explainDbError, formatDateTime, toDateKey } from '@/lib/format';
import SignaturePad from '@/components/ui/SignaturePad';
import type { ModuleDemandeModification } from '@/types';

export default function NouvelleDemandeModificationPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [module, setModule] = useState<ModuleDemandeModification>('patients');
  const [reference, setReference] = useState('');
  const [dateErreur, setDateErreur] = useState(toDateKey(new Date()));
  const [description, setDescription] = useState('');
  const [correction, setCorrection] = useState('');
  const [explication, setExplication] = useState('');
  const [mesures, setMesures] = useState('');
  const [certifie, setCertifie] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 5) {
      toast.error("Décrivez l'erreur commise.");
      return;
    }
    if (correction.trim().length < 5) {
      toast.error('Indiquez la correction demandée.');
      return;
    }
    if (explication.trim().length < EXPLICATION_MIN) {
      toast.error(`Expliquez pourquoi l'erreur a été commise (${EXPLICATION_MIN} caractères au moins).`);
      return;
    }
    if (!certifie) {
      toast.error("Cochez la déclaration sur l'honneur.");
      return;
    }
    if (!signature) {
      toast.error('Signez la demande dans le cadre prévu.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('creer_demande_modification', {
      p_module: module,
      p_reference: reference.trim() || null,
      p_date_erreur: dateErreur || null,
      p_description: description.trim(),
      p_correction: correction.trim(),
      p_explication: explication.trim(),
      p_mesures: mesures.trim() || null,
      p_signature: signature,
    });
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    toast.success(profile?.role === 'medecin_chef'
      ? 'Demande signée et transmise à la direction.'
      : 'Demande signée et transmise au médecin chef.');
    router.push(data ? `/demandes-modification/${data}` : '/demandes-modification');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <Link href="/demandes-modification" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Retour aux demandes
          </Link>
          <h1 className="page-title">Nouvelle demande de modification</h1>
          <p className="page-subtitle">À remplir et signer par la personne qui a commis l&apos;erreur</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 900 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title"><User size={16} /> Demandeur</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom et prénom</label>
                <input className="form-input" value={profile ? `${profile.prenom} ${profile.nom}` : ''} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Fonction</label>
                <input className="form-input" value={profile ? roleLabels[profile.role] : ''} disabled />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Matricule</label>
                <input className="form-input" value={profile?.code_personnel || ''} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Date de la demande</label>
                <input className="form-input" value={formatDateTime(new Date())} disabled />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title"><AlertTriangle size={16} /> L&apos;erreur à corriger</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Module concerné *</label>
                <select className="form-select" value={module} onChange={(e) => setModule(e.target.value as ModuleDemandeModification)}>
                  {Object.entries(MODULES_DEMANDE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date de l&apos;erreur</label>
                <input type="date" className="form-input" value={dateErreur} max={toDateKey(new Date())} onChange={(e) => setDateErreur(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Enregistrement concerné</label>
              <input className="form-input" value={reference} maxLength={150} onChange={(e) => setReference(e.target.value)} placeholder="Ex : facture FAC-20261030-0012, dossier patient P-0458, consultation du 30/10 de M. X..." />
            </div>
            <div className="form-group">
              <label className="form-label">Ce qui a été enregistré par erreur *</label>
              <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex : montant de 25 000 FC saisi au lieu de 2 500 FC sur la facture..." />
            </div>
            <div className="form-group">
              <label className="form-label">Correction demandée *</label>
              <textarea className="form-textarea" rows={3} value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="Ex : ramener le montant à 2 500 FC et rembourser la différence au patient..." />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title"><FilePenLine size={16} /> Explication</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Pourquoi cette erreur a-t-elle été commise ? *</label>
              <textarea className="form-textarea" rows={5} value={explication} onChange={(e) => setExplication(e.target.value)} placeholder="Expliquez les circonstances : ce que vous faisiez, ce qui a causé l'erreur, quand vous l'avez remarquée..." />
              <div style={{ fontSize: 11, marginTop: 4, color: explication.trim().length >= EXPLICATION_MIN ? 'var(--success)' : 'var(--neutral-500)' }}>
                {explication.trim().length} / {EXPLICATION_MIN} caractères minimum
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Mesures pour éviter que cela se reproduise</label>
              <textarea className="form-textarea" rows={2} value={mesures} onChange={(e) => setMesures(e.target.value)} placeholder="Ex : vérifier le montant avec le patient avant de valider..." />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title"><PenLine size={16} /> Signature du demandeur</span></div>
          <div className="card-body">
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={certifie} onChange={(e) => setCertifie(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Je soussigné(e) <strong>{profile ? `${profile.prenom} ${profile.nom}` : '—'}</strong> reconnais avoir commis l&apos;erreur décrite ci-dessus
                et certifie sur l&apos;honneur l&apos;exactitude des informations de cette demande.
              </span>
            </label>
            <div style={{ maxWidth: 480 }}>
              <SignaturePad onChange={setSignature} disabled={saving} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--neutral-500)', margin: '4px 0 0' }}>
              Après signature, la demande ne peut plus être modifiée. Elle est transmise {profile?.role === 'medecin_chef' ? 'à la direction' : 'au médecin chef, puis à la direction'}.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 40 }}>
          <Link href="/demandes-modification" className="btn btn-outline">Annuler</Link>
          <button type="submit" className="btn btn-primary" disabled={saving || !profile}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Signer et envoyer
          </button>
        </div>
      </form>
    </div>
  );
}
