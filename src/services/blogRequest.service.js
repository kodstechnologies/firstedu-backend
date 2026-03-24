import blogRequestRepository from "../repository/blogRequest.repository.js";
import blogRepository from "../repository/blog.repository.js";
import ApiError from "../utils/ApiError.js";
import { uploadImageToCloudinary, deleteFileFromCloudinary } from "../utils/s3Upload.js";

const BLOG_REQUEST_IMAGE_FOLDER = "blog-requests";

/**
 * Submit blog request (optionally with image)
 */
const submitBlogRequest = async (data, file) => {
    let imageUrl = null;
    if (file?.buffer) {
        imageUrl = await uploadImageToCloudinary(
            file.buffer,
            file.originalname,
            BLOG_REQUEST_IMAGE_FOLDER,
            file.mimetype
        );
    }
    return await blogRequestRepository.createBlogRequest({
        ...data,
        image: imageUrl,
        status: "pending",
    });
};

/**
 * Get all blog requests (admin)
 */
const getAllBlogRequests = async (filters) => {
    return await blogRequestRepository.findBlogRequests(filters);
};

/**
 * Get blog request by ID (admin)
 */
const getBlogRequestById = async (id) => {
    const blogRequest = await blogRequestRepository.findById(id);

    if (!blogRequest) {
        throw new ApiError(404, "Blog request not found");
    }

    return blogRequest;
};

/**
 * Update blog request status (admin). When approved, creates a published Blog.
 * When rejected, deletes the request from DB.
 */
const updateBlogRequestStatus = async (id, status) => {
    const blogRequest = await blogRequestRepository.findById(id);

    if (!blogRequest) {
        throw new ApiError(404, "Blog request not found");
    }

    if (status === "rejected") {
        if (blogRequest.image) {
            await deleteFileFromCloudinary(blogRequest.image);
        }
        await blogRequestRepository.deleteById(id);
        return { deleted: true };
    }

    const updated = await blogRequestRepository.updateById(id, { status });

    if (status === "approved") {
        await blogRepository.create({
            title: blogRequest.title,
            description: blogRequest.description,
            subject: blogRequest.subject || "General",
            keyTakeaways: blogRequest.keyTakeaways || [],
            image: blogRequest.image || null,
            source: "user_request",
            blogRequestId: blogRequest._id,
            requestedBy: blogRequest.requestedBy,
            authorName: blogRequest.name,
        });
    }

    return updated;
};

export default {
    submitBlogRequest,
    getAllBlogRequests,
    getBlogRequestById,
    updateBlogRequestStatus,
};
