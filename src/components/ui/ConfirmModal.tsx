'use client';

import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type ConfirmType = 'info' | 'warning' | 'danger' | 'success';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  type = 'info',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const typeConfig = {
    info: { icon: <Info size={28} className="text-primary-600" />, bg: 'bg-primary-50', btnClass: 'btn-primary' },
    warning: { icon: <AlertCircle size={28} className="text-warning-600" />, bg: 'bg-warning-50', btnClass: 'btn-warning' },
    danger: { icon: <AlertCircle size={28} className="text-danger-600" />, bg: 'bg-danger-50', btnClass: 'btn-danger' },
    success: { icon: <CheckCircle size={28} className="text-success-600" />, bg: 'bg-success-50', btnClass: 'btn-success' },
  };

  const config = typeConfig[type];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        width: '100%', maxWidth: '450px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        border: '1px solid var(--neutral-200)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              backgroundColor: type === 'danger' ? 'var(--danger-50)' : type === 'warning' ? 'var(--warning-50)' : type === 'success' ? 'var(--success-50)' : 'var(--primary-50)'
            }}>
              {config.icon}
            </div>
            <div style={{ paddingTop: 4 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--neutral-900)' }}>{title}</h3>
              <div style={{ marginTop: 8, color: 'var(--neutral-600)', fontSize: '0.95rem', lineHeight: 1.5 }}>
                {message}
              </div>
            </div>
          </div>
          <button 
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 4, borderRadius: 4 }}
            className="hover:bg-neutral-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--neutral-50)', borderTop: '1px solid var(--neutral-100)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onCancel} className="btn btn-outline" style={{ background: 'white' }}>
            {cancelText}
          </button>
          <button onClick={onConfirm} className={`btn ${config.btnClass}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
