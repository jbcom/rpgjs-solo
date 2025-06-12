# Battle AI System

Le système d'IA de combat de RPGJS permet de créer des ennemis intelligents qui peuvent détecter, poursuivre et attaquer les joueurs automatiquement. Ce guide explique comment utiliser et personnaliser ce système.

## Vue d'ensemble

Le système d'IA de combat fournit :

- **Détection de vision** : Les ennemis peuvent détecter les joueurs dans un rayon défini
- **Poursuite intelligente** : Mouvement automatique vers les cibles détectées
- **Système d'attaque** : Attaques automatiques avec hitboxes et dégâts
- **Gestion de la santé** : Points de vie et mort des ennemis
- **Nettoyage automatique** : Suppression des ennemis morts de la carte

## Architecture

```
┌─────────────────┐       ┌───────────────────┐         ┌───────────────┐
│ Event Hooks     │ uses  │ BattleAi Class    │ manages │ AI Behavior   │
│ (onInit, etc.)  │──────▶│ (vision, combat)  │─────────▶ (move, attack) │
└─────────────────┘       └───────────────────┘         └───────────────┘
```

## Utilisation de base

### Appliquer l'IA à un événement

```typescript
import { BattleAi } from "./ai";
import { RpgEvent } from "@rpgjs/server";

// Créer une instance d'IA
const battleAi = new BattleAi(context);

// Appliquer l'IA à un événement
battleAi.applyAt(event);
```

### Configuration personnalisée

```typescript
// Ennemi avec statistiques personnalisées
battleAi.applyAt(event, {
    health: 150,           // Points de vie
    attackDamage: 25,      // Dégâts d'attaque
    attackCooldown: 800,   // Délai entre attaques (ms)
    visionRange: 200,      // Portée de vision
    attackRange: 60        // Portée d'attaque
});
```

## Intégration avec les hooks

### Hook onInit

Applique automatiquement l'IA lors de la création d'événements :

```typescript
export default defineModule<RpgServer>({
    event: {
        onInit(event: RpgEvent) {
            // Appliquer l'IA à tous les nouveaux événements
            battleAi.applyAt(event, {
                health: 80,
                attackDamage: 15,
                visionRange: 120
            });
        }
    }
});
```

### Hooks de détection

Gère la détection des joueurs :

```typescript
export default defineModule<RpgServer>({
    event: {
        onDetectInShape(event: RpgEvent, player: RpgPlayer, shape: any) {
            // Le joueur entre dans la vision de l'IA
            battleAi.onDetectInShape(event, player, shape);
        },
        
        onDetectOutShape(event: RpgEvent, player: RpgPlayer, shape: any) {
            // Le joueur sort de la vision de l'IA
            battleAi.onDetectOutShape(event, player, shape);
        }
    }
});
```

## Système de combat joueur

### Attaque des ennemis IA

```typescript
export default defineModule<RpgServer>({
    player: {
        onInput(player: RpgPlayer, input: any) {
            if (input.input && input.input.includes('action')) {
                // Créer une hitbox d'attaque basée sur la direction
                const direction = player.getDirection();
                let hitboxes = [];
                
                switch (direction) {
                    case 'up':
                        hitboxes = [{ x: -16, y: -48, width: 32, height: 32 }];
                        break;
                    case 'down':
                        hitboxes = [{ x: -16, y: 16, width: 32, height: 32 }];
                        break;
                    case 'left':
                        hitboxes = [{ x: -48, y: -16, width: 32, height: 32 }];
                        break;
                    case 'right':
                        hitboxes = [{ x: 16, y: -16, width: 32, height: 32 }];
                        break;
                }

                player.createMovingHitbox(hitboxes, { speed: 3 }).subscribe({
                    next(hits) {
                        hits.forEach(hit => {
                            if (hit instanceof RpgEvent) {
                                // Infliger des dégâts à l'ennemi IA
                                const defeated = battleAi.damageAi(hit, 30);
                                if (defeated) {
                                    console.log(`Enemy ${hit.id} defeated!`);
                                }
                            }
                        });
                    }
                });
            }
        }
    }
});
```

## Comportements de l'IA

### Détection et poursuite

1. **Vision circulaire** : L'IA détecte les joueurs dans un rayon défini
2. **Poursuite automatique** : Mouvement vers le joueur détecté
3. **Perte de cible** : Arrêt de la poursuite si le joueur sort de la vision

### Système d'attaque

