class ApiResponse {
	constructor({ success, message = 'Success', data = null, meta = null } = {}) {
		this.success = Boolean(success);
		this.message = message;
		this.data = data;
		this.meta = meta;
	}

	static success(data = null, message = 'Success', meta = null) {
		return new ApiResponse({ success: true, message, data, meta });
	}

	static error(message = 'Error', data = null, meta = null) {
		return new ApiResponse({ success: false, message, data, meta });
	}
}

export { ApiResponse };
export default ApiResponse;