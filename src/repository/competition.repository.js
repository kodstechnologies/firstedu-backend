import Competition from "../models/Competition.js";
import Question from "../models/Question.js";
import { ApiError } from "../utils/ApiError.js";


/**
 * Helper: attach questions into questionBank
 */
const attachQuestionsToCompetition = async (competition) => {

    if (!competition) return competition;

    if (competition.test?.questionBank?._id) {

        const questions = await Question.find({
            questionBank: competition.test.questionBank._id,
            isActive: true
        })
        .sort({ orderInBank: 1 })
        .lean();

        // attach questions inside questionBank
        competition.test.questionBank.questions = questions;
    }

    return competition;
};



/**
 * Create Competition
 */
const create = async (data) => {

    try {

        return await Competition.create(data);

    } catch (error) {

        if (error.code === 11000) {
            throw new ApiError(409, "A competition with this slug already exists");
        }

        throw new ApiError(500, "Failed to create competition", error.message);

    }

};



/**
 * Find Competitions (FULL DATA)
 */
const find = async (filter = {}, options = {}) => {

    const { sort = { createdAt: -1 }, skip = 0, limit = 10 } = options;

    const competitions = await Competition.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate({
            path: "test",
            populate: {
                path: "questionBank"
            }
        })
        .lean();

    // attach questions to each competition
    for (let comp of competitions) {
        await attachQuestionsToCompetition(comp);
    }

    return competitions;

};



/**
 * Find one Competition (FULL DATA)
 */
const findOne = async (filter) => {

    const competition = await Competition.findOne(filter)
        .populate({
            path: "test",
            populate: {
                path: "questionBank"
            }
        })
        .lean();

    return await attachQuestionsToCompetition(competition);

};



/**
 * Find Competition by ID (FULL DATA)
 */
const findById = async (id) => {

    const competition = await Competition.findById(id)
        .populate({
            path: "test",
            populate: {
                path: "questionBank"
            }
        })
        .lean();

    return await attachQuestionsToCompetition(competition);

};



/**
 * Find Competition by Slug (FULL DATA)
 */
const findBySlug = async (slug) => {

    const competition = await Competition.findOne({
        slug: slug.toLowerCase()
    })
        .populate({
            path: "test",
            populate: {
                path: "questionBank"
            }
        })
        .lean();

    return await attachQuestionsToCompetition(competition);

};



/**
 * Update Competition
 */
const updateById = async (id, updateData) => {

    try {

        const competition = await Competition.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        )
        .populate({
            path: "test",
            populate: {
                path: "questionBank"
            }
        })
        .lean();

        return await attachQuestionsToCompetition(competition);

    } catch (error) {

        if (error.code === 11000) {
            throw new ApiError(409, "A competition with this slug already exists");
        }

        throw new ApiError(500, "Failed to update competition", error.message);

    }

};



/**
 * Delete Competition
 */
const deleteById = async (id) => {

    return Competition.findByIdAndDelete(id);

};



/**
 * Count Competitions
 */
const count = async (filter = {}) => {

    return Competition.countDocuments(filter);

};



export default {

    create,
    find,
    findOne,
    findById,
    findBySlug,
    updateById,
    deleteById,
    count,

};