1. **Vérification de portée** : Attaque uniquement si le joueur est à portée
2. **Cooldown d'attaque** : Délai entre les attaques
3. **Hitbox directionnelle** : Attaque dans la direction du joueur
4. **Feedback visuel** : Affichage des dégâts

### Gestion de la mort

1. **Points de vie** : Système de santé avec dégâts
2. **Mort automatique** : Suppression à 0 PV
3. **Nettoyage** : Suppression de la carte et des données

## API de la classe BattleAi

### Méthodes principales

#### `applyAt(event, options)`

Applique l'IA de combat à un événement.

**Paramètres :**
- `event: RpgEvent` - L'événement à transformer
- `options: object` - Configuration optionnelle

**Options disponibles :**
```typescript
{
    health?: number,           // Points de vie (défaut: 100)
    attackDamage?: number,     // Dégâts d'attaque (défaut: 20)
    attackCooldown?: number,   // Délai entre attaques en ms (défaut: 1000)
    visionRange?: number,      // Portée de vision (défaut: 150)
    attackRange?: number       // Portée d'attaque (défaut: 40)
}
```

#### `damageAi(event, damage)`

Inflige des dégâts à un ennemi IA.

**Paramètres :**
- `event: RpgEvent` - L'événement IA à endommager
- `damage: number` - Quantité de dégâts

**Retour :**
- `boolean` - `true` si l'ennemi est mort, `false` sinon

#### `onDetectInShape(event, player, shape)`

Gère la détection d'un joueur entrant dans la vision.

#### `onDetectOutShape(event, player, shape)`

Gère un joueur sortant de la vision.

### Méthodes utilitaires

#### `getAiData(eventId)`

Récupère les données d'IA pour un événement.

```typescript
const aiData = battleAi.getAiData(event.id);
if (aiData) {
    console.log(`Health: ${aiData.health}/${aiData.maxHealth}`);
    console.log(`Target: ${aiData.target?.id || 'none'}`);
}
```

#### `removeAi(eventId)`

Supprime l'IA d'un événement.

```typescript
battleAi.removeAi(event.id);
```

## Exemples d'utilisation

### Ennemi de base

```typescript
// Ennemi simple avec statistiques par défaut
battleAi.applyAt(goblinEvent);
```

### Boss puissant

```typescript
// Boss avec beaucoup de vie et d'attaque
battleAi.applyAt(bossEvent, {
    health: 500,
    attackDamage: 50,
    attackCooldown: 2000,
    visionRange: 300,
    attackRange: 80
});
```

### Garde rapide

```typescript
// Garde avec attaques rapides mais faibles
battleAi.applyAt(guardEvent, {
    health: 60,
    attackDamage: 10,
    attackCooldown: 500,
    visionRange: 100,
    attackRange: 30
});
```

### Archer à distance

```typescript
// Archer avec longue portée
battleAi.applyAt(archerEvent, {
    health: 40,
    attackDamage: 20,
    attackCooldown: 1500,
    visionRange: 250,
    attackRange: 100
});
```

## Bonnes pratiques

### Performance

1. **Limitez le nombre d'IA** : Trop d'ennemis IA peuvent impacter les performances
2. **Ajustez les intervalles** : L'IA se met à jour toutes les 100ms par défaut
3. **Nettoyage automatique** : Le système nettoie automatiquement les IA mortes

### Équilibrage

1. **Testez les statistiques** : Ajustez les valeurs selon la difficulté souhaitée
2. **Variez les comportements** : Utilisez différentes configurations pour différents types d'ennemis
3. **Feedback visuel** : Assurez-vous que les attaques sont visibles pour le joueur

### Débogage

```typescript
// Vérifier l'état d'une IA
const aiData = battleAi.getAiData(event.id);
console.log('AI Status:', {
    health: `${aiData.health}/${aiData.maxHealth}`,
    hasTarget: !!aiData.target,
    targetId: aiData.target?.id
});

// Surveiller les événements
console.log(`AI applied to event ${event.id}`);
console.log(`Player ${player.id} defeated AI ${event.id}`);
```

## Limitations actuelles

1. **Une cible à la fois** : Chaque IA ne peut poursuivre qu'un joueur
2. **Vision circulaire** : Pas de vision conique ou directionnelle
3. **Attaques simples** : Pas de patterns d'attaque complexes
4. **Pas de pathfinding avancé** : Mouvement direct vers la cible

## Extensions possibles

Le système peut être étendu pour inclure :

- Patterns d'attaque multiples
- IA coopérative entre ennemis
- Système d'états (patrouille, alerte, combat)
- Pathfinding intelligent
- Différents types de vision
- Système de spawn automatique 