import GamificationSubcategory from "../models/GamificationSubcategory.js";

class GamificationCategoryRepository {

  async getSubcategoriesByType(type) {
    return await GamificationSubcategory.find({ gamificationType: type }).sort({ createdAt: -1 }).lean();
  }

  async createSubcategory(data) {
    const sub = new GamificationSubcategory(data);
    return await sub.save();
  }

  async updateSubcategory(id, data) {
    return await GamificationSubcategory.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteSubcategory(id) {
    return await GamificationSubcategory.findByIdAndDelete(id);
  }
}

export default new GamificationCategoryRepository();
