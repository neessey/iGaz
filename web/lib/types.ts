export type Role = 'CLIENT' | 'SUPPLIER' | 'ADMIN';
export interface User { id: string; phone: string; name: string | null; role: Role }
export interface Zone { id: string; name: string; city: string; isActive: boolean }
export interface Brand { id: string; name: string; isActive: boolean }
export interface Cylinder { id: string; label: string; capacityKg: number; isActive: boolean }
export interface StoreLite {
  id: string; name: string; address: string; phone: string; opensAt: string; closesAt: string;
  offersDelivery: boolean; offersPickup: boolean; deliveryFee: number; isOpen?: boolean;
  areas?: { zoneId: string }[];
}
export interface Offer {
  id: string; purchasePrice: number; exchangePrice: number; brandId: string; cylinderTypeId: string;
  brand: Brand; cylinderType: Cylinder; inventory: { quantity: number } | null; store: StoreLite; available?: boolean;
  /** Date de la photo envoyée par le dépôt (null : pas de photo). */
  photoUpdatedAt?: string | null;
}
export type OrderStatus =
  | 'PENDING_PAYMENT' | 'SUBMITTED' | 'ACCEPTED' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY'
  | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export interface Order {
  id: string; code: string; status: OrderStatus; fulfillment: 'DELIVERY' | 'PICKUP';
  paymentMethod: 'MOBILE_MONEY' | 'CASH_ON_DELIVERY'; deliveryDetails: string | null;
  subtotal: number; deliveryFee: number; total: number; confirmationCode?: string; createdAt: string;
  /** Frais de service d'iGaz (inclus dans le total). */
  serviceFee?: number;
  /** Part d'iGaz sur la livraison (visible par le dépôt et l'admin seulement). */
  platformShare?: number;
  client?: { name: string | null; phone: string };
  store: { id: string; name: string; address: string; phone: string };
  items: { id: string; productId: string; kind: 'PURCHASE' | 'EXCHANGE'; quantity: number; unitPrice: number;
    product: { id: string; photoUpdatedAt?: string | null; brand: Brand; cylinderType: Cylinder } }[];
  events: { id: string; status: OrderStatus; note: string | null; createdAt: string }[];
  payments: { id: string; method: string; amount: number; status: string }[];
  /** Payée en ligne (paiement propre ou paiement du panier). */
  paidOnline?: boolean;
  /** Panier multi-dépôts d'origine (visible par le client et l'admin seulement). */
  checkout?: { id: string; code: string } | null;
}
export interface Checkout {
  id: string; code: string; paymentMethod: 'MOBILE_MONEY' | 'CASH_ON_DELIVERY'; total: number; createdAt: string;
  orders: Order[];
  payments: { id: string; method: string; amount: number; status: string }[];
}
export interface Address { id: string; zoneId: string; label: string; details: string; zone: Zone }
