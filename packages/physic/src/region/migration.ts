import { Entity } from '../physics/Entity';
import { Region } from './Region';

/**
 * Entity migration information
 */
export interface EntityMigration {
  /** Entity being migrated */
  entity: Entity;
  /** Source region */
  fromRegion: Region;
  /** Destination region */
  toRegion: Region;
}

/**
 * Migration handler type
 */
export type MigrationHandler = (migration: EntityMigration) => void;

/**
 * Migration utilities for entity transfer between regions
 */

/**
 * Migrates an entity from one region to another
 * 
 * @param entity - Entity to migrate
 * @param fromRegion - Source region
 * @param toRegion - Destination region
 * @param handler - Optional migration handler
 */
export function migrateEntity(
  entity: Entity,
  fromRegion: Region,
  toRegion: Region,
  handler?: MigrationHandler
): void {
  fromRegion.removeEntity(entity);
  toRegion.addEntity(entity);

  if (handler) {
    handler({
      entity,
      fromRegion,
      toRegion,
    });
  }
}

/**
 * Migrates multiple entities
 * 
 * @param migrations - Array of migration information
 * @param handler - Optional migration handler
 */
export function migrateEntities(
  migrations: EntityMigration[],
  handler?: MigrationHandler
): void {
  for (const migration of migrations) {
    migrateEntity(
      migration.entity,
      migration.fromRegion,
      migration.toRegion,
      handler
    );
  }
}

