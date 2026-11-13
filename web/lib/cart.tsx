'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Panier multi-dépôts, gardé dans le téléphone (localStorage) : on peut le remplir sans être connecté.
 * Les prix enregistrés ici servent seulement à l'affichage : ils sont relus à la validation, et l'API
 * recalcule tout au moment de créer les commandes.
 */
export const MAX_STORES = 3;
const KEY = 'igaz.cart';

export interface CartLine {
  productId: string;
  kind: 'PURCHASE' | 'EXCHANGE';
  quantity: number;
  unitPrice: number;
  maxQty: number;
  brandId: string;
  brandName: string;
  cylinderTypeId: string;
  label: string;
  capacityKg: number;
  storeId: string;
  storeName: string;
  /** Photo du produit envoyée par le dépôt, au moment de l'ajout. */
  photo?: string | null;
}

export interface CartGroup { storeId: string; storeName: string; lines: CartLine[]; subtotal: number }

interface Cart {
  ready: boolean;
  lines: CartLine[];
  groups: CartGroup[];
  count: number;
  subtotal: number;
  /** Ajoute (ou cumule) une ligne. Retourne un message si le panier a déjà 3 autres dépôts. */
  add: (line: CartLine) => string | null;
  setQuantity: (productId: string, kind: CartLine['kind'], quantity: number) => void;
  /** Met à jour le prix et le stock connus d'un produit (relus à la validation). */
  refresh: (productId: string, patch: { purchasePrice: number; exchangePrice: number; maxQty: number }) => void;
  remove: (productId: string, kind: CartLine['kind']) => void;
  removeStore: (storeId: string) => void;
  clear: () => void;
}

const Ctx = createContext<Cart | null>(null);
const same = (l: CartLine, productId: string, kind: CartLine['kind']) => l.productId === productId && l.kind === kind;

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(saved)) setLines(saved);
    } catch { /* panier illisible ou stockage indisponible : on repart d'un panier vide */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* navigation privée : panier non conservé */ }
  }, [lines, ready]);

  const add = useCallback((line: CartLine) => {
    const stores = new Set(lines.map((l) => l.storeId));
    if (!stores.has(line.storeId) && stores.size >= MAX_STORES) {
      return `Votre panier contient déjà ${MAX_STORES} dépôts. Validez-le ou retirez un dépôt pour en ajouter un autre.`;
    }
    setLines((cur) => {
      const existing = cur.find((l) => same(l, line.productId, line.kind));
      if (!existing) return [...cur, line];
      return cur.map((l) => (l === existing
        ? { ...line, quantity: Math.min(line.maxQty, l.quantity + line.quantity) }
        : l));
    });
    return null;
  }, [lines]);

  const setQuantity = useCallback((productId: string, kind: CartLine['kind'], quantity: number) => {
    setLines((cur) => cur.map((l) => (same(l, productId, kind) ? { ...l, quantity: Math.max(1, Math.min(l.maxQty, quantity)) } : l)));
  }, []);
  const refresh = useCallback((productId: string, p: { purchasePrice: number; exchangePrice: number; maxQty: number }) => {
    setLines((cur) => {
      let changed = false;
      const next = cur.map((l) => {
        if (l.productId !== productId) return l;
        const unitPrice = l.kind === 'EXCHANGE' ? p.exchangePrice : p.purchasePrice;
        if (unitPrice === l.unitPrice && p.maxQty === l.maxQty) return l;
        changed = true;
        return { ...l, unitPrice, maxQty: p.maxQty };
      });
      return changed ? next : cur;
    });
  }, []);
  const remove = useCallback((productId: string, kind: CartLine['kind']) => {
    setLines((cur) => cur.filter((l) => !same(l, productId, kind)));
  }, []);
  const removeStore = useCallback((storeId: string) => setLines((cur) => cur.filter((l) => l.storeId !== storeId)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<Cart>(() => {
    const map = new Map<string, CartGroup>();
    for (const l of lines) {
      const g = map.get(l.storeId) ?? { storeId: l.storeId, storeName: l.storeName, lines: [], subtotal: 0 };
      g.lines.push(l);
      g.subtotal += l.unitPrice * l.quantity;
      map.set(l.storeId, g);
    }
    const groups = [...map.values()];
    return {
      ready, lines, groups, add, setQuantity, refresh, remove, removeStore, clear,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: groups.reduce((n, g) => n + g.subtotal, 0),
    };
  }, [ready, lines, add, setQuantity, refresh, remove, removeStore, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error('CartProvider manquant');
  return v;
}
