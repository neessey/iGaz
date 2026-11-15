/**
 * Informations légales et contacts du support. iGaz CI est le nom commercial d'un service exploité par la société
 * Alees (société familiale du fondateur). Tant qu'un champ vaut null, les pages concernées affichent « à compléter ».
 * Les textes des pages /confidentialite et /conditions sont des modèles : relecture juridique conseillée.
 */
export const COMPANY = {
  brand: 'iGaz CI',
  legalName: 'Alees' as string | null,                                  // raison sociale
  rccm: 'CI-ABJ-03-2021-B12-05029' as string | null,                    // numéro RCCM
  address: 'Cocody, Angré 8e tranche, Abidjan' as string | null,        // adresse du siège
  email: 'contact.devyans@gmail.com' as string | null,                  // contact (provisoire : une adresse dédiée à iGaz est prévue)
  phone: '+2250104409292' as string | null,                             // téléphone du support
  whatsapp: '2250104409292' as string | null,                           // WhatsApp du support (même numéro), sans +
  dataContact: 'yanisseliesey@gmail.com' as string | null,              // demandes sur les données personnelles
};

/** Date de la dernière mise à jour des textes légaux (affichée en tête des pages). */
export const LEGAL_UPDATED = '15 novembre 2026';
