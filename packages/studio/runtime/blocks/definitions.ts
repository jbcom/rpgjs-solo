
import { variableSchema, itemSchema } from '@common/schemas/database';

/**
 * Common schema for variable modification operations
 * 
 * This schema can be reused across different blocks that need to modify
 * variables, gold, or other numeric values. It provides a consistent
 * interface for both constant and variable-based modifications.
 * 
 * @param allowedOperations - Array of operation types to include in the enum
 * @param valueTitle - Title for the value field (e.g., "Amount", "Value")
 * @param valueDescription - Description for the value field
 * @param variableTitle - Title for the variable field (e.g., "Amount Variable", "Value Variable")
 * @param variableDescription - Description for the variable field
 * @returns A complete schema object for variable modification
 * 
 * @example
 * ```typescript
 * // For gold modification with all operations
 * const goldSchema = createVariableModificationSchema(
 *   ['set', 'add', 'sub', 'mul', 'div', 'mod'],
 *   'Amount',
 *   'Constant amount of gold to modify',
 *   'Amount Variable',
 *   'Variable containing the amount of gold to modify'
 * );
 * 
 * // For health modification with limited operations
 * const healthSchema = createVariableModificationSchema(
 *   ['set', 'add', 'sub'],
 *   'Value',
 *   'Constant health value to modify',
 *   'Value Variable',
 *   'Variable containing the health value to modify'
 * );
 * ```
 */
export function createVariableModificationSchema(
  allowedOperations: readonly string[] = ['set', 'add', 'sub', 'mul', 'div', 'mod'],
  valueTitle: string = 'Value',
  valueDescription: string = 'Constant value to modify',
  variableTitle: string = 'Value Variable',
  variableDescription: string = 'Variable containing the value to modify'
) {
  const operationLabels: Record<string, string> = {
    set: 'Set',
    add: 'Add',
    sub: 'Subtract',
    mul: 'Multiply',
    div: 'Divide',
    mod: 'Modulo'
  };

  const operationDescriptions: Record<string, string> = {
    set: 'Set the value directly',
    add: 'Add to the current value',
    sub: 'Subtract from the current value',
    mul: 'Multiply the current value',
    div: 'Divide the current value',
    mod: 'Get the remainder of division'
  };

  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        title: 'Type',
        enum: ['constant', 'variable'],
        default: 'constant',
        format: {
          radio: true,
          horizontal: true,
          labels: ['Constant', 'Variable'],
        }
      },
      operation: {
        type: 'string',
        title: 'Operation',
        enum: allowedOperations,
        description: 'How to modify the value',
        default: allowedOperations.includes('add') ? 'add' : allowedOperations[0],
        format: {
          labels: allowedOperations.map(op => operationLabels[op] || op),
        }
      }
    },
    allOf: [
      {
        if: {
          properties: {
            type: { const: 'constant' }
          }
        },
        then: {
          properties: {
            amount: {
              type: 'number',
              title: valueTitle,
              description: valueDescription,
              minimum: 0,
              default: 0
            }
          }
        },
        else: {
          properties: {
            amountVariableId: {
              type: 'string',
              title: variableTitle,
              description: variableDescription,
              $ref: '#/functions/variable',
              format: {
                add: {
                  schema: variableSchema
                }
              }
            }
          }
        }
      }
    ]
  };
}

/**
 * Predefined operation sets for common use cases
 * 
 * These sets provide commonly used combinations of operations
 * for different types of variable modifications.
 */
export const OPERATION_SETS = {
  /** All mathematical operations */
  ALL: ['set', 'add', 'sub', 'mul', 'div', 'mod'],
  
  /** Basic arithmetic operations (no modulo) */
  ARITHMETIC: ['set', 'add', 'sub', 'mul', 'div'],
  
  /** Simple addition/subtraction operations */
  ADDITIVE: ['set', 'add', 'sub'],
  
  /** Only set operation */
  SET_ONLY: ['set'],
  
  /** Only additive operations (no set) */
  ADDITIVE_ONLY: ['add', 'sub'],
  
  /** Health/status operations (positive values) */
  HEALTH: ['set', 'add', 'sub'],
  
  /** Currency operations (positive values) */
  CURRENCY: ['set', 'add', 'sub', 'mul']
} as const;

/**
 * Common schema for condition evaluation
 * 
 * This schema can be reused across different blocks that need to evaluate
 * conditions like switches, variables, player properties, etc. It provides
 * a consistent interface for various types of conditions.
 * 
 * @param allowedConditionTypes - Array of condition types to include
 * @param title - Title for the condition field
 * @param description - Description for the condition field
 * @returns A complete schema object for condition evaluation
 * 
 * @example
 * ```typescript
 * // For variable conditions only
 * const variableConditionSchema = createConditionSchema(
 *   ['variable'],
 *   'Variable Condition',
 *   'Check if a variable meets a condition'
 * );
 * 
 * // For all condition types
 * const fullConditionSchema = createConditionSchema(
 *   ['switch', 'variable', 'player', 'gold', 'item'],
 *   'Condition',
 *   'Evaluate a condition'
 * );
 * ```
 */
