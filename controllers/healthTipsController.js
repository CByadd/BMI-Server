const fs = require('fs');
const path = require('path');

/**
 * Map BMI category from app to JSON key
 */
function mapCategoryToKey(category) {
  const categoryMap = {
    'Underweight': 'underweight_patients',
    'Normal': 'normal_weight',
    'Overweight': 'overweight_patients',
    'Obese': 'obese_patients',
    'Morbidly Obese': 'morbidly_obese_patients'
  };
  
  return categoryMap[category] || categoryMap['Normal']; // Default to Normal if category not found
}

/**
 * Get health tips by BMI category
 * GET /api/health-tips/:category
 */
exports.getHealthTips = async (req, res) => {
  try {
    let { category } = req.params;
    
    if (!category) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Category is required' 
      });
    }
    
    // Decode URL-encoded category (e.g., "Normal" or "Morbidly%20Obese")
    category = decodeURIComponent(category);
    
    // Map category to JSON key
    const categoryKey = mapCategoryToKey(category);
    
    // Read health tips JSON file
    const healthTipsPath = path.join(__dirname, '../data/healthtips.json');
    
    if (!fs.existsSync(healthTipsPath)) {
      console.error('[HEALTH_TIPS] healthtips.json file not found');
      return res.status(500).json({ 
        ok: false, 
        error: 'Health tips data not available' 
      });
    }
    
    const healthTipsData = JSON.parse(fs.readFileSync(healthTipsPath, 'utf8'));
    const healthTips = healthTipsData.health_tips;
    
    if (!healthTips || !healthTips[categoryKey]) {
      console.error(`[HEALTH_TIPS] Category ${categoryKey} not found in health tips`);
      // Fallback to normal_weight if category not found
      const fallbackKey = 'normal_weight';
      if (!healthTips[fallbackKey]) {
        return res.status(404).json({ 
          ok: false, 
          error: 'Health tips not found for this category' 
        });
      }
      return res.json({
        ok: true,
        category: category,
        categoryKey: fallbackKey,
        tips: healthTips[fallbackKey].tips || [],
        description: healthTips[fallbackKey].category_description || ''
      });
    }
    
    const categoryData = healthTips[categoryKey];
    
    return res.json({
      ok: true,
      category: category,
      categoryKey: categoryKey,
      tips: categoryData.tips || [],
      description: categoryData.category_description || ''
    });
    
  } catch (error) {
    console.error('[HEALTH_TIPS] Error fetching health tips:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch health tips',
      message: error.message 
    });
  }
};
