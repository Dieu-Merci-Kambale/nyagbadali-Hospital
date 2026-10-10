'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { fetchElementsAFacturer, fetchActes, elementToLine, type ElementAFacturer } from '@/lib/invoice';
import { formatDate, formatMoney, explainDbError } from '@/lib/format';

type PatientDu = {
  patient_id: string;
  nom: string;
  code: string;
  elements: ElementAFacturer[];
  total: number;
  depuis: string;
};

/** Patients dont des prestations (consultations, médicaments, examens, séjours) ne sont pas encore facturées. */
export default function PendingBillingCard() {
  const [patients, setPatients] = useState<PatientDu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  useEffect(() => {
    Promise.all([fetchElementsAFacturer(null), fetchActes()]).then(([{ elements, error: e }, actes]) => {
      if (e) {
        setError(explainDbError(e));
        setLoading(false);
        return;
      }
      const map = new Map<string, PatientDu>();
      elements.forEach((el) => {
        const p = map.get(el.patient_id) || { patient_id: el.patient_id, nom: el.patient_nom, code: el.patient_code, elements: [], total: 0, depuis: el.date_element };
        const ligne = elementToLine(el, actes);
        p.elements.push(el);
        p.total += ligne.prix_unitaire * ligne.quantite;
        if (new Date(el.date_element) < new Date(p.depuis)) p.depuis = el.date_element;
        map.set(el.patient_id, p);
      });
      setPatients(Array.from(map.values()).sort((a, b) => new Date(a.depuis).getTime() - new Date(b.depuis).getTime()));
      setLoading(false);
    });
  }, []);

  const total = patients.reduce((s, p) => s + p.total, 0);

  return (
    <div className="card" style={{ marginBottom: 20, border: patients.length ? '1px solid var(--warning-200)' : undefined }}>
      <button
        type="button"
        className="card-header"
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: patients.length ? 'var(--warning-50)' : undefined, border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="card-title">
          <ListChecks size={16} /> Prestations à facturer
          {!loading && !error && (
            <span className={`badge ${patients.length ? 'badge-warning' : 'badge-success'}`} style={{ marginLeft: 8 }}>
              {patients.length ? `${patients.length} patient(s) • ${formatMoney(total)}` : 'Tout est facturé'}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="card-body" style={{ padding: loading || error || !patients.length ? undefined : 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Loader2 size={18} className="animate-spin" /></div>
          ) : error ? (
            <div className="alert alert-warning"><AlertCircle size={18} /> {error}</div>
          ) : patients.length === 0 ? (
            <p style={{ color: 'var(--neutral-500)', fontSize: 14 }}>Aucune consultation, médicament, examen ou journée d&apos;hospitalisation en attente de facturation.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Prestations en attente</th>
                  <th>Depuis le</th>
                  <th style={{ textAlign: 'right' }}>Montant estimé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const count = (t: ElementAFacturer['source_type']) => p.elements.filter((e) => e.source_type === t).length;
                  const resume = [
                    count('consultation') && `${count('consultation')} consultation(s)`,
                    count('prescription') && `${count('prescription')} médicament(s)`,
                    count('analyse') && `${count('analyse')} examen(s)`,
                    count('hospitalisation') && `${p.elements.filter((e) => e.source_type === 'hospitalisation').reduce((s, e) => s + e.quantite, 0)} journée(s)`,
                  ].filter(Boolean).join(' • ');
                  return (
                    <tr key={p.patient_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.nom}</div>
                        <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{p.code}</div>
                      </td>
                      <td style={{ fontSize: 13 }}>{resume}</td>
                      <td style={{ fontSize: 13 }}>{formatDate(p.depuis)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(p.total)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/facturation/nouvelle?patient_id=${p.patient_id}`} className="btn btn-primary btn-sm">Facturer</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
