# @rpgjs/vite

Plugins Vite pour RPGJS.

## tiledMapFolderPlugin

Plugin qui permet de servir un dossier de données en mode développement et de le copier au même chemin public lors du build.

### Utilisation

```typescript
import { defineConfig } from 'vite';
import { tiledMapFolderPlugin } from '@rpgjs/vite';

export default defineConfig({
  plugins: [
    tiledMapFolderPlugin({
      sourceFolder: './game-data',
      publicPath: '/data'
    })
  ]
});
```

### Options

- `sourceFolder` (string) : Dossier source contenant les fichiers de données (TMX, TSX, images)
- `publicPath` (string, optionnel) : Préfixe du chemin public pour accéder aux fichiers de données (défaut: '/data')
- `buildOutputPath` (string, optionnel) : Dossier cible dans la sortie de build. Par défaut, il est dérivé de `publicPath` (`/data` devient `data`). Un chemin explicite doit correspondre au chemin public.
- `allowExternalPublicPathRewrite` (boolean, optionnel) : Autorise un `buildOutputPath` différent uniquement lorsqu'un serveur ou CDN externe réécrit explicitement `publicPath` vers ce dossier. Ne pas l'utiliser pour un hébergement statique comme GitHub Pages.
- `allowedExtensions` (string[], optionnel) : Extensions de fichiers autorisées (défaut: ['.tmx', '.tsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

### Fonctionnement

**Mode développement :**
- Sert les fichiers via un middleware Vite
- Accessible via des requêtes HTTP au chemin public configuré
- Exemple : `http://localhost:3000/data/maps/level1.tmx`

**Mode build :**
- Copie automatiquement tous les fichiers autorisés dans le dossier de sortie
- Les fichiers sont disponibles dans le dossier correspondant au chemin public (`data` pour `/data`) du build final
- Une configuration comme `publicPath: '/map'` avec `buildOutputPath: 'assets/data'` échoue volontairement au build, car elle fonctionne en développement mais produit une carte noire sur un hébergement statique

### Chemin de base Vite

`publicPath` est relatif à [`base`](https://vite.dev/config/shared-options.html#base). Pour GitHub Pages, configurez `base: '/nom-du-depot/'`, émettez les cartes dans `map`, puis utilisez `${import.meta.env.BASE_URL}map` comme `basePath` de `provideTiledMap()`. Vite ne réécrit pas les chaînes construites manuellement pour `fetch()`.

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
