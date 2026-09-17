'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, BedDouble, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouvelleAdmissionPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [patients, setPatients] = useState<any[]>([]);
  const [medecins, setMedecins] = useState<any[]>([]);
  const [litsDisponibles, setLitsDisponibles] = useState<any[]>([]);
  
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [searchPatient, setSearchPatient] = useState('');

  useEffect(() => {
    async function fetchData() {
      // 1. Fetch patients
      const { data: pData } = await supabase
        .from('patients')
        .select('id, nom, prenom, code_patient')
        .order('nom');
      
      // 2. Fetch medecins
      const { data: mData } = await supabase
        .from('personnel')
        .select('id, nom, prenom')
        .in('role', ['medecin', 'medecin_chef'])
        .order('nom');

      // 3. Fetch lits disponibles
      const { data: lData } = await supabase
        .from('lits')
        .select('*, chambres(numero, etage, type)')
        .eq('statut', 'disponible')
        .order('numero');

      setPatients(pData || []);
      setMedecins(mData || []);
      setLitsDisponibles(lData || []);
      setLoading(false);
    }
    
    fetchData();
  }, []);

  const filteredPatients = patients.filter(p => 
    searchPatient === '' || 
    `${p.prenom} ${p.nom}`.toLowerCase().includes(searchPatient.toLowerCase()) ||
    p.code_patient.toLowerCase().includes(searchPatient.toLowerCase())
  ).slice(0, 5);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedPatientId) {
      setErrorMsg("Veuillez sélectionner un patient.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const litId = formData.get('lit_id') as string;

    if (!litId) {
      setErrorMsg("Veuillez assigner un lit disponible.");
      return;
    }

    const isConfirmed = await confirm({
      title: 'Admettre le patient',
      message: 'Confirmez-vous l\'admission de ce patient et l\'assignation de ce lit ?',
      confirmText: 'Oui, admettre',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const data = {
      patient_id: selectedPatientId,
      medecin_responsable_id: formData.get('medecin_responsable_id') as string || null,
      lit_id: litId,
      motif_admission: formData.get('motif_admission') as string,
      type_admission: formData.get('type_admission') as string,
      diagnostic_entree: formData.get('diagnostic_entree') as string || null,
      statut: 'actif'
    };

    // Transaction simulée : Insérer hospitalisation, puis mettre à jour le lit
    const { error: hospError } = await supabase.from('hospitalisations').insert([data]);

    if (hospError) {
      console.error(hospError);
      setErrorMsg(hospError.message);
      setSaving(false);
      return;
    }

    // Mise à jour du lit
    const { error: litError } = await supabase
      .from('lits')
      .update({ statut: 'occupé' })
      .eq('id', litId);

    if (litError) {
      console.error(litError);
      // Attention: En prod, il faudrait faire un rollback si ceci échoue
      setErrorMsg("Admission réussie mais échec de la mise à jour du lit.");
      setSaving(false);
      return;
    }

    router.push('/hospitalisation');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle Admission</h1>
            <p className="page-subtitle">Enregistrer l'hospitalisation d'un patient</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        {/* SÉLECTION DU PATIENT */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">1. Patient à admettre</span></div>
          <div className="card-body">
            {!selectedPatientId ? (
              <div>
                <div className="header-search" style={{ marginBottom: 16 }}>
                  <Search className="header-search-icon" />
                  <input 
                    type="text" 
                    placeholder="Rechercher par nom ou code patient..." 
                    value={searchPatient}
                    onChange={(e) => setSearchPatient(e.target.value)}
                  />
                </div>
                {searchPatient && (
                  <div style={{ border: '1px solid var(--neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
                    {filteredPatients.map(p => (
                      <div 
                        key={p.id} 
                        style={{ padding: '12px 16px', borderBottom: '1px solid var(--neutral-100)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        className="hover:bg-neutral-50"
                        onClick={() => { setSelectedPatientId(p.id); setSearchPatient(''); }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.prenom} {p.nom}</div>
                          <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{p.code_patient}</div>
                        </div>
                        <button type="button" className="btn btn-sm btn-outline">Sélectionner</button>
                      </div>
                    ))}
                    {filteredPatients.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: 'var(--neutral-500)' }}>Aucun patient trouvé</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: 8 }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 600 }}>Patient Sélectionné</span>
                  <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--neutral-900)' }}>
                    {patients.find(p => p.id === selectedPatientId)?.prenom} {patients.find(p => p.id === selectedPatientId)?.nom}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--neutral-600)' }}>
                    {patients.find(p => p.id === selectedPatientId)?.code_patient}
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedPatientId('')} className="btn btn-sm btn-ghost text-danger-600">
                  Changer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS ADMISSION */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">2. Détails Médicaux</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Type d'admission *</label>
                <select name="type_admission" className="form-select" required>
                  <option value="programmée">Programmée (Prévue)</option>
                  <option value="urgence">Urgence</option>
                  <option value="transfert">Transfert d'un autre hôpital</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Médecin Traitant Responsable</label>
                <select name="medecin_responsable_id" className="form-select">
                  <option value="">Sélectionner un médecin</option>
                  {medecins.map(m => (
                    <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Motif de l'admission *</label>
              <textarea name="motif_admission" className="form-textarea" rows={3} required placeholder="Raison principale de l'hospitalisation..."></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Diagnostic d'entrée (Optionnel)</label>
              <input type="text" name="diagnostic_entree" className="form-input" placeholder="Ex: Pneumonie sévère, Paludisme grave..." />
            </div>
          </div>
        </div>

        {/* ASSIGNATION DU LIT */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">3. Assignation du Lit</span>
            <span className="badge badge-success">{litsDisponibles.length} lit(s) disponible(s)</span>
          </div>
          <div className="card-body">
            {litsDisponibles.length === 0 ? (
              <div className="alert alert-warning">
                <AlertCircle size={18} /> Aucun lit n'est actuellement disponible dans l'hôpital. Veuillez libérer un lit avant d'admettre un nouveau patient.
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Choisir un lit disponible *</label>
                <select name="lit_id" className="form-select" required style={{ padding: 12, height: 'auto' }}>
                  <option value="">Sélectionnez un lit...</option>
                  {litsDisponibles.map(lit => (
                    <option key={lit.id} value={lit.id}>
                      Chambre {lit.chambres?.numero} ({lit.chambres?.type}) - Lit {lit.numero} ({lit.type_lit.replace('_', ' ')})
                    </option>
                  ))}
                </select>
                <p className="form-help" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <BedDouble size={14} /> Le statut du lit passera automatiquement à "Occupé".
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving || litsDisponibles.length === 0}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Admettre le patient
          </button>
        </div>
      </form>
    </div>
  );
}
