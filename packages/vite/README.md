# @rpgjs/vite

Plugins Vite pour RPGJS.

## dataFolderPlugin

Plugin qui permet de servir un dossier de données en mode développement et de le copier dans le dossier assets lors du build.

### Utilisation

```typescript
import { defineConfig } from 'vite';
import { dataFolderPlugin } from '@rpgjs/vite';

export default defineConfig({
  plugins: [
    dataFolderPlugin({
      sourceFolder: './game-data',
      publicPath: '/data',
      buildOutputPath: 'assets/data'
    })
  ]
});
```

### Options

- `sourceFolder` (string) : Dossier source contenant les fichiers de données (TMX, TSX, images)
- `publicPath` (string, optionnel) : Préfixe du chemin public pour accéder aux fichiers de données (défaut: '/data')
- `buildOutputPath` (string, optionnel) : Dossier cible dans la sortie de build (défaut: 'assets/data')
- `allowedExtensions` (string[], optionnel) : Extensions de fichiers autorisées (défaut: ['.tmx', '.tsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

### Fonctionnement

**Mode développement :**
- Sert les fichiers via un middleware Vite
- Accessible via des requêtes HTTP au chemin public configuré
- Exemple : `http://localhost:3000/data/maps/level1.tmx`

**Mode build :**
- Copie automatiquement tous les fichiers autorisés dans le dossier de sortie
- Les fichiers sont disponibles dans le dossier `assets/data` du build final

### Types de fichiers supportés

- **TMX** : Fichiers de cartes Tiled
- **TSX** : Fichiers de tilesets Tiled  
- **Images** : PNG, JPG, JPEG, GIF, WebP, SVG 
## directivePlugin

Plugin inspiré de Next.js permettant d'utiliser les directives `use client` et `use server` afin de générer un code différent selon le côté client ou serveur.

### Utilisation

```typescript
import { defineConfig } from 'vite'
import { directivePlugin } from '@rpgjs/vite'

export default defineConfig({
  plugins: [
    directivePlugin({ side: 'client' }) // ou 'server'
  ]
})
```

La directive placée en début de fichier ou au sein d'une fonction permet d'inclure ou non le code lors de la transformation.
