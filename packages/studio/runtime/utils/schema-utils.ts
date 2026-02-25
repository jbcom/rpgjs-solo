import { defaultComposer, setConfig } from './default-composer';

/**
 * Utility functions for manipulating JSON schemas
 * 
 * These functions help with common operations on JSON schemas:
 * - Merging two schemas
 * - Removing elements from a schema
 */

/**
 * Merges two JSON schemas together
 * 
 * This function uses the default-composer library to merge two JSON schemas.
 * The base schema is used as a foundation, and the override schema is applied on top.
 * Properties from the override schema take precedence over the base schema.
 * 
 * @param baseSchema - The base JSON schema
 * @param overrideSchema - The schema to override the base schema
 * @returns The merged JSON schema
 * 
 * @example
 * ```typescript
 * const baseSchema = {
 *   type: 'object',
 *   required: ['name'],
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' }
 *   }
 * };
 * 
 * const overrideSchema = {
 *   required: ['name', 'email'],
 *   properties: {
 *     email: { type: 'string', format: 'email' },
 *     age: { type: 'number', minimum: 18 }
 *   }
 * };
 * 
 * const mergedSchema = mergeJsonSchemas(baseSchema, overrideSchema);
 * // Result:
 * // {
 * //   type: 'object',
 * //   required: ['name', 'email'],
 * //   properties: {
 * //     name: { type: 'string' },
 * //     email: { type: 'string', format: 'email' },
 * //     age: { type: 'number', minimum: 18 }
 * //   }
 * // }
 * ```
 */
export function mergeJsonSchemas(
  baseSchema: Record<string, any>,
  overrideSchema: Record<string, any>
): Record<string, any> {
  // Configure default-composer to merge arrays
  setConfig({ mergeArrays: true });
  
  // Special handling for 'required' arrays - we want to merge them
  const baseRequired = baseSchema.required || [];
  const overrideRequired = overrideSchema.required || [];
  const mergedRequired = [...new Set([...baseRequired, ...overrideRequired])];
  
  // Special handling for properties - we need to merge nested properties
  const baseProperties = baseSchema.properties || {};
  const overrideProperties = overrideSchema.properties || {};
  const mergedProperties: Record<string, any> = { ...baseProperties };
  
  // Merge properties recursively
  for (const [key, value] of Object.entries(overrideProperties)) {
    if (key in baseProperties && 
        typeof baseProperties[key] === 'object' && 
        baseProperties[key] !== null &&
        typeof value === 'object' &&
        value !== null) {
      // Recursively merge nested objects
      mergedProperties[key] = mergeJsonSchemas(baseProperties[key], value);
    } else {
      // Override or add property
      mergedProperties[key] = value;
    }
  }
  
  // Create a new schema with merged properties and required fields
  const result = defaultComposer(
    { ...baseSchema },
    { ...overrideSchema, required: mergedRequired, properties: mergedProperties }
  );
  
  // Reset config to default
  setConfig({ mergeArrays: false });
  
  return result;
}

/**
 * Removes elements from a JSON schema
 * 
 * This function allows removing specific properties, required fields,
 * or other elements from a JSON schema.
 * 
 * @param schema - The original JSON schema
 * @param options - Options for removal
 * @param options.properties - Array of property names to remove
 * @param options.required - Array of required field names to remove
 * @param options.paths - Array of JSON paths to remove (e.g., 'properties.user.properties.email')
 * @returns A new JSON schema with the specified elements removed
 * 
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   required: ['name', 'email', 'age'],
 *   properties: {
 *     name: { type: 'string' },
 *     email: { type: 'string', format: 'email' },
 *     age: { type: 'number' },
 *     address: {
 *       type: 'object',
 *       properties: {
 *         street: { type: 'string' },
 *         city: { type: 'string' },
 *         zip: { type: 'string' }
 *       }
 *     }
 *   }
 * };
 * 
 * const reducedSchema = removeFromJsonSchema(schema, {
 *   properties: ['age'],
 *   required: ['email'],
 *   paths: ['properties.address.properties.zip']
 * });
 * // Result:
 * // {
 * //   type: 'object',
 * //   required: ['name', 'age'],
 * //   properties: {
 * //     name: { type: 'string' },
 * //     email: { type: 'string', format: 'email' },
 * //     address: {
 * //       type: 'object',
 * //       properties: {
 * //         street: { type: 'string' },
 * //         city: { type: 'string' }
 * //       }
 * //     }
 * //   }
 * // }
 * ```
 */
