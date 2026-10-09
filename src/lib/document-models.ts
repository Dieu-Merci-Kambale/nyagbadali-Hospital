import jsPDF from 'jspdf';

// =====================================================
// Types des modèles de documents
// =====================================================

type PrintedBy = {
  prenom?: string;
  nom?: string;
  role?: string;
};

export type PatientDocumentModel = {
  patient: any;
  consultations: any[];
  factures: any[];
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type ConsultationDocumentModel = {
  consultation: any;
  prescriptions: any[];
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type PaymentReceiptModel = {
  facture: any;
  payment?: any;
  paiements?: any[];
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type AdmissionDocumentModel = {
  hospitalisation: any;
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type LaboratoryDocumentModel = {
  analyse: any;
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type AppointmentDocumentModel = {
  rendezVous: any;
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type PrescriptionDocumentModel = {
  consultation: any;
  prescriptions: any[];
  /** Date de l'ordonnance (date des prescriptions imprimées) */
  prescriptionDate?: string | Date;
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

export type FullInvoiceDocumentModel = {
  facture: any;
  lignes: any[];
  paiements: any[];
  printedBy?: PrintedBy;
  printedAt?: string | Date;
};

// =====================================================
// Charte graphique
// =====================================================

type RGB = [number, number, number];

const NAVY: RGB = [15, 40, 84];
const ACCENT: RGB = [13, 116, 144];
const INK: RGB = [15, 23, 42];
const BODY: RGB = [51, 65, 85];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [203, 213, 225];
const SOFT: RGB = [244, 248, 251];
const SUCCESS: RGB = [21, 128, 61];
const WARNING: RGB = [180, 83, 9];
const DANGER: RGB = [185, 28, 28];

const HOSPITAL_NAME = 'Nyagbadali';

// =====================================================
// Utilitaires de formatage
// =====================================================

const groupThousands = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = Number(cleaned || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number | string | null | undefined) {
  const n = toNumber(value);
  return `${n < 0 ? '- ' : ''}${groupThousands(n)} FC`;
}

function formatDate(value?: string | Date | null, style: 'short' | 'long' | 'full' = 'short') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  if (style === 'long') return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (style === 'full') return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return `${formatDate(value)} à ${formatTime(value)}`;
}

function capitalize(text?: string | null) {
  if (!text) return '';
  const t = String(text).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fullName(person: any, upperLast = true) {
  if (!person) return '';
  return `${person.prenom || ''} ${upperLast ? String(person.nom || '').toUpperCase() : person.nom || ''}`.trim();
}

function doctorName(person: any) {
  const name = fullName(person);
  return name ? `Dr ${name}` : 'Médecin non renseigné';
}

function computeAge(dateNaissance?: string) {
  if (!dateNaissance) return null;
  const birth = new Date(dateNaissance);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  if (age < 1) {
    const months = Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth());
    return `${months} mois`;
  }
  return `${age} ans`;
}

function sexeLabel(sexe?: string) {
  return sexe === 'M' ? 'Masculin' : sexe === 'F' ? 'Féminin' : '—';
}

function shortRef(prefix: string, id?: string, date?: string | Date | null) {
  const d = new Date(date || Date.now());
  const ymd = Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-`;
  return `${prefix}-${ymd}${String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase() || '000000'}`;
}

const MODES_PAIEMENT: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  carte: 'Carte bancaire',
  virement: 'Virement bancaire',
  'chèque': 'Chèque',
  cheque: 'Chèque',
};

const modePaiementLabel = (mode?: string) => MODES_PAIEMENT[mode || ''] || capitalize(mode) || '—';

const VOIES_ADMINISTRATION: Record<string, string> = {
  orale: 'Voie orale',
  iv: 'Intraveineuse (IV)',
  im: 'Intramusculaire (IM)',
  sc: 'Sous-cutanée (SC)',
  rectale: 'Voie rectale',
  topique: 'Application locale',
  inhalation: 'Inhalation',
};

// Montant en toutes lettres (francs congolais)
function numberToFrenchWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'zéro';
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

  const below100 = (x: number): string => {
    if (x <= 16) return units[x];
    if (x < 20) return `dix-${units[x - 10]}`;
    if (x < 70) {
      const t = Math.floor(x / 10);
      const u = x % 10;
      if (u === 0) return tens[t];
      return u === 1 ? `${tens[t]} et un` : `${tens[t]}-${units[u]}`;
    }
    if (x < 80) return x === 71 ? 'soixante et onze' : `soixante-${below100(x - 60)}`;
    if (x === 80) return 'quatre-vingts';
    return `quatre-vingt-${below100(x - 80)}`;
  };

  const below1000 = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    let out = '';
    if (h > 0) out = h === 1 ? 'cent' : `${units[h]} cent${r === 0 ? 's' : ''}`;
    if (r > 0) out = out ? `${out} ${below100(r)}` : below100(r);
    return out;
  };

  const scales: [number, string, string][] = [
    [1_000_000_000, 'milliard', 'milliards'],
    [1_000_000, 'million', 'millions'],
  ];
  let rest = n;
  const parts: string[] = [];
  for (const [size, singular, plural] of scales) {
    const q = Math.floor(rest / size);
    if (q > 0) {
      parts.push(`${below1000(q)} ${q > 1 ? plural : singular}`);
      rest %= size;
    }
  }
  const thousands = Math.floor(rest / 1000);
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands).replace(/cents$/, 'cent')} mille`);
    rest %= 1000;
  }
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(' ');
}

function amountInWords(value: number | string) {
  const n = toNumber(value);
  const words = numberToFrenchWords(n);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} franc${Math.floor(Math.abs(n)) > 1 ? 's' : ''} congolais`;
}

// =====================================================
// Logo
// =====================================================

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

// =====================================================
// Kit de mise en page commun
// =====================================================

type HeaderOptions = {
  /** Titre principal centré, ex. « ORDONNANCE MÉDICALE » */
  title: string;
  /** Ligne d'information sous le titre (numéro, date…) */
  meta: string;
  /** Sous-titre de l'établissement sous le nom, ex. « Service de consultation » */
  service: string;
  /** Bloc en haut à droite (ex. médecin prescripteur) */
  right: { heading: string; sub?: string; caption?: string };
  /** Titre court utilisé sur les pages suivantes */
  shortTitle: string;
  /** Référence affichée sur les pages suivantes */
  reference: string;
};

type Column = { header: string; width: number; align?: 'left' | 'center' | 'right' };

type InfoCell = { label: string; value: string; w: number };

class DocumentKit {
  doc: jsPDF;
  logo: HTMLImageElement | null;
  pageWidth: number;
  pageHeight: number;
  margin = 18;
  contentWidth: number;
  footerTop: number;
  bottom: number;
  y = 0;
  private header!: HeaderOptions;

  constructor(doc: jsPDF, logo: HTMLImageElement | null) {
    this.doc = doc;
    this.logo = logo;
    this.pageWidth = doc.internal.pageSize.getWidth();
    this.pageHeight = doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.footerTop = this.pageHeight - 22;
    this.bottom = this.footerTop - 3;
  }

  static async create() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const logo = await loadLogo();
    return new DocumentKit(doc, logo);
  }

  // ---------- Primitives ----------

  color(rgb: RGB) {
    this.doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    return this;
  }

  font(style: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number, family: 'helvetica' | 'times' = 'helvetica') {
    this.doc.setFont(family, style);
    this.doc.setFontSize(size);
    return this;
  }

  fill(rgb: RGB) {
    this.doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    return this;
  }

  stroke(rgb: RGB, width = 0.3) {
    this.doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    this.doc.setLineWidth(width);
    return this;
  }

  dashed(on: boolean, pattern: number[] = [0.8, 1.2]) {
    (this.doc as any).setLineDashPattern(on ? pattern : [], 0);
  }

  /** Texte avec espacement de lettres, correctement aligné (jsPDF ne compte pas charSpace dans l'alignement). */
  spaced(text: string, x: number, y: number, charSpace: number, align: 'left' | 'center' | 'right' = 'left') {
    const w = this.doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
    const sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.doc.text(text, sx, y, { charSpace });
    return w;
  }

  wrap(text: string, width: number) {
    return this.doc.splitTextToSize(String(text ?? ''), width) as string[];
  }

  private opacity(value: number) {
    try {
      const anyDoc = this.doc as any;
      anyDoc.setGState(new anyDoc.GState({ opacity: value }));
    } catch {
      // Transparence non supportée : on ignore
    }
  }

  // ---------- Décor de page ----------

  private watermark() {
    if (!this.logo) return;
    const size = 120;
    this.opacity(0.045);
    try {
      this.doc.addImage(this.logo, 'PNG', (this.pageWidth - size) / 2, (this.pageHeight - size) / 2 + 10, size, size);
    } catch {
      // Image illisible : pas de filigrane
    }
    this.opacity(1);
  }

  private topBand() {
    this.fill(NAVY);
    this.doc.rect(0, 0, this.pageWidth, 5, 'F');
    this.fill(ACCENT);
    this.doc.rect(0, 5, this.pageWidth, 1.2, 'F');
  }

  /** En-tête complet de la première page. */
  letterhead(options: HeaderOptions) {
    this.header = options;
    const { doc, margin, pageWidth } = this;
    this.watermark();
    this.topBand();

    // Établissement
    if (this.logo) {
      try {
        doc.addImage(this.logo, 'PNG', margin, 13, 20, 20);
      } catch {
        // ignore
      }
    }
    const xBrand = margin + (this.logo ? 25 : 0);
    this.color(NAVY).font('bold', 20, 'times');
    doc.text(HOSPITAL_NAME, xBrand, 22);
    this.color(MUTED).font('normal', 7.5);
    doc.text('ÉTABLISSEMENT HOSPITALIER', xBrand, 27, { charSpace: 0.6 });
    doc.text(options.service, xBrand, 31.5);

    // Bloc droit
    const xRight = pageWidth - margin;
    this.color(INK).font('bold', 11);
    doc.text(options.right.heading, xRight, 20, { align: 'right' });
    if (options.right.sub) {
      this.color(ACCENT).font('normal', 8.5);
      doc.text(options.right.sub, xRight, 25.5, { align: 'right' });
    }
    if (options.right.caption) {
      this.color(MUTED).font('normal', 7.5);
      doc.text(options.right.caption, xRight, 30.5, { align: 'right' });
    }

    // Double filet
    this.stroke(NAVY, 0.5);
    doc.line(margin, 39, pageWidth - margin, 39);
    this.stroke(ACCENT, 0.2);
    doc.line(margin, 40.2, pageWidth - margin, 40.2);

    // Titre
    // Le titre est réduit si nécessaire pour tenir dans la largeur utile
    let titleSize = 19;
    let titleSpacing = 1.2;
    this.color(NAVY).font('bold', titleSize, 'times');
    while (titleSize > 13 && doc.getTextWidth(options.title) + titleSpacing * (options.title.length - 1) > this.contentWidth - 10) {
      titleSize -= 0.5;
      titleSpacing = Math.max(0.5, titleSpacing - 0.1);
      this.font('bold', titleSize, 'times');
    }
    this.spaced(options.title, pageWidth / 2, 53, titleSpacing, 'center');
    this.stroke(ACCENT, 0.6);
    doc.line(pageWidth / 2 - 14, 56.5, pageWidth / 2 + 14, 56.5);
    this.color(MUTED).font('normal', 8);
    doc.text(options.meta, pageWidth / 2, 62, { align: 'center' });

    this.y = 68;
    return this.y;
  }

  /** En-tête réduit des pages suivantes. */
  private continuationHeader() {
    const { doc, margin, pageWidth } = this;
    this.watermark();
    this.topBand();
    this.color(NAVY).font('bold', 12, 'times');
    doc.text(`${this.header.shortTitle} (suite)`, margin, 17);
    this.color(MUTED).font('normal', 8);
    doc.text(this.header.reference, pageWidth - margin, 17, { align: 'right' });
    this.stroke(LINE, 0.3);
    doc.line(margin, 21, pageWidth - margin, 21);
    this.y = 30;
  }

  newPage() {
    this.doc.addPage();
    this.continuationHeader();
  }

  /** Passe à la page suivante si la hauteur demandée ne tient pas. */
  ensure(height: number) {
    if (this.y + height > this.bottom) {
      this.newPage();
      return true;
    }
    return false;
  }

  // ---------- Blocs de contenu ----------

  /** Carte d'identité sur fond doux, avec une ou plusieurs rangées de colonnes. */
  infoCard(rows: InfoCell[][], options: { title?: string } = {}) {
    const { doc, margin, contentWidth } = this;
    const rowH = 13;
    const titleH = options.title ? 7 : 0;
    const cardH = 6 + titleH + rows.length * rowH;
    this.ensure(cardH + 4);
    const top = this.y;

    this.fill(SOFT).stroke(LINE, 0.3);
    doc.roundedRect(margin, top, contentWidth, cardH, 2.5, 2.5, 'FD');
    this.fill(ACCENT);
    doc.rect(margin, top + 3, 1.4, cardH - 6, 'F');

    if (options.title) {
      this.color(ACCENT).font('bold', 7.5);
      doc.text(options.title.toUpperCase(), margin + 7, top + 7.5, { charSpace: 0.5 });
    }

    rows.forEach((cells, r) => {
      const rowTop = top + 3 + titleH + r * rowH;
      let cx = margin + 7;
      cells.forEach((cell) => {
        const colW = (contentWidth - 10) * cell.w;
        this.color(MUTED).font('bold', 6.8);
        doc.text(cell.label.toUpperCase(), cx, rowTop + 5, { charSpace: 0.4 });
        this.color(INK).font('bold', 9.5);
        doc.text(this.wrap(cell.value || '—', colW - 4)[0] || '—', cx, rowTop + 10.5);
        cx += colW;
      });
    });

    this.y = top + cardH + 8;
  }

  /** Titre de section : petites capitales + filet. */
  section(title: string) {
    const { doc, margin, pageWidth } = this;
    this.ensure(16);
    this.fill(ACCENT);
    doc.rect(margin, this.y - 3.2, 1.2, 4.2, 'F');
    this.color(NAVY).font('bold', 9.5);
    doc.text(title.toUpperCase(), margin + 4, this.y, { charSpace: 0.6 });
    const w = doc.getTextWidth(title.toUpperCase()) + title.length * 0.6;
    this.stroke(LINE, 0.25);
    doc.line(margin + 8 + w, this.y - 1.2, pageWidth - margin, this.y - 1.2);
    this.y += 7;
  }

  /** Grille libellé / valeur sur N colonnes. */
  keyValues(pairs: { label: string; value: string }[], columns = 2) {
    const { doc, margin, contentWidth } = this;
    const colW = contentWidth / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      const slice = pairs.slice(i, i + columns);
      const wrapped = slice.map((p) => {
        this.font('normal', 9.5);
        return this.wrap(p.value || '—', colW - 6);
      });
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = 5 + lines * 4.6 + 3;
      this.ensure(h);
      slice.forEach((p, j) => {
        const x = margin + j * colW;
        this.color(MUTED).font('bold', 6.8);
        doc.text(p.label.toUpperCase(), x, this.y, { charSpace: 0.4 });
        this.color(INK).font('normal', 9.5);
        doc.text(wrapped[j], x, this.y + 5);
      });
      this.y += h;
    }
    this.y += 2;
  }

  /** Paragraphe, avec pagination ligne par ligne. */
  paragraph(text: string, options: { italic?: boolean; color?: RGB; size?: number; indent?: number } = {}) {
    const { doc, margin, contentWidth } = this;
    const size = options.size ?? 9.5;
    const lineH = size * 0.48;
    const indent = options.indent ?? 0;
    this.font(options.italic ? 'italic' : 'normal', size);
    const lines = this.wrap(text, contentWidth - indent);
    lines.forEach((line) => {
      this.ensure(lineH + 1);
      this.color(options.color ?? BODY).font(options.italic ? 'italic' : 'normal', size);
      doc.text(line, margin + indent, this.y);
      this.y += lineH;
    });
    this.y += 4;
  }

  /** Encadré mis en évidence (diagnostic, résultat…). */
  callout(label: string, text: string, tone: RGB = ACCENT) {
    const { doc, margin, contentWidth } = this;
    this.font('bold', 10.5);
    const lines = this.wrap(text || '—', contentWidth - 14);
    const h = 9 + lines.length * 5 + 4;
    this.ensure(h + 2);
    const top = this.y - 4;
    this.fill([tone[0] + Math.round((255 - tone[0]) * 0.92), tone[1] + Math.round((255 - tone[1]) * 0.92), tone[2] + Math.round((255 - tone[2]) * 0.92)] as RGB);
    doc.roundedRect(margin, top, contentWidth, h, 2, 2, 'F');
    this.fill(tone);
    doc.rect(margin, top, 1.4, h, 'F');
    this.color(tone).font('bold', 7);
    doc.text(label.toUpperCase(), margin + 7, top + 6, { charSpace: 0.5 });
    this.color(INK).font('bold', 10.5);
    doc.text(lines, margin + 7, top + 12);
    this.y = top + h + 8;
  }

  /** Tuiles de mesures (constantes vitales…). */
  tiles(items: { label: string; value: string; unit?: string }[]) {
    if (!items.length) return;
    const { doc, margin, contentWidth } = this;
    const perRow = Math.min(items.length, 4);
    const gap = 4;
    const w = (contentWidth - gap * (perRow - 1)) / perRow;
    const h = 18;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(h + 4);
      items.slice(i, i + perRow).forEach((item, j) => {
        const x = margin + j * (w + gap);
        this.fill(SOFT).stroke(LINE, 0.25);
        doc.roundedRect(x, this.y - 4, w, h, 2, 2, 'FD');
        this.color(MUTED).font('bold', 6.8);
        doc.text(item.label.toUpperCase(), x + 4, this.y + 1, { charSpace: 0.4 });
        // Décimales à la française (39.2 → 39,2)
        const value = item.value.replace(/(\d)\.(\d)/g, '$1,$2');
        this.color(NAVY).font('bold', 13);
        doc.text(value, x + 4, this.y + 9);
        if (item.unit) {
          const vw = doc.getTextWidth(value);
          this.color(MUTED).font('normal', 8);
          doc.text(item.unit, x + 4 + vw + 1.2, this.y + 9);
        }
      });
      this.y += h + 4;
    }
    this.y += 3;
  }

  /** Tableau avec en-tête marine, lignes zébrées et en-tête répété en cas de saut de page. */
  table(columns: Column[], rows: string[][], options: { emptyText?: string; highlightRow?: number; dangerRows?: number[] } = {}) {
    const { doc, margin, contentWidth } = this;
    const totalW = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / totalW) * contentWidth);
    const pad = 3;

    const drawHead = () => {
      this.fill(NAVY);
      doc.roundedRect(margin, this.y - 4.5, contentWidth, 8, 1.5, 1.5, 'F');
      let x = margin;
      this.color([255, 255, 255]).font('bold', 7.3);
      columns.forEach((col, i) => {
        const tx = col.align === 'right' ? x + widths[i] - pad : col.align === 'center' ? x + widths[i] / 2 : x + pad;
        this.spaced(col.header.toUpperCase(), tx, this.y, 0.3, col.align || 'left');
        x += widths[i];
      });
      this.y += 7;
    };

    this.ensure(18);
    drawHead();

    if (!rows.length) {
      this.color(MUTED).font('italic', 9);
      doc.text(options.emptyText || 'Aucune donnée.', margin + pad, this.y + 1);
      this.y += 9;
      return;
    }

    rows.forEach((row, r) => {
      this.font('normal', 8.8);
      const cells = row.map((cell, i) => this.wrap(cell || '—', widths[i] - pad * 2));
      const lines = Math.max(...cells.map((c) => c.length));
      const h = 3.5 + lines * 4.2;
      if (this.ensure(h + 2)) drawHead();

      if (options.highlightRow === r) {
        this.fill([224, 242, 246]);
        doc.rect(margin, this.y - 4.2, contentWidth, h, 'F');
      } else if (r % 2 === 1) {
        this.fill(SOFT);
        doc.rect(margin, this.y - 4.2, contentWidth, h, 'F');
      }

      let x = margin;
      cells.forEach((cellLines, i) => {
        const col = columns[i];
        const tx = col.align === 'right' ? x + widths[i] - pad : col.align === 'center' ? x + widths[i] / 2 : x + pad;
        const danger = options.dangerRows?.includes(r) && i > 0;
        this.color(danger ? DANGER : i === 0 ? INK : BODY).font(i === 0 || danger ? 'bold' : 'normal', 8.8);
        doc.text(cellLines, tx, this.y, { align: col.align || 'left' });
        x += widths[i];
      });

      this.stroke(LINE, 0.15);
      doc.line(margin, this.y - 4.2 + h, margin + contentWidth, this.y - 4.2 + h);
      this.y += h;
    });
    this.y += 6;
  }

  /** Récapitulatif de montants aligné à droite ; la ligne `emphasis` est mise en valeur. */
  totals(lines: { label: string; value: string; emphasis?: boolean; tone?: RGB }[]) {
    const { doc, margin, contentWidth } = this;
    const boxW = 92;
    const x = margin + contentWidth - boxW;
    const h = lines.reduce((s, l) => s + (l.emphasis ? 11 : 6.5), 0) + 4;
    this.ensure(h + 4);
    let ly = this.y;
    lines.forEach((line) => {
      if (line.emphasis) {
        ly += 1.5;
        this.fill(NAVY);
        doc.roundedRect(x, ly - 5.5, boxW, 9.5, 1.5, 1.5, 'F');
        this.color([255, 255, 255]).font('bold', 9);
        doc.text(line.label, x + 4, ly);
        this.font('bold', 11);
        doc.text(line.value, x + boxW - 4, ly, { align: 'right' });
        ly += 9.5;
      } else {
        this.color(MUTED).font('normal', 9);
        doc.text(line.label, x + 4, ly);
        this.color(line.tone ?? INK).font('bold', 9.5);
        doc.text(line.value, x + boxW - 4, ly, { align: 'right' });
        this.stroke(LINE, 0.15);
        doc.line(x, ly + 2.2, x + boxW, ly + 2.2);
        ly += 6.5;
      }
    });
    return ly;
  }

  /** Tampon incliné (PAYÉ, URGENT…). */
  stamp(text: string, tone: RGB, x: number, y: number) {
    const { doc } = this;
    this.opacity(0.85);
    this.font('bold', 15);
    const w = doc.getTextWidth(text) + 0.8 * Math.max(text.length - 1, 0) + 10;
    doc.setDrawColor(tone[0], tone[1], tone[2]);
    doc.setLineWidth(0.9);
    // Rectangle légèrement incliné dessiné par ses 4 coins
    const angle = (-12 * Math.PI) / 180;
    const h = 11;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pt = (dx: number, dy: number): [number, number] => [x + dx * cos - dy * sin, y + dx * sin + dy * cos];
    const corners = [pt(-w / 2, -h / 2), pt(w / 2, -h / 2), pt(w / 2, h / 2), pt(-w / 2, h / 2)];
    corners.forEach((c, i) => {
      const n = corners[(i + 1) % 4];
      doc.line(c[0], c[1], n[0], n[1]);
    });
    this.color(tone);
    const start = pt(-w / 2 + 5, 2);
    doc.text(text, start[0], start[1], { angle: 12, charSpace: 0.8 });
    this.opacity(1);
  }

  /** Cadres de signature (1 ou 2). */
  signatures(boxes: { title: string; name?: string }[], options: { leftNote?: string[] } = {}) {
    const { doc, margin, contentWidth } = this;
    const blockH = 38;
    // Le bloc peut remonter sur l'espacement laissé par le bloc précédent
    if (this.y - 8 + blockH > this.bottom) this.newPage();
    const top = Math.max(this.y - 8, this.bottom - blockH);

    if (options.leftNote && boxes.length === 1) {
      this.color(INK).font('normal', 9.5);
      doc.text(options.leftNote[0], margin, top + 8);
      if (options.leftNote[1]) {
        this.color(MUTED).font('normal', 8);
        doc.text(options.leftNote[1], margin, top + 13.5);
      }
    }

    const boxW = boxes.length === 1 ? 78 : (contentWidth - 12) / 2;
    boxes.forEach((box, i) => {
      const x = boxes.length === 1 ? margin + contentWidth - boxW : margin + i * (boxW + 12);
      this.color(NAVY).font('bold', 7.8);
      this.spaced(box.title.toUpperCase(), x + boxW / 2, top + 4, 0.3, 'center');
      this.stroke(LINE, 0.3);
      this.dashed(true, [1.5, 1.2]);
      doc.roundedRect(x, top + 7, boxW, 22, 2, 2);
      this.dashed(false);
      if (box.name) {
        this.color(INK).font('bold', 9.5);
        doc.text(box.name, x + boxW / 2, top + 35, { align: 'center' });
      }
    });
    this.y = top + blockH;
  }

  /** Pied de page sur toutes les pages, puis renvoie le document. */
  finish(options: { notice: string; printedBy?: PrintedBy; printedAt?: string | Date }) {
    const { doc, margin, pageWidth, pageHeight, footerTop } = this;
    const printedByName = [options.printedBy?.prenom, options.printedBy?.nom].filter(Boolean).join(' ');
    const printedRole = options.printedBy?.role ? ` (${options.printedBy.role})` : '';
    const printedAtText = new Date(options.printedAt || Date.now()).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const printedLine = printedByName
      ? `Imprimé par ${printedByName}${printedRole} le ${printedAtText}  •  ${HOSPITAL_NAME}`
      : `Édité le ${printedAtText}  •  ${HOSPITAL_NAME}`;

    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      this.stroke(ACCENT, 0.4);
      doc.line(margin, footerTop, pageWidth - margin, footerTop);
      this.color(MUTED).font('normal', 7.2);
      doc.text(options.notice, pageWidth / 2, footerTop + 5, { align: 'center', maxWidth: pageWidth - margin * 2 });
      this.font('normal', 6.8);
      doc.text(printedLine, margin, footerTop + 10.5);
      doc.text(`Page ${i} / ${total}`, pageWidth - margin, footerTop + 10.5, { align: 'right' });
      this.fill(NAVY);
      doc.rect(0, pageHeight - 4, pageWidth, 4, 'F');
    }
    return doc;
  }
}

function patientCardRows(patient: any, extra?: InfoCell[]): InfoCell[][] {
  const age = computeAge(patient?.date_naissance);
  return [[
    { label: 'Patient', value: fullName(patient) || 'Non renseigné', w: 0.32 },
    { label: 'Âge / Sexe', value: `${age || '—'} / ${sexeLabel(patient?.sexe)}`, w: 0.24 },
    ...(extra || [{ label: 'Téléphone', value: patient?.telephone || '—', w: 0.24 }]),
    { label: 'N° dossier', value: patient?.code_patient || '—', w: 0.2 },
  ]];
}

const CONFIDENTIAL_NOTICE = 'Document médical confidentiel, couvert par le secret médical  •  Toute reproduction ou diffusion non autorisée est interdite';

// =====================================================
// 1. Dossier patient
// =====================================================

export async function buildPatientDocumentPdf(model: PatientDocumentModel) {
  const { patient, consultations = [], factures = [], printedBy, printedAt } = model;
  const kit = await DocumentKit.create();

  kit.letterhead({
    title: 'DOSSIER MÉDICAL',
    meta: `N° dossier ${patient.code_patient || '—'}   •   Édité le ${formatDate(printedAt || new Date(), 'long')}`,
    service: 'Service des archives médicales',
    right: { heading: fullName(patient) || 'Patient', sub: `Statut : ${capitalize(patient.statut || 'actif')}`, caption: 'Dossier patient' },
    shortTitle: 'Dossier médical',
    reference: `${fullName(patient)}  •  ${patient.code_patient || ''}`,
  });

  kit.infoCard([
    [
      { label: 'Patient', value: fullName(patient) || 'Non renseigné', w: 0.36 },
      { label: 'Âge / Sexe', value: `${computeAge(patient.date_naissance) || '—'} / ${sexeLabel(patient.sexe)}`, w: 0.24 },
      { label: 'Né(e) le', value: formatDate(patient.date_naissance), w: 0.18 },
      { label: 'Groupe sanguin', value: patient.groupe_sanguin || 'Inconnu', w: 0.22 },
    ],
    [
      { label: 'Téléphone', value: patient.telephone || '—', w: 0.36 },
      { label: 'Email', value: patient.email || '—', w: 0.42 },
      { label: 'N° dossier', value: patient.code_patient || '—', w: 0.22 },
    ],
  ], { title: 'Identité du patient' });

  kit.section('Coordonnées & couverture');
  kit.keyValues([
    { label: 'Adresse', value: patient.adresse || 'Non renseignée' },
    { label: 'Assurance', value: patient.assureur ? `${patient.assureur}${patient.numero_assurance ? ` (N° ${patient.numero_assurance})` : ''}` : 'Aucune' },
    { label: "Contact d'urgence", value: patient.contact_urgence_nom || 'Non renseigné' },
    { label: 'Téléphone urgence', value: patient.contact_urgence_tel || '—' },
  ]);

  kit.section(`Historique des consultations (${consultations.length})`);
  kit.table(
    [
      { header: 'Date', width: 16 },
      { header: 'Motif', width: 30 },
      { header: 'Diagnostic', width: 30 },
      { header: 'Médecin', width: 24 },
    ],
    consultations.map((c: any) => [
      formatDate(c.date_consultation),
      c.motif || '—',
      c.diagnostic_principal || '—',
      c.personnel ? doctorName(c.personnel) : '—',
    ]),
    { emptyText: 'Aucune consultation enregistrée.' }
  );

  kit.section(`Situation financière (${factures.length} facture${factures.length > 1 ? 's' : ''})`);
  kit.table(
    [
      { header: 'N° facture', width: 24 },
      { header: 'Date', width: 18 },
      { header: 'Statut', width: 18 },
      { header: 'Montant total', width: 20, align: 'right' },
      { header: 'Part patient', width: 20, align: 'right' },
    ],
    factures.map((f: any) => [
      f.numero_facture || '—',
      formatDate(f.date_facture),
      capitalize(f.statut) || '—',
      formatMoney(f.montant_total),
      formatMoney(f.montant_patient),
    ]),
    { emptyText: 'Aucune facture enregistrée.' }
  );

  if (factures.length) {
    const totalPatient = factures.reduce((s: number, f: any) => s + toNumber(f.montant_patient), 0);
    const impayees = factures.filter((f: any) => f.statut !== 'payée' && f.statut !== 'annulée').length;
    kit.y = kit.totals([
      { label: 'Factures en attente', value: String(impayees), tone: impayees ? WARNING : SUCCESS },
      { label: 'Total facturé au patient', value: formatMoney(totalPatient), emphasis: true },
    ]) + 4;
  }

  return kit.finish({ notice: CONFIDENTIAL_NOTICE, printedBy, printedAt });
}

// =====================================================
// 2. Compte rendu de consultation
// =====================================================

export async function buildConsultationDocumentPdf(model: ConsultationDocumentModel) {
  const { consultation, prescriptions = [], printedBy, printedAt } = model;
  const kit = await DocumentKit.create();
  const patient = consultation?.patients || {};
  const medecin = consultation?.personnel || {};
  const ref = shortRef('CS', consultation?.id, consultation?.date_consultation);

  kit.letterhead({
    title: 'COMPTE RENDU DE CONSULTATION',
    meta: `N° ${ref}   •   ${capitalize(formatDate(consultation.date_consultation, 'full'))} à ${formatTime(consultation.date_consultation)}`,
    service: 'Service de consultation',
    right: { heading: doctorName(medecin), sub: medecin.specialite || 'Médecine générale', caption: 'Médecin consultant' },
    shortTitle: 'Compte rendu de consultation',
    reference: `${fullName(patient)}  •  N° ${ref}`,
  });

  const constantes = consultation?.constantes || {};
  const tension = constantes.tension
    || (constantes.tension_systolique ? `${constantes.tension_systolique}/${constantes.tension_diastolique || '—'}` : '');

  kit.infoCard(patientCardRows(patient, [
    { label: 'Statut', value: capitalize(consultation.statut) || '—', w: 0.14 },
  ]));

  const tiles = [
    constantes.poids && { label: 'Poids', value: String(constantes.poids), unit: 'kg' },
    constantes.taille && { label: 'Taille', value: String(constantes.taille), unit: 'cm' },
    constantes.temperature && { label: 'Température', value: String(constantes.temperature), unit: '°C' },
    tension && { label: 'Tension artérielle', value: String(tension), unit: 'mmHg' },
    constantes.pouls && { label: 'Pouls', value: String(constantes.pouls), unit: 'bpm' },
    constantes.saturation_o2 && { label: 'Saturation O2', value: String(constantes.saturation_o2), unit: '%' },
  ].filter(Boolean) as { label: string; value: string; unit?: string }[];

  if (tiles.length) {
    kit.section('Constantes vitales');
    kit.tiles(tiles);
  }

  kit.section('Motif de consultation');
  kit.paragraph(consultation.motif || 'Non renseigné.');

  if (consultation.anamnese) {
    kit.section('Anamnèse');
    kit.paragraph(consultation.anamnese);
  }

  kit.section('Conclusion diagnostique');
  kit.callout('Diagnostic principal', consultation.diagnostic_principal || 'Diagnostic non encore établi', DANGER);

  if (consultation.notes_privees) {
    kit.section('Observations cliniques');
    kit.paragraph(consultation.notes_privees);
  }

  if (consultation.plan_traitement) {
    kit.section('Plan de traitement');
    kit.paragraph(consultation.plan_traitement);
  }

  const actives = prescriptions.filter((p: any) => p?.statut !== 'annulée');
  kit.section(`Traitement prescrit (${actives.length})`);
  kit.table(
    [
      { header: 'Médicament', width: 30 },
      { header: 'Posologie', width: 34 },
      { header: 'Durée', width: 14 },
      { header: 'Voie', width: 22 },
    ],
    actives.map((p: any) => [
      `${p.medicament?.nom_commercial || p.nom_medicament || 'Médicament'}${p.dosage ? ` ${p.dosage}` : ''}`,
      p.frequence || '—',
      p.duree || '—',
      VOIES_ADMINISTRATION[p.voie_administration] || capitalize(p.voie_administration) || '—',
    ]),
    { emptyText: 'Aucun médicament prescrit lors de cette consultation.' }
  );

  kit.signatures([{ title: 'Signature et cachet du médecin', name: doctorName(medecin) }], {
    leftNote: [`Fait le ${formatDate(consultation.date_consultation, 'long')}`, `Réf. ${ref}`],
  });

  return kit.finish({ notice: CONFIDENTIAL_NOTICE, printedBy, printedAt });
}

// =====================================================
// 3. Reçu de paiement
// =====================================================

export async function buildPaymentReceiptPdf(model: PaymentReceiptModel) {
  const { facture, payment, paiements, printedBy, printedAt } = model;
  const kit = await DocumentKit.create();
  const { doc, margin, contentWidth } = kit;
  const patient = facture?.patients || {};

  const allPaiements: any[] = Array.isArray(paiements) && paiements.length > 0
    ? paiements
    : (Array.isArray(facture?.paiements) ? facture.paiements : []);
  const sorted = [...allPaiements].sort((a, b) => new Date(a.date_paiement).getTime() - new Date(b.date_paiement).getTime());

  const totalBrut = toNumber(facture?.montant_total);
  const assurance = toNumber(facture?.montant_assurance);
  const netPatient = toNumber(facture?.montant_patient ?? facture?.montant_total);
  const totalPaye = sorted.reduce((s, p) => s + toNumber(p?.montant), 0);
  const reste = Math.max(netPatient - totalPaye, 0);

  const montantRecu = payment ? toNumber(payment.montant) : totalPaye;
  const datePaiement = payment?.date_paiement || sorted[sorted.length - 1]?.date_paiement || facture?.date_facture;
  const ref = payment?.id
    ? shortRef('REC', String(payment.id), payment.date_paiement)
    : shortRef('REC', facture?.id, datePaiement);
  const caissier = [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ');

  kit.letterhead({
    title: 'REÇU DE PAIEMENT',
    meta: `N° ${ref}   •   Facture N° ${facture?.numero_facture || '—'}`,
    service: 'Service de facturation & caisse',
    right: { heading: 'Caisse centrale', sub: caissier || 'Service financier', caption: printedBy?.role || 'Encaissement' },
    shortTitle: 'Reçu de paiement',
    reference: `N° ${ref}`,
  });

  kit.infoCard([[
    { label: 'Reçu de', value: fullName(patient) || 'Non renseigné', w: 0.36 },
    { label: 'N° dossier', value: patient.code_patient || '—', w: 0.22 },
    { label: 'Téléphone', value: patient.telephone || '—', w: 0.2 },
    { label: 'Date', value: formatDate(datePaiement), w: 0.22 },
  ]]);

  // Encadré du montant reçu
  const boxTop = kit.y - 2;
  const boxH = 34;
  kit.fill(NAVY);
  doc.roundedRect(margin, boxTop, contentWidth, boxH, 3, 3, 'F');
  kit.fill(ACCENT);
  doc.roundedRect(margin, boxTop + boxH - 3, contentWidth, 3, 1.5, 1.5, 'F');
  kit.color([186, 230, 253]).font('bold', 7.5);
  doc.text(payment ? 'MONTANT REÇU' : 'TOTAL ENCAISSÉ', margin + 8, boxTop + 9, { charSpace: 0.6 });
  kit.color([255, 255, 255]).font('bold', 22);
  doc.text(formatMoney(montantRecu), margin + 8, boxTop + 20);
  kit.color([203, 213, 225]).font('italic', 8);
  doc.text(kit.wrap(`Arrêté à la somme de : ${amountInWords(montantRecu)}.`, contentWidth - 80), margin + 8, boxTop + 26.5);

  const xr = margin + contentWidth - 8;
  kit.color([186, 230, 253]).font('bold', 7);
  kit.spaced('MODE DE PAIEMENT', xr, boxTop + 9, 0.5, 'right');
  kit.color([255, 255, 255]).font('bold', 10.5);
  doc.text(payment ? modePaiementLabel(payment.mode_paiement) : (sorted.length > 1 ? 'Multiple' : modePaiementLabel(sorted[0]?.mode_paiement)), xr, boxTop + 14.5, { align: 'right' });
  kit.color([186, 230, 253]).font('bold', 7);
  kit.spaced('RÉFÉRENCE', xr, boxTop + 21, 0.5, 'right');
  kit.color([255, 255, 255]).font('normal', 9);
  doc.text(String(payment?.reference || facture?.numero_facture || '—'), xr, boxTop + 26, { align: 'right' });
  kit.y = boxTop + boxH + 12;

  kit.section(`Historique des paiements (${sorted.length})`);
  const highlight = payment ? sorted.findIndex((p) => p.id === payment.id) : -1;
  kit.table(
    [
      { header: 'N°', width: 7, align: 'center' },
      { header: 'Date', width: 26 },
      { header: 'Mode', width: 22 },
      { header: 'Référence', width: 23 },
      { header: 'Montant', width: 22, align: 'right' },
    ],
    sorted.map((p, i) => [
      String(i + 1),
      formatDateTime(p.date_paiement),
      modePaiementLabel(p.mode_paiement),
      p.reference || '—',
      formatMoney(p.montant),
    ]),
    { emptyText: 'Aucun paiement enregistré pour cette facture.', highlightRow: highlight >= 0 ? highlight : undefined }
  );

  kit.section('Situation de la facture');
  const totalsTop = kit.y;
  const totalsEnd = kit.totals([
    { label: 'Total brut', value: formatMoney(totalBrut || netPatient) },
    ...(assurance > 0 ? [{ label: 'Prise en charge assurance', value: `- ${formatMoney(assurance)}`, tone: ACCENT }] : []),
    { label: 'Net à payer (patient)', value: formatMoney(netPatient) },
    { label: 'Total payé', value: formatMoney(totalPaye), tone: SUCCESS },
    { label: 'Reste à payer', value: formatMoney(reste), emphasis: true },
  ]);
  if (reste <= 0) kit.stamp('SOLDÉ', SUCCESS, margin + 38, totalsTop + 12);
  else kit.stamp('PAIEMENT PARTIEL', WARNING, margin + 42, totalsTop + 12);
  kit.y = totalsEnd + 4;

  kit.signatures([
    { title: 'Le caissier', name: caissier || undefined },
    { title: 'Le patient ou son représentant', name: fullName(patient) || undefined },
  ]);

  return kit.finish({
    notice: 'Ce reçu fait foi de paiement. Merci de le conserver précieusement  •  Aucun remboursement sans présentation de ce reçu',
    printedBy,
    printedAt,
  });
}

// =====================================================
// 4. Bulletin d'admission
// =====================================================

export async function buildAdmissionDocumentPdf(model: AdmissionDocumentModel) {
  const { hospitalisation, printedBy, printedAt } = model;
  const kit = await DocumentKit.create();

  const patient = hospitalisation?.patients || {};
  const medecin = hospitalisation?.medecin || hospitalisation?.personnel || {};
  const lit = hospitalisation?.lits || hospitalisation?.lit || {};
  const chambre = lit?.chambres || lit?.chambre || {};
  const ref = shortRef('ADM', hospitalisation?.id, hospitalisation?.date_admission);
  const hasMedecin = Boolean(medecin?.nom || medecin?.prenom);

  kit.letterhead({
    title: "BULLETIN D'ADMISSION",
    meta: `N° ${ref}   •   Admis(e) le ${formatDate(hospitalisation.date_admission, 'long')} à ${formatTime(hospitalisation.date_admission)}`,
    service: "Service d'hospitalisation",
    right: {
      heading: hasMedecin ? doctorName(medecin) : 'Médecin non assigné',
      sub: medecin?.specialite || 'Médecin responsable',
      caption: 'Responsable du séjour',
    },
    shortTitle: "Bulletin d'admission",
    reference: `${fullName(patient)}  •  N° ${ref}`,
  });

  kit.infoCard(patientCardRows(patient));

  const typeAdmission = hospitalisation.type_admission || 'standard';
  kit.section('Séjour');
  kit.tiles([
    { label: 'Chambre', value: String(chambre.numero || '—') },
    { label: 'Lit', value: String(lit.numero || '—') },
    { label: "Type d'admission", value: capitalize(typeAdmission) },
    { label: 'Statut', value: capitalize(hospitalisation.statut || 'actif') },
  ]);

  kit.keyValues([
    { label: "Date d'admission", value: formatDateTime(hospitalisation.date_admission) },
    { label: 'Date de sortie', value: hospitalisation.date_sortie ? formatDateTime(hospitalisation.date_sortie) : 'Séjour en cours' },
    { label: 'Étage', value: chambre.etage ? String(chambre.etage) : '—' },
    { label: 'Type de lit', value: capitalize(lit.type_lit) || '—' },
  ]);

  kit.section("Motif d'admission");
  kit.paragraph(hospitalisation.motif_admission || 'Non renseigné.');

  kit.section('Diagnostics');
  kit.callout("Diagnostic d'entrée", hospitalisation.diagnostic_entree || 'Non renseigné', DANGER);
  if (hospitalisation.diagnostic_sortie) {
    kit.callout('Diagnostic de sortie', hospitalisation.diagnostic_sortie, SUCCESS);
  }

  if (hospitalisation.resume_sortie) {
    kit.section('Résumé de sortie');
    kit.paragraph(hospitalisation.resume_sortie);
  }

  if (typeAdmission === 'urgence') {
    kit.ensure(26);
    kit.stamp('URGENCE', DANGER, kit.pageWidth - kit.margin - 30, kit.y + 6);
    kit.y += 22;
  }

  kit.signatures([
    { title: 'Le médecin responsable', name: hasMedecin ? doctorName(medecin) : undefined },
    { title: 'Le patient ou son représentant', name: fullName(patient) || undefined },
  ]);

  return kit.finish({ notice: CONFIDENTIAL_NOTICE, printedBy, printedAt });
}

// =====================================================
// 5. Compte rendu d'analyses de laboratoire
// =====================================================

export async function buildLaboratoryDocumentPdf(model: LaboratoryDocumentModel) {
  const { analyse, printedBy, printedAt } = model;
  const kit = await DocumentKit.create();

  const patient = analyse?.patients || {};
  const prescripteur = analyse?.personnel || analyse?.medecin || {};
  const ref = shortRef('LAB', analyse?.id, analyse?.date_demande);
  const hasPrescripteur = Boolean(prescripteur?.nom || prescripteur?.prenom);

  kit.letterhead({
    title: "COMPTE RENDU D'ANALYSES",
    meta: `N° ${ref}   •   Demande du ${formatDate(analyse.date_demande, 'long')}`,
    service: 'Laboratoire de biologie médicale',
    right: {
      heading: hasPrescripteur ? doctorName(prescripteur) : 'Prescripteur non renseigné',
      sub: prescripteur?.specialite || 'Médecin prescripteur',
      caption: "Demandeur de l'examen",
    },
    shortTitle: "Compte rendu d'analyses",
    reference: `${fullName(patient)}  •  N° ${ref}`,
  });

  kit.infoCard(patientCardRows(patient, [
    { label: 'Statut', value: capitalize(analyse.statut || 'demandé'), w: 0.14 },
  ]));

  kit.section('Examen');
  kit.keyValues([
    { label: "Type d'analyse", value: analyse.type_analyse || '—' },
    { label: 'Date de la demande', value: formatDateTime(analyse.date_demande) },
    { label: 'Date du prélèvement', value: analyse.date_prelevement ? formatDateTime(analyse.date_prelevement) : 'Non effectué' },
    { label: 'Date du résultat', value: analyse.date_resultat ? formatDateTime(analyse.date_resultat) : 'En attente' },
  ]);

  if (analyse.description) {
    kit.section('Renseignements cliniques');
    kit.paragraph(analyse.description);
  }

  kit.section('Résultats');
  const resultats = analyse?.resultats;
  const parametres: any[] = Array.isArray(resultats?.parametres)
    ? resultats.parametres.filter((p: any) => p?.nom)
    : [];
  const structured = resultats && typeof resultats === 'object' && !parametres.length
    ? Object.entries(resultats).filter(([k]) => !['texte', 'resultat', 'parametres'].includes(k))
    : [];
  const texte = typeof resultats === 'string'
    ? resultats
    : resultats?.texte || resultats?.resultat || '';

  if (parametres.length) {
    kit.table(
      [
        { header: 'Paramètre', width: 34 },
        { header: 'Résultat', width: 22, align: 'right' },
        { header: 'Unité', width: 16 },
        { header: 'Valeurs de référence', width: 28 },
      ],
      parametres.map((p) => [
        String(p.nom),
        `${p.valeur || '—'}${p.anormal ? ' *' : ''}`,
        p.unite || '',
        p.reference || '—',
      ]),
      { dangerRows: parametres.map((p, i) => (p.anormal ? i : -1)).filter((i) => i >= 0) }
    );
    if (parametres.some((p) => p.anormal)) {
      kit.y -= 3;
      kit.paragraph('* Valeur en dehors des valeurs de référence.', { italic: true, color: DANGER, size: 8 });
    }
  }

  if (structured.length) {
    kit.table(
      [
        { header: 'Paramètre', width: 45 },
        { header: 'Résultat', width: 55 },
      ],
      structured.map(([k, v]) => [capitalize(k), typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')])
    );
  }
  if (texte) {
    kit.callout(parametres.length ? 'Conclusion' : 'Résultat', String(texte), ACCENT);
  } else if (!structured.length && !parametres.length) {
    kit.paragraph('Résultats non encore disponibles.', { italic: true, color: MUTED });
  }

  if (analyse.observations) {
    kit.section('Interprétation & observations');
    kit.paragraph(analyse.observations);
  }

  kit.signatures([{ title: 'Le biologiste / technicien', name: fullName(analyse?.technicien) || undefined }], {
    leftNote: [`Validé le ${analyse.date_resultat ? formatDate(analyse.date_resultat, 'long') : '—'}`, `Réf. ${ref}`],
  });

  return kit.finish({
    notice: "Résultats à interpréter par le médecin prescripteur en fonction du contexte clinique  •  Document confidentiel",
    printedBy,
    printedAt,
  });
}

// =====================================================
// 6. Convocation / rendez-vous
// =====================================================

export async function buildAppointmentDocumentPdf(model: AppointmentDocumentModel) {
  const { rendezVous, printedBy, printedAt } = model;
  const kit = await DocumentKit.create();
  const { doc, margin, contentWidth } = kit;

  const patient = rendezVous?.patients || rendezVous?.patient || {};
  const medecin = rendezVous?.personnel || rendezVous?.medecin || {};
  const ref = shortRef('RDV', rendezVous?.id, rendezVous?.date_heure);
  const hasMedecin = Boolean(medecin?.nom || medecin?.prenom);

  kit.letterhead({
    title: 'CONVOCATION — RENDEZ-VOUS',
    meta: `N° ${ref}${rendezVous.numero_queue ? `   •   Ticket n° ${rendezVous.numero_queue}` : ''}`,
    service: 'Accueil & prise de rendez-vous',
    right: {
      heading: hasMedecin ? doctorName(medecin) : 'Médecin à désigner',
      sub: medecin?.specialite || 'Consultation',
      caption: 'Praticien',
    },
    shortTitle: 'Convocation',
    reference: `N° ${ref}`,
  });

  kit.infoCard(patientCardRows(patient));

  // Grand encadré date / heure
  const top = kit.y - 2;
  const h = 40;
  kit.fill(NAVY);
  doc.roundedRect(margin, top, contentWidth, h, 3, 3, 'F');
  kit.fill(ACCENT);
  doc.roundedRect(margin, top + h - 3, contentWidth, 3, 1.5, 1.5, 'F');

  const d = new Date(rendezVous.date_heure || Date.now());
  // Pavé « calendrier »
  kit.fill([255, 255, 255]);
  doc.roundedRect(margin + 8, top + 6, 26, 26, 2, 2, 'F');
  kit.fill(ACCENT);
  doc.rect(margin + 8, top + 6, 26, 7, 'F');
  kit.color([255, 255, 255]).font('bold', 7);
  doc.text(d.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase().replace('.', ''), margin + 21, top + 11, { align: 'center' });
  kit.color(NAVY).font('bold', 16);
  doc.text(String(d.getDate()), margin + 21, top + 24, { align: 'center' });
  kit.color(MUTED).font('normal', 6.5);
  doc.text(String(d.getFullYear()), margin + 21, top + 29.5, { align: 'center' });

  kit.color([186, 230, 253]).font('bold', 7.5);
  doc.text('VOUS ÊTES ATTENDU(E) LE', margin + 42, top + 12, { charSpace: 0.6 });
  kit.color([255, 255, 255]).font('bold', 15);
  doc.text(capitalize(formatDate(d, 'full')), margin + 42, top + 21);
  kit.color([203, 213, 225]).font('normal', 10);
  doc.text(`à ${formatTime(d)}${rendezVous.duree_minutes ? `  •  durée prévue ${rendezVous.duree_minutes} min` : ''}`, margin + 42, top + 28);
  kit.y = top + h + 12;

  kit.section('Détails du rendez-vous');
  kit.keyValues([
    { label: 'Motif', value: rendezVous.motif || 'Non renseigné' },
    { label: 'Type', value: capitalize(rendezVous.type || 'consultation') },
    { label: 'Praticien', value: hasMedecin ? doctorName(medecin) : 'À désigner' },
    { label: 'Statut', value: capitalize(rendezVous.statut || 'planifié') },
  ]);

  if (rendezVous.notes) {
    kit.section('Observations');
    kit.paragraph(rendezVous.notes);
  }

  kit.section('À savoir avant votre venue');
  [
    'Merci de vous présenter à l’accueil 15 minutes avant l’heure du rendez-vous.',
    'Munissez-vous de cette convocation, de votre pièce d’identité et de votre carte d’assurance le cas échéant.',
    'Apportez vos ordonnances, résultats d’examens et comptes rendus antérieurs.',
    'En cas d’empêchement, merci de prévenir l’établissement au moins 24 heures à l’avance.',
  ].forEach((line) => {
    kit.ensure(6);
    kit.fill(ACCENT);
    doc.circle(margin + 1.5, kit.y - 1.2, 0.9, 'F');
    kit.paragraph(line, { indent: 5 });
    kit.y -= 2.5;
  });

  if (rendezVous.type === 'urgence') {
    kit.ensure(26);
    kit.stamp('URGENT', DANGER, kit.pageWidth - kit.margin - 28, kit.y + 8);
  }

  return kit.finish({
    notice: 'Convocation personnelle  •  À présenter à l’accueil le jour du rendez-vous',
    printedBy,
    printedAt,
  });
}

// =====================================================
// 7. Ordonnance médicale
// =====================================================

export async function buildPrescriptionDocumentPdf(model: PrescriptionDocumentModel) {
  const { consultation, prescriptions, prescriptionDate, printedBy, printedAt } = model;
  const kit = await DocumentKit.create();
  const { doc, margin, pageWidth, contentWidth } = kit;

  const patient = consultation?.patients || {};
  const medecin = consultation?.personnel || {};
  const ordDate = new Date(prescriptionDate || consultation?.date_consultation || Date.now());
  const ordNumber = shortRef('ORD', consultation?.id, ordDate);

  kit.letterhead({
    title: 'ORDONNANCE MÉDICALE',
    meta: `N° ${ordNumber}   •   Délivrée le ${formatDate(ordDate, 'long')}`,
    service: 'Service de consultation',
    right: { heading: doctorName(medecin), sub: medecin.specialite || 'Médecine générale', caption: 'Médecin prescripteur' },
    shortTitle: 'Ordonnance médicale',
    reference: `${fullName(patient)}  •  N° ${ordNumber}`,
  });

  const constantes = consultation?.constantes || {};
  kit.infoCard(patientCardRows(patient, [
    { label: 'Poids', value: constantes.poids ? `${constantes.poids} kg` : '—', w: 0.14 },
  ]));
  kit.y += 4;

  // Symbole Rp/
  kit.color(ACCENT).font('bolditalic', 24, 'times');
  doc.text('Rp/', margin, kit.y);
  kit.y += 9;

  const items = (prescriptions || []).filter((p: any) => p?.statut !== 'annulée');
  if (items.length === 0) {
    kit.color(MUTED).font('italic', 10);
    doc.text('Aucun médicament prescrit à cette date.', margin + 10, kit.y);
    kit.y += 10;
  }

  const textX = margin + 11;
  const textW = contentWidth - 11;

  items.forEach((pres: any, index: number) => {
    const nom = pres.medicament?.nom_commercial || pres.nom_medicament || 'Médicament';
    const forme = pres.medicament?.forme ? ` — ${pres.medicament.forme}` : '';
    const titre = `${nom}${pres.dosage ? ` ${pres.dosage}` : ''}`;
    const voie = VOIES_ADMINISTRATION[pres.voie_administration] || pres.voie_administration || '';

    const posologie = [pres.frequence, pres.duree ? `pendant ${pres.duree}` : ''].filter(Boolean).join(', ');
    kit.font('normal', 9.5);
    const posoLines = kit.wrap(posologie || '—', textW);
    kit.font('italic', 8.8);
    const instrLines = pres.instructions ? kit.wrap(`NB : ${pres.instructions}`, textW) : [];

    const blockH = 7 + posoLines.length * 4.6 + (voie ? 4.6 : 0) + instrLines.length * 4.2 + 6;
    kit.ensure(blockH);
    let y = kit.y;

    // Pastille numérotée
    kit.fill(NAVY);
    doc.circle(margin + 3.8, y - 1.3, 3.4, 'F');
    kit.color([255, 255, 255]).font('bold', 8.5);
    doc.text(String(index + 1), margin + 3.8, y, { align: 'center' });

    // Nom du médicament
    kit.color(INK).font('bold', 11.5);
    doc.text(titre, textX, y);
    if (forme) {
      const w = doc.getTextWidth(titre);
      kit.color(MUTED).font('normal', 9);
      doc.text(forme, textX + w + 1, y);
    }
    let ly = y + 6;

    kit.color(BODY).font('normal', 9.5);
    doc.text(posoLines, textX, ly);
    ly += posoLines.length * 4.6;

    if (voie) {
      kit.color(ACCENT).font('bold', 8);
      doc.text(voie.toUpperCase(), textX, ly, { charSpace: 0.3 });
      ly += 4.6;
    }

    if (instrLines.length) {
      kit.color(MUTED).font('italic', 8.8);
      doc.text(instrLines, textX, ly);
      ly += instrLines.length * 4.2;
    }

    y = ly + 2;
    if (index < items.length - 1) {
      kit.stroke(LINE, 0.2);
      kit.dashed(true);
      doc.line(textX, y - 1, pageWidth - margin, y - 1);
      kit.dashed(false);
    }
    kit.y = y + 6;
  });

  kit.signatures([{ title: 'Signature et cachet du médecin', name: doctorName(medecin) }], {
    leftNote: [
      `Fait le ${formatDate(ordDate, 'long')}`,
      `${items.length} médicament${items.length > 1 ? 's' : ''} prescrit${items.length > 1 ? 's' : ''}`,
    ],
  });

  return kit.finish({
    notice: 'Ordonnance valable 3 mois à compter de sa date d’émission  •  Respecter strictement les doses prescrites  •  Tenir hors de portée des enfants',
    printedBy,
    printedAt,
  });
}

// =====================================================
// 8. Facture
// =====================================================

export async function buildFullInvoiceDocumentPdf(model: FullInvoiceDocumentModel) {
  const { facture, lignes, paiements, printedBy, printedAt } = model;
  const kit = await DocumentKit.create();
  const { margin } = kit;
  const patient = facture?.patients || {};

  const allLignes: any[] = lignes && lignes.length > 0 ? lignes : facture?.lignes_facture || [];
  const allPaiements: any[] = (paiements && paiements.length > 0 ? paiements : facture?.paiements || [])
    .slice()
    .sort((a: any, b: any) => new Date(a.date_paiement).getTime() - new Date(b.date_paiement).getTime());

  const totalBrut = toNumber(facture?.montant_total) || allLignes.reduce((s, l) => s + toNumber(l.montant), 0);
  const assurance = toNumber(facture?.montant_assurance);
  const netPatient = toNumber(facture?.montant_patient ?? totalBrut);
  const totalPaye = allPaiements.reduce((s, p) => s + toNumber(p?.montant), 0);
  const reste = Math.max(netPatient - totalPaye, 0);
  const numero = facture?.numero_facture || shortRef('FAC', facture?.id, facture?.date_facture);

  kit.letterhead({
    title: 'FACTURE',
    meta: `N° ${numero}   •   Émise le ${formatDate(facture?.date_facture, 'long')}`,
    service: 'Service de facturation & caisse',
    right: { heading: 'Service financier', sub: `Statut : ${capitalize(facture?.statut || 'en attente')}`, caption: 'Facturation patient' },
    shortTitle: 'Facture',
    reference: `N° ${numero}`,
  });

  kit.infoCard([
    [
      { label: 'Facturé à', value: fullName(patient) || 'Non renseigné', w: 0.36 },
      { label: 'N° dossier', value: patient.code_patient || '—', w: 0.22 },
      { label: 'Téléphone', value: patient.telephone || '—', w: 0.2 },
      { label: 'Date', value: formatDate(facture?.date_facture), w: 0.22 },
    ],
    [
      { label: 'Adresse', value: patient.adresse || '—', w: 1 },
    ],
  ]);

  kit.section('Détail des prestations');
  kit.table(
    [
      { header: 'N°', width: 6, align: 'center' },
      { header: 'Désignation', width: 46 },
      { header: 'Qté', width: 8, align: 'center' },
      { header: 'Prix unitaire', width: 19, align: 'right' },
      { header: 'Montant', width: 21, align: 'right' },
    ],
    allLignes.map((l: any, i: number) => [
      String(i + 1),
      `${l.description || 'Prestation'}${l.code_acte ? ` (${l.code_acte})` : ''}`,
      String(toNumber(l.quantite)),
      formatMoney(l.prix_unitaire),
      formatMoney(l.montant),
    ]),
    { emptyText: 'Aucune prestation facturée.' }
  );

  const totalsTop = kit.y;
  const totalsEnd = kit.totals([
    { label: 'Total brut', value: formatMoney(totalBrut) },
    ...(assurance > 0 ? [{ label: 'Prise en charge assurance', value: `- ${formatMoney(assurance)}`, tone: ACCENT }] : []),
    ...(toNumber(facture?.tva) > 0 ? [{ label: 'TVA', value: formatMoney(facture.tva) }] : []),
    { label: 'Déjà payé', value: formatMoney(totalPaye), tone: SUCCESS },
    { label: 'Net à payer (patient)', value: formatMoney(netPatient), emphasis: true },
  ]);

  // Montant en lettres + tampon à gauche des totaux
  kit.color(MUTED).font('bold', 6.8);
  kit.doc.text('ARRÊTÉE LA PRÉSENTE FACTURE À LA SOMME DE', margin, totalsTop, { charSpace: 0.3 });
  kit.color(INK).font('italic', 9);
  kit.doc.text(kit.wrap(`${amountInWords(netPatient)}.`, 82), margin, totalsTop + 5);
  if (facture?.statut === 'payée' || (netPatient > 0 && reste <= 0)) kit.stamp('PAYÉE', SUCCESS, margin + 30, totalsTop + 24);
  else if (facture?.statut === 'annulée') kit.stamp('ANNULÉE', DANGER, margin + 30, totalsTop + 24);
  else if (totalPaye > 0) kit.stamp(`RESTE ${formatMoney(reste)}`, WARNING, margin + 38, totalsTop + 24);
  kit.y = Math.max(totalsEnd, totalsTop + 34) + 6;

  if (allPaiements.length) {
    kit.section(`Règlements reçus (${allPaiements.length})`);
    kit.table(
      [
        { header: 'Date', width: 28 },
        { header: 'Mode', width: 24 },
        { header: 'Référence', width: 26 },
        { header: 'Montant', width: 22, align: 'right' },
      ],
      allPaiements.map((p: any) => [
        formatDateTime(p.date_paiement),
        modePaiementLabel(p.mode_paiement),
        p.reference || '—',
        formatMoney(p.montant),
      ])
    );
  }

  kit.signatures([
    { title: 'Visa de la caisse', name: [printedBy?.prenom, printedBy?.nom].filter(Boolean).join(' ') || undefined },
  ], {
    leftNote: [reste > 0 ? `Reste à payer : ${formatMoney(reste)}` : 'Facture entièrement réglée', `Facture N° ${numero}`],
  });

  return kit.finish({
    notice: 'Merci de votre confiance  •  Tout paiement doit faire l’objet d’un reçu officiel délivré par la caisse',
    printedBy,
    printedAt,
  });
}
