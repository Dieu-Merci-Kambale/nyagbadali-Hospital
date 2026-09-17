'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouveauRdvPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [patients, setPatients] = useState<any[]>([]);
  const [medecins, setMedecins] = useState<any[]>([]);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [searchPatient, setSearchPatient] = useState('');
  const [selectedMedecinId, setSelectedMedecinId] = useState('');
  const [searchMedecin, setSearchMedecin] = useState('');

  useEffect(() => {
    async function fetchData() {
      // Fetch Patients
      const { data: pData } = await supabase
        .from('patients')
        .select('id, nom, prenom, code_patient')
        .order('nom');
      if (pData) setPatients(pData);

      // Fetch Medecins
      const { data: mData } = await supabase
        .from('personnel')
        .select('id, nom, prenom, specialite')
        .like('role', '%medecin%')
        .order('nom');
      if (mData) setMedecins(mData);

      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredPatients = patients.filter(p => 
    searchPatient === '' || 
    `${p.prenom} ${p.nom}`.toLowerCase().includes(searchPatient.toLowerCase()) ||
    (p.code_patient && p.code_patient.toLowerCase().includes(searchPatient.toLowerCase()))
  ).slice(0, 5);

  const filteredMedecins = medecins.filter(m => 
    searchMedecin === '' || 
    `${m.prenom} ${m.nom}`.toLowerCase().includes(searchMedecin.toLowerCase()) ||
    (m.specialite && m.specialite.toLowerCase().includes(searchMedecin.toLowerCase()))
  ).slice(0, 5);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const form = e.currentTarget;

    if (!selectedPatientId || !selectedMedecinId) {
      setErrorMsg("Veuillez sélectionner un patient et un médecin.");
      return;
    }

    const isConfirmed = await confirm({
      title: 'Planifier le rendez-vous',
      message: 'Voulez-vous vraiment programmer ce rendez-vous ?',
      confirmText: 'Oui, programmer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    const formData = new FormData(form);
    
    const data = {
      patient_id: selectedPatientId,
      medecin_id: selectedMedecinId,
      date_heure: formData.get('date_heure') as string,
      motif: formData.get('motif') as string,
      statut: 'planifié',
    };

    const { error } = await supabase.from('rendez_vous').insert([data]);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setSaving(false);
    } else {
      router.push('/rendez-vous');
    }
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
            <h1 className="page-title">Nouveau Rendez-vous</h1>
            <p className="page-subtitle">Planification d'une consultation</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Patient *</label>
              {!selectedPatientId ? (
                <div>
                  <div className="header-search" style={{ marginBottom: 8, background: 'var(--neutral-50)' }}>
                    <Search className="header-search-icon" size={16} />
                    <input 
                      type="text" 
                      placeholder="Rechercher par nom ou code patient..." 
                      value={searchPatient}
                      onChange={(e) => setSearchPatient(e.target.value)}
                      style={{ fontSize: 14 }}
                    />
                  </div>
                  {searchPatient && (
                    <div style={{ border: '1px solid var(--neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
                      {filteredPatients.map(p => (
                        <div 
                          key={p.id} 
                          style={{ padding: '8px 12px', borderBottom: '1px solid var(--neutral-100)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onClick={() => { setSelectedPatientId(p.id); setSearchPatient(''); }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.prenom} {p.nom}</div>
                            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{p.code_patient}</div>
                          </div>
                          <button type="button" className="btn btn-sm btn-outline">Sélectionner</button>
                        </div>
                      ))}
                      {filteredPatients.length === 0 && (
                        <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 13 }}>Aucun patient trouvé</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--neutral-900)' }}>
                      {patients.find(p => p.id === selectedPatientId)?.prenom} {patients.find(p => p.id === selectedPatientId)?.nom}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--neutral-600)' }}>
                      {patients.find(p => p.id === selectedPatientId)?.code_patient}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedPatientId('')} className="btn btn-sm btn-ghost text-danger-600">
                    Changer
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Médecin *</label>
              {!selectedMedecinId ? (
                <div>
                  <div className="header-search" style={{ marginBottom: 8, background: 'var(--neutral-50)' }}>
                    <Search className="header-search-icon" size={16} />
                    <input 
                      type="text" 
                      placeholder="Rechercher par nom ou spécialité..." 
                      value={searchMedecin}
                      onChange={(e) => setSearchMedecin(e.target.value)}
                      style={{ fontSize: 14 }}
                    />
                  </div>
                  {searchMedecin && (
                    <div style={{ border: '1px solid var(--neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
                      {filteredMedecins.map(m => (
                        <div 
                          key={m.id} 
                          style={{ padding: '8px 12px', borderBottom: '1px solid var(--neutral-100)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onClick={() => { setSelectedMedecinId(m.id); setSearchMedecin(''); }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Dr. {m.prenom} {m.nom}</div>
                            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{m.specialite}</div>
                          </div>
                          <button type="button" className="btn btn-sm btn-outline">Sélectionner</button>
                        </div>
                      ))}
                      {filteredMedecins.length === 0 && (
                        <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 13 }}>Aucun médecin trouvé</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--neutral-900)' }}>
                      Dr. {medecins.find(m => m.id === selectedMedecinId)?.prenom} {medecins.find(m => m.id === selectedMedecinId)?.nom}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--neutral-600)' }}>
                      {medecins.find(m => m.id === selectedMedecinId)?.specialite}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedMedecinId('')} className="btn btn-sm btn-ghost text-danger-600">
                    Changer
                  </button>
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date et Heure *</label>
                <input type="datetime-local" name="date_heure" className="form-input" required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Motif du rendez-vous *</label>
              <input type="text" name="motif" className="form-input" required placeholder="Ex: Consultation générale, Suivi de grossesse..." />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer le RDV
          </button>
        </div>
      </form>
    </div>
  );
}
