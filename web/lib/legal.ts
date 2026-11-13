/**
 * Informations légales et contacts du support. À COMPLÉTER avant la publication sur le Play Store :
 * tant qu'un champ vaut null, les pages concernées affichent « à compléter » bien en évidence.
 * Les textes des pages /confidentialite et /conditions sont des modèles : à faire relire par un juriste.
 */
export const COMPANY = {
  brand: 'iGaz CI',
  legalName: null as string | null,      // raison sociale (ex. « iGaz CI SARL »)
  rccm: null as string | null,           // numéro RCCM
  address: null as string | null,        // adresse du siège, Abidjan
  email: null as string | null,          // e-mail de contact (exigé par le Play Store)
  phone: null as string | null,          // téléphone du support, format +225…
  whatsapp: null as string | null,       // numéro WhatsApp du support, format 225… (sans +)
  dataContact: null as string | null,    // e-mail pour les demandes sur les données personnelles
};

/** Date de la dernière mise à jour des textes légaux (affichée en tête des pages). */
export const LEGAL_UPDATED = '13 novembre 2026';
