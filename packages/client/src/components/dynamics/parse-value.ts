import { computed } from "canvasengine";

interface MatchResult {
    property: string;
    fullMatch: string;
    index: number;
}

export const parseDynamicValue = (value: any, object?: any) => {
    if (typeof value !== 'string') {
        return computed(() => String(value ?? ''));
    }

    // Find all dynamic references like {propertyName}
    const pattern = /\{([^}]+)\}/g;
    const matches: MatchResult[] = [];
    let match;
    
    while ((match = pattern.exec(value)) !== null) {
        matches.push({
            property: match[1],
            fullMatch: match[0],
            index: match.index!
        });
    }

    // If no dynamic references found, return simple computed
    if (matches.length === 0) {
        return computed(() => value);
    }

    // Create computed that tracks all referenced signals
    return computed(() => {
        let result = value;
        
        // Replace from end to start to preserve indices
        for (let i = matches.length - 1; i >= 0; i--) {
            const { property, fullMatch } = matches[i];
            
            // Try to access the property from the object
            // Support nested properties like {param.maxHp}
            let propertyValue = '';
            try {
                const propertyPath = property.split('.');
                let currentValue = object;
                
                for (let j = 0; j < propertyPath.length; j++) {
                    const prop = propertyPath[j];
                    
                    // Check if currentValue is a signal (function) and call it
                    if (typeof currentValue === 'function') {
                        currentValue = currentValue();
                    }
                    
                    // Access the property
                    if (currentValue && typeof currentValue === 'object' && prop in currentValue) {
                        currentValue = currentValue[prop];
                    } else {
                        currentValue = undefined;
                        break;
                    }
                }
                
                // If the final value is a signal, call it
                if (typeof currentValue === 'function') {
                    currentValue = currentValue();
                }
                
                propertyValue = currentValue != null ? String(currentValue) : '';
            } catch (error) {
                // If property doesn't exist or can't be accessed, use empty string
                propertyValue = '';
            }
            
            result = result.replace(fullMatch, propertyValue);
        }
        
        return result;
    });
};