export function createConditionSchema(
  allowedConditionTypes: readonly string[] = ['switch', 'self_switch', 'variable', 'player', 'gold', 'item', 'level', 'equipped'],
  title: string = 'Condition',
  description: string = 'Evaluate a condition'
) {
  return {
    type: 'object',
    properties: {
      conditionType: {
        type: 'string',
        title: 'Condition Type',
        enum: allowedConditionTypes,
        default: allowedConditionTypes[0],
        description: 'Type of condition to evaluate'
      }
    },
    allOf: [
      // Switch condition
      {
        if: {
          properties: {
            conditionType: { const: 'switch' }
          }
        },
        then: {
          properties: {
            switchId: {
              type: 'string',
              title: 'Switch',
              description: 'Select a switch from the database',
              $ref: '#/functions/variable'
            },
            switchValue: {
              type: 'boolean',
              title: 'Switch State',
              description: 'Expected state of the switch',
              default: true
            }
          },
          required: ['switchId', 'switchValue']
        }
      },
      // Self switch condition
      {
        if: {
          properties: {
            conditionType: { const: 'self_switch' }
          }
        },
        then: {
          properties: {
            selfSwitchName: {
              type: 'string',
              title: 'Self Switch',
              description: 'Select a self switch (A-F)',
              enum: ['A', 'B', 'C', 'D', 'E', 'F'],
              default: 'A',
              format: {
                labels: ['A', 'B', 'C', 'D', 'E', 'F']
              }
            },
            selfSwitchValue: {
              type: 'boolean',
              title: 'Self Switch State',
              description: 'Expected state of the self switch',
              default: true
            }
          },
          required: ['selfSwitchName', 'selfSwitchValue']
        }
      },
      // Variable condition
      {
        if: {
          properties: {
            conditionType: { const: 'variable' }
          }
        },
        then: {
          properties: {
            variableId: {
              type: 'string',
              title: 'Variable',
              description: 'Select a variable from the database',
              $ref: '#/functions/variable'
            },
            comparison: {
              type: 'string',
              title: 'Comparison',
              enum: ['equal', 'not_equal', 'greater', 'greater_equal', 'less', 'less_equal'],
              default: 'equal',
              format: {
                labels: ['Equal to', 'Not equal to', 'Greater than', 'Greater than or equal', 'Less than', 'Less than or equal']
              }
            },
            valueType: {
              type: 'string',
              title: 'Value Type',
              enum: ['constant', 'variable'],
              default: 'constant',
              format: {
                radio: true,
                horizontal: true,
                labels: ['Constant', 'Variable']
              }
            }
          },
          allOf: [
            {
              if: {
                properties: {
                  valueType: { const: 'constant' }
                }
              },
              then: {
                properties: {
                  constantValue: {
                    type: 'number',
                    title: 'Value',
                    description: 'Constant value to compare against',
                    default: 0
                  }
                },
                required: ['constantValue']
              },
              else: {
                properties: {
                  compareVariableId: {
                    type: 'string',
                    title: 'Compare Variable',
                    description: 'Variable to compare against',
                    $ref: '#/functions/variable'
                  }
                },
                required: ['compareVariableId']
              }
            }
          ],
          required: ['variableId', 'comparison', 'valueType']
        }
      },
      // Level condition
      {
        if: {
          properties: {
            conditionType: { const: 'level' }
          }
        },
        then: {
          properties: {
            comparison: {
              type: 'string',
              title: 'Comparison',
              enum: ['equal', 'not_equal', 'greater', 'greater_equal', 'less', 'less_equal'],
              default: 'greater_equal',
              format: {
                labels: ['Equal to', 'Not equal to', 'Greater than', 'Greater than or equal', 'Less than', 'Less than or equal']
              }
            },
            constantValue: {
              type: 'number',
              title: 'Level',
              description: 'Required player level',
              minimum: 1,
              default: 1
            }
          },
          required: ['comparison', 'constantValue']
        }
      },
      // Player condition
      {
        if: {
          properties: {
            conditionType: { const: 'player' }
          }
        },
        then: {
          properties: {
            playerProperty: {
              type: 'string',
              title: 'Player Property',
              enum: ['name', 'direction', 'position'],
              default: 'name',
              format: {
                labels: ['Name', 'Direction', 'Position']
              }
            }
          },
          allOf: [
            {
              if: {
                properties: {
                  playerProperty: { const: 'name' }
                }
              },
              then: {
                properties: {
                  playerName: {
                    type: 'string',
                    title: 'Player Name',
                    description: 'Expected player name',
                    default: ''
                  }
                },
                required: ['playerName']
              },
              else: {
                if: {
                  properties: {
                    playerProperty: { const: 'direction' }
                  }
                },
                then: {
                  properties: {
                    playerDirection: {
                      type: 'string',
                      title: 'Direction',
                      enum: ['up', 'down', 'left', 'right'],
                      default: 'up',
                      format: {
                        labels: ['Up', 'Down', 'Left', 'Right']
                      }
                    }
                  },
                  required: ['playerDirection']
                },
                else: {
                  properties: {
                    playerX: {
                      type: 'number',
                      title: 'X Position',
                      description: 'Expected X coordinate',
                      default: 0
                    },
                    playerY: {
                      type: 'number',
                      title: 'Y Position',
                      description: 'Expected Y coordinate',
                      default: 0
                    }
                  },
                  required: ['playerX', 'playerY']
                }
              }
            }
          ],
          required: ['playerProperty']
        }
      },
      // Gold condition
      {
        if: {
          properties: {
            conditionType: { const: 'gold' }
          }
        },
        then: {
          properties: {
            goldComparison: {
              type: 'string',
              title: 'Gold Comparison',
              enum: ['greater_equal', 'less_equal', 'equal'],
              default: 'greater_equal',
              format: {
                labels: ['Greater than or equal', 'Less than or equal', 'Equal to']
              }
            },
            goldValueType: {
              type: 'string',
              title: 'Value Type',
              enum: ['constant', 'variable'],
              default: 'constant',
              format: {
                radio: true,
                horizontal: true,
                labels: ['Constant', 'Variable']
              }
            }
          },
          allOf: [
            {
              if: {
                properties: {
                  goldValueType: { const: 'constant' }
                }
              },
              then: {
                properties: {
                  goldAmount: {
                    type: 'number',
                    title: 'Gold Amount',
                    description: 'Amount of gold to compare against',
                    minimum: 0,
                    default: 0
                  }
                },
                required: ['goldAmount']
              },
              else: {
                properties: {
                  goldVariableId: {
                    type: 'string',
                    title: 'Gold Variable',
                    description: 'Variable containing the gold amount to compare against',
                    $ref: '#/functions/variable'
                  }
                },
                required: ['goldVariableId']
              }
            }
          ],
          required: ['goldComparison', 'goldValueType']
        }
      },
      // Item condition
      {
        if: {
          properties: {
            conditionType: { const: 'item' }
          }
        },
        then: {
          properties: {
            itemId: {
              type: 'string',
              title: 'Item',
              description: 'Select an item from the database',
              $ref: '#/functions/item'
            },
            itemComparison: {
              type: 'string',
              title: 'Item Comparison',
              enum: ['has', 'not_has', 'count_greater', 'count_equal'],
              default: 'has',
              format: {
                labels: ['Has item', 'Does not have item', 'Count greater than', 'Count equal to']
              }
            }
          },
          allOf: [
            {
              if: {
                properties: {
                  itemComparison: { const: 'count_greater' }
                }
              },
              then: {
                properties: {
                  itemCount: {
                    type: 'number',
                    title: 'Item Count',
                    description: 'Minimum number of items required',
                    minimum: 1,
                    default: 1
                  }
                },
                required: ['itemCount']
              },
              else: {
                if: {
                  properties: {
                    itemComparison: { const: 'count_equal' }
                  }
                },
                then: {
                  properties: {
                    itemCount: {
                      type: 'number',
                      title: 'Item Count',
                      description: 'Exact number of items required',
                      minimum: 0,
                      default: 1
                    }
                  },
                  required: ['itemCount']
                }
              }
            }
          ],
          required: ['itemId', 'itemComparison']
        }
      },
      // Equipped condition
      {
        if: {
          properties: {
            conditionType: { const: 'equipped' }
          }
        },
        then: {
          properties: {
            itemId: {
              type: 'string',
              title: 'Item',
              description: 'Select an item from the database',
              $ref: '#/functions/item'
            },
            equipped: {
              type: 'boolean',
              title: 'Is Equipped',
              description: 'Whether the item must be equipped',
              default: true
            }
          },
          required: ['itemId']
        }
      }
    ],
    required: ['conditionType']
  };
}

/**
 * Predefined condition type sets for common use cases
 * 
 * These sets provide commonly used combinations of condition types
 * for different scenarios.
 */
export const CONDITION_TYPE_SETS = {
  /** All condition types */
  ALL: ['switch', 'self_switch', 'variable', 'player', 'gold', 'item', 'level', 'equipped'],
  
  /** Basic conditions (switch and variable only) */
  BASIC: ['switch', 'variable'],
  
  /** Switch conditions only */
  SWITCH_ONLY: ['switch'],
  
  /** Variable conditions only */
  VARIABLE_ONLY: ['variable'],
  
  /** Player-related conditions */
  PLAYER: ['player', 'level'],
  
  /** Resource conditions (gold and items) */
  RESOURCES: ['gold', 'item', 'equipped'],
  
  /** Game state conditions */
  GAME_STATE: ['switch', 'variable', 'gold', 'level']
} as const;
