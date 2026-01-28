class ApiError extends Error {
	
	constructor(statusCode, message = 'Something went wrong', meta = null, stack = '') {
		
		super(message);

		this.statusCode = statusCode;
		this.meta = meta;

		if (stack) {
			this.stack = stack;
		} else {
			Error.captureStackTrace(this, this.constructor);
		}

		Object.defineProperty(this, 'message', {
			enumerable: true,
			writable: true,
			value: message,
		});
	}

	toJSON() {
		return {
			success: false,
			message: this.message,
			data: null,
			meta: this.meta || null,
		};
	}
}

console.log('ApiError module loaded', ApiError);

export { ApiError };
export default ApiError;