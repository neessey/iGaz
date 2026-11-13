import { api } from './api';
import { CartLine } from './cart';
import { productPhoto } from './media';
import { Offer, Order } from './types';

/**
 * « Commander à nouveau » : remet dans le panier les bouteilles d'une commande passée, aux prix et au stock
 * d'aujourd'hui. Les bouteilles devenues indisponibles sont signalées, pas ajoutées.
 */
export async function reorder(order: Order, add: (line: CartLine) => string | null) {
  const added: string[] = [];
  const missing: string[] = [];
  for (const item of order.items) {
    const name = `${item.product.brand.name} ${item.product.cylinderType.label}`;
    const offer = await api<Offer>(`/products/${item.productId}`).catch(() => null);
    const stock = offer?.inventory?.quantity ?? 0;
    if (!offer || offer.available === false || stock <= 0) { missing.push(name); continue; }
    const maxQty = Math.min(stock, 10);
    const problem = add({
      productId: offer.id, kind: item.kind, quantity: Math.min(item.quantity, maxQty),
      unitPrice: item.kind === 'EXCHANGE' ? offer.exchangePrice : offer.purchasePrice, maxQty,
      brandId: offer.brandId, brandName: offer.brand.name, cylinderTypeId: offer.cylinderTypeId,
      label: offer.cylinderType.label, capacityKg: offer.cylinderType.capacityKg,
      storeId: offer.store.id, storeName: offer.store.name, photo: productPhoto(offer),
    });
    if (problem) return { added, missing, error: problem };
    added.push(name);
  }
  return { added, missing, error: null as string | null };
}
