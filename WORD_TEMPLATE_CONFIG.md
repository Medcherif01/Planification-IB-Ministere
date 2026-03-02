# Configuration du Template Word pour les Examens

## 📄 Vue d'ensemble

L'application utilise un template Word Google Docs pour générer les documents d'examen. Ce template est configuré de manière centralisée pour faciliter la maintenance.

## 🔧 Configuration actuelle

### URL du template
```
https://docs.google.com/document/d/1Gd7bZPsRNPbL5bpv_Pq6aAcSUgjF_FCR/export?format=docx
```

### Emplacement de la configuration
- **Fichier principal**: `constants.ts`
- **Variable exportée**: `WORD_TEMPLATE_URL`
- **Service utilisateur**: `services/examWordExportService.ts`

## 📝 Structure du code

### constants.ts
```typescript
// URL du template Word pour les examens (depuis variable d'environnement Vercel)
export const WORD_TEMPLATE_URL = "https://docs.google.com/document/d/1Gd7bZPsRNPbL5bpv_Pq6aAcSUgjF_FCR/export?format=docx";
```

### examWordExportService.ts
```typescript
import { WORD_TEMPLATE_URL } from '../constants';

const loadTemplate = async (): Promise<ArrayBuffer> => {
  const templateUrl = WORD_TEMPLATE_URL;
  // ... reste du code
};
```

## 🔄 Comment modifier le template

### Option 1: Modifier directement dans constants.ts
1. Ouvrir le fichier `constants.ts`
2. Modifier la valeur de `WORD_TEMPLATE_URL`
3. Commiter et déployer les modifications

### Option 2: Variable d'environnement Vercel (recommandé pour production)
1. Se connecter à Vercel Dashboard
2. Accéder aux Settings du projet `Plan-IB`
3. Aller dans "Environment Variables"
4. Ajouter/Modifier la variable `WORD_TEMPLATE_URL`
5. Redéployer l'application

**Note**: Pour utiliser les variables d'environnement Vercel, il faudrait modifier le code pour lire `process.env.WORD_TEMPLATE_URL` avec une valeur par défaut.

## ✅ Avantages de cette approche

1. **Centralisation**: Une seule source de vérité pour l'URL du template
2. **Maintenance facile**: Changement en un seul endroit
3. **Import simple**: Tous les services utilisent l'import depuis `constants.ts`
4. **Cache-busting**: Le service ajoute automatiquement un timestamp pour éviter le cache
5. **Logs détaillés**: Affiche l'URL utilisée et la taille du template chargé

## 🔍 Vérification du template

Le service `examWordExportService.ts` vérifie automatiquement:
- La taille du fichier téléchargé (attendu: 68644 bytes)
- La réussite du chargement
- Affiche des logs détaillés en console

## 🚀 Déploiement Vercel

### Variables d'environnement à configurer dans Vercel:
```env
GEMINI_API_KEY=votre_cle_api
MONGO_URL=votre_url_mongodb
WORD_TEMPLATE_URL=https://docs.google.com/document/d/1Gd7bZPsRNPbL5bpv_Pq6aAcSUgjF_FCR/export?format=docx
```

**Note**: `WORD_TEMPLATE_URL` est optionnel car la valeur par défaut est déjà dans `constants.ts`

## 📚 Templates disponibles

### Template d'examen actuel
- **ID Google Docs**: `1Gd7bZPsRNPbL5bpv_Pq6aAcSUgjF_FCR`
- **Format**: .docx
- **Taille**: ~68 KB
- **Contenu**: En-tête d'examen avec champs dynamiques

### Autres templates (pour référence)
- **Plan d'unité**: `144_yUOythmkjTsP9PA4k5YLOpRFyV7Zv`
- **Évaluation**: `15ASfn_LF-jsPh5CYn4FJvEBSpm31hPAA`

## 🛠️ Dépannage

### Le template ne se charge pas
1. Vérifier que l'URL Google Docs est accessible publiquement
2. Vérifier les logs de la console navigateur
3. Vérifier que le document existe et n'a pas été supprimé
4. Essayer de télécharger manuellement l'URL pour tester

### Le document généré est corrompu
1. Vérifier que la taille du template téléchargé est correcte
2. S'assurer que tous les champs du template sont présents
3. Vérifier les logs pour détecter les erreurs de rendu

## 📞 Support

Pour toute question ou problème, vérifier:
1. Les logs de la console (préfixe `[WORD EXPORT]`)
2. La taille du template téléchargé
3. L'accessibilité de l'URL Google Docs
