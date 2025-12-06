// Nutrient Calculation Algorithm Types
// These enums define the available calculation algorithms for various nutrients

export enum FatBreakdownAlgorithm {
    AHA_GUIDELINES = 'AHA_GUIDELINES', // American Heart Association - Heart-healthy focus
    KETO_ADAPTED = 'KETO_ADAPTED', // Keto/Low-carb optimized fat distribution
    MEDITERRANEAN = 'MEDITERRANEAN', // Mediterranean diet pattern
}

export enum MineralCalculationAlgorithm {
    RDA_STANDARD = 'RDA_STANDARD', // USDA Recommended Dietary Allowance (age/sex-based)
    ATHLETIC_PERFORMANCE = 'ATHLETIC_PERFORMANCE', // Higher targets for athletes
    HEART_HEALTH = 'HEART_HEALTH', // Lower sodium, higher potassium
}

export enum VitaminCalculationAlgorithm {
    RDA_STANDARD = 'RDA_STANDARD', // USDA RDA
    IMMUNE_SUPPORT = 'IMMUNE_SUPPORT', // Higher Vitamin C and A for immune function
    ANTIOXIDANT_FOCUS = 'ANTIOXIDANT_FOCUS', // Emphasis on antioxidant vitamins
}

export enum SugarCalculationAlgorithm {
    WHO_GUIDELINES = 'WHO_GUIDELINES', // WHO recommendation: max 10% of calories
    LOW_CARB_KETO = 'LOW_CARB_KETO', // Strict low-carb: max 5% of calories
    BALANCED = 'BALANCED', // Moderate: max 15% of calories
}

// Helper type for algorithm display names
export const FatBreakdownAlgorithmLabels: Record<FatBreakdownAlgorithm, string> = {
    [FatBreakdownAlgorithm.AHA_GUIDELINES]: 'AHA Guidelines (Heart Health)',
    [FatBreakdownAlgorithm.KETO_ADAPTED]: 'Keto-Adapted',
    [FatBreakdownAlgorithm.MEDITERRANEAN]: 'Mediterranean Diet',
};

export const MineralCalculationAlgorithmLabels: Record<MineralCalculationAlgorithm, string> = {
    [MineralCalculationAlgorithm.RDA_STANDARD]: 'RDA Standard (Age/Sex-Based)',
    [MineralCalculationAlgorithm.ATHLETIC_PERFORMANCE]: 'Athletic Performance',
    [MineralCalculationAlgorithm.HEART_HEALTH]: 'Heart Health (Low Sodium)',
};

export const VitaminCalculationAlgorithmLabels: Record<VitaminCalculationAlgorithm, string> = {
    [VitaminCalculationAlgorithm.RDA_STANDARD]: 'RDA Standard',
    [VitaminCalculationAlgorithm.IMMUNE_SUPPORT]: 'Immune Support',
    [VitaminCalculationAlgorithm.ANTIOXIDANT_FOCUS]: 'Antioxidant Focus',
};

export const SugarCalculationAlgorithmLabels: Record<SugarCalculationAlgorithm, string> = {
    [SugarCalculationAlgorithm.WHO_GUIDELINES]: 'WHO Guidelines (10% max)',
    [SugarCalculationAlgorithm.LOW_CARB_KETO]: 'Low-Carb/Keto (5% max)',
    [SugarCalculationAlgorithm.BALANCED]: 'Balanced (15% max)',
};