export function removeFromJsonSchema(
  schema: Record<string, any>,
  options: {
    properties?: string[];
    required?: string[];
    paths?: string[];
  }
): Record<string, any> {
  // Create a deep copy of the schema to avoid modifying the original
  const result = JSON.parse(JSON.stringify(schema));
  
  // Remove properties
  if (options.properties && result.properties) {
    for (const prop of options.properties) {
      delete result.properties[prop];
    }
  }
  
  // Remove required fields
  if (options.required && result.required) {
    result.required = result.required.filter(
      (field: string) => !options.required?.includes(field)
    );
    
    // If required array is empty, remove it
    if (result.required.length === 0) {
      delete result.required;
    }
  }
  
  // Remove elements by path
  if (options.paths) {
    for (const path of options.paths) {
      const parts = path.split('.');
      let current = result;
      
      // Navigate to the parent of the element to remove
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          // Path doesn't exist, skip
          break;
        }
        current = current[parts[i]];
      }
      
      // Remove the element
      const lastPart = parts[parts.length - 1];
      if (current && current[lastPart] !== undefined) {
        delete current[lastPart];
      }
    }
  }
  
  return result;
}

/**
 * Extracts a subset of a JSON schema based on specified properties
 * 
 * This function creates a new schema that only includes the specified properties
 * and their definitions from the original schema.
 * 
 * @param schema - The original JSON schema
 * @param propertyNames - Array of property names to include in the result
 * @returns A new JSON schema with only the specified properties
 * 
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   required: ['name', 'email', 'age'],
 *   properties: {
 *     name: { type: 'string' },
 *     email: { type: 'string', format: 'email' },
 *     age: { type: 'number' },
 *     address: {
 *       type: 'object',
 *       properties: {
 *         street: { type: 'string' },
 *         city: { type: 'string' }
 *       }
 *     }
 *   }
 * };
 * 
 * const userInfoSchema = extractJsonSchemaSubset(schema, ['name', 'email']);
 * // Result:
 * // {
 * //   type: 'object',
 * //   required: ['name', 'email'],
 * //   properties: {
 * //     name: { type: 'string' },
 * //     email: { type: 'string', format: 'email' }
 * //   }
 * // }
 * ```
 */
export function extractJsonSchemaSubset(
  schema: Record<string, any>,
  propertyNames: string[]
): Record<string, any> {
  // Create a new schema with the same type
  const result: Record<string, any> = {
    type: schema.type
  };
  
  // Copy other schema attributes except properties and required
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'properties' && key !== 'required') {
      result[key] = JSON.parse(JSON.stringify(value));
    }
  }
  
  // Filter required properties
  if (schema.required) {
    result.required = schema.required.filter(
      (prop: string) => propertyNames.includes(prop)
    );
    
    // If required array is empty, remove it
    if (result.required.length === 0) {
      delete result.required;
    }
  }
  
  // Filter properties
  if (schema.properties) {
    result.properties = {};
    
    for (const prop of propertyNames) {
      if (schema.properties[prop]) {
        result.properties[prop] = JSON.parse(JSON.stringify(schema.properties[prop]));
      }
    }
    
    // If properties object is empty, remove it
    if (Object.keys(result.properties).length === 0) {
      delete result.properties;
    }
  }
  
  return result;
}

/**
 * Overrides properties in a JSON schema without merging them.
 * Unlike mergeJsonSchemas, this function completely replaces properties instead of merging them.
 * 
 * @param baseSchema - The base JSON schema to override
 * @param overrideSchema - The schema containing properties that will override the base schema
 * @returns A new JSON schema with overridden properties
 * 
 * @example
 * ```typescript
 * const baseSchema = {
 *   type: 'object',
 *   properties: {
 *     user: {
 *       type: 'object',
 *       properties: {
 *         name: { type: 'string' },
 *         age: { type: 'number' }
 *       }
 *     }
 *   }
 * };
 * 
 * const overrideSchema = {
 *   properties: {
 *     user: {
 *       type: 'object',
 *       properties: {
 *         email: { type: 'string', format: 'email' }
 *       }
 *     }
 *   }
 * };
 * 
 * // The user object will be completely replaced, not merged
 * const result = overrideJsonSchema(baseSchema, overrideSchema);
 * // Result:
 * // {
 * //   type: 'object',
 * //   properties: {
 * //     user: {
 * //       type: 'object',
 * //       properties: {
 * //         email: { type: 'string', format: 'email' }
 * //       }
 * //     }
 * //   }
 * // }
 * ```
 */
export function overrideJsonSchema(
  baseSchema: Record<string, any>,
  overrideSchema: Record<string, any>
): Record<string, any> {
  // Create a deep copy of the base schema
  const result = JSON.parse(JSON.stringify(baseSchema));
  
  // Process each key in the override schema
  for (const key in overrideSchema) {
    if (Object.prototype.hasOwnProperty.call(overrideSchema, key)) {
      const value = overrideSchema[key];
      
      // Special handling for 'required' array - replace completely
      if (key === 'required' && Array.isArray(value)) {
        result[key] = [...value];
        continue;
      }
      
      // For all other properties, directly override
      result[key] = JSON.parse(JSON.stringify(value));
    }
  }
  
  return result;
} 