import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Pagination from './Pagination';

afterEach(cleanup);

describe('Pagination', () => {
  it("n'affiche rien pour une liste vide", () => {
    const { container } = render(<Pagination page={1} pageCount={1} total={0} onPageChange={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('indique les lignes affichées et le total', () => {
    render(<Pagination page={2} pageCount={3} total={25} onPageChange={() => {}} label="factures" />);
    expect(screen.getByText('Affichage de 11 à 20 sur 25 factures')).toBeTruthy();
  });

  it('masque les boutons quand tout tient sur une page', () => {
    render(<Pagination page={1} pageCount={1} total={7} onPageChange={() => {}} />);
    expect(screen.queryByText(/Précédent/)).toBeNull();
  });

  it('désactive « Précédent » sur la première page et « Suivant » sur la dernière', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} total={25} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Précédent/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Suivant/ })).toHaveProperty('disabled', false);
    rerender(<Pagination page={3} pageCount={3} total={25} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Suivant/ })).toHaveProperty('disabled', true);
  });

  it('demande la page choisie', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} total={25} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 3);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('abrège les longues listes de pages avec des points de suspension', () => {
    render(<Pagination page={10} pageCount={20} total={200} onPageChange={() => {}} />);
    const numeros = screen.getAllByRole('button').map((b) => b.textContent).filter((t) => /^\d+$/.test(t || ''));
    expect(numeros).toEqual(['1', '9', '10', '11', '20']);
    expect(screen.getAllByText('…')).toHaveLength(2);
  });
});